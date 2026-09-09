const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  dialog,
  screen,
  nativeImage,
  protocol,
} = require('electron');
const os = require('os');
const { createCloseController } = require('./closeController');
const { createIpcRegistry } = require('./ipcRegistry');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { getDb } = require('../db/index');
const { runMigrations } = require('../db/migrations');
const songQueries = require('../db/queries/songs');
const presentationQueries = require('../db/queries/presentations');
const mediaQueries = require('../db/queries/media');
const journalQueries = require('../db/queries/journal');
const versionQueries = require('../db/queries/versions');

const isDev = !app.isPackaged;

// Where to load the renderer from. `electron-vite dev` sets this to the dev
// server's URL; nothing else does. When it is absent — packaged app,
// `npm run preview`, or Playwright E2E launching out/main/index.js — the built
// renderer is loaded from disk. Gating this on `app.isPackaged` was wrong: it
// is false in preview and E2E too, which sent both to a dev server that was
// not running. Guarded by electron/main/__tests__/rendererLoading.test.ts.
const RENDERER_DEV_URL = process.env.ELECTRON_RENDERER_URL || null;
const MEDIA_PROTOCOL_SCHEME = 'presenterpro-media';

protocol.registerSchemesAsPrivileged([
  {
    scheme: MEDIA_PROTOCOL_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

let mainWindow = null;
let outputWindow = null;
let stageDisplayWindow = null;
let outputReady = false;
let stageDisplayReady = false;
let outputState = { isBlack: false, isLogo: false };
let countdownState = { active: false, endAt: null, durationSeconds: 0 };
let countdownInterval = null;
let outputReadyResolvers = [];
let stageDisplayReadyResolvers = [];
let presentationSessionSlides = [];
let currentStageSlide = null;
let currentStageBackground = null;
let mainWindowResponsive = true;

// Window-close / app-quit decision logic lives in a pure, tested state machine
// (electron/main/closeController.ts). Keeping it out of this file is what makes
// the quit behavior verifiable at all — see its header for the three
// properties it guarantees.
const closeController = createCloseController();

// Set when a quit was deferred so the unsaved-changes prompt could run. The
// `closed` handler re-issues the quit once the renderer approves the close.
let quitRequested = false;

function emitWindowViewState(win) {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('window:viewState', {
    isFullScreen: win.isFullScreen(),
  });
}

function normalizeMediaFilePath(filePath) {
  const resolved = path.normalize(path.resolve(filePath));
  return process.platform === 'win32' ? resolved.replace(/\//g, '\\') : resolved;
}

function canonicalizeMediaFilePath(filePath) {
  const normalized = normalizeMediaFilePath(filePath);
  const slashNormalized = normalized.replace(/\\/g, '/');
  return process.platform === 'win32' ? slashNormalized.toLowerCase() : slashNormalized;
}

function mediaPathExists(filePath) {
  try {
    return Boolean(filePath && fs.existsSync(filePath));
  } catch {
    return false;
  }
}

function toMediaProtocolUrl(filePath) {
  if (!filePath) return null;
  try {
    const normalized = normalizeMediaFilePath(filePath);
    return `${MEDIA_PROTOCOL_SCHEME}://asset?path=${encodeURIComponent(normalized)}`;
  } catch {
    return null;
  }
}

function getMediaContentType(filePath) {
  const ext = path.extname(filePath || '').toLowerCase();
  const contentTypes = {
    '.apng': 'image/apng',
    '.avif': 'image/avif',
    '.gif': 'image/gif',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.m4v': 'video/mp4',
    '.mov': 'video/quicktime',
    '.mp4': 'video/mp4',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webm': 'video/webm',
    '.webp': 'image/webp',
  };
  return contentTypes[ext] || 'application/octet-stream';
}

function invalidRangeResponse(fileSize) {
  return new Response(null, {
    status: 416,
    headers: {
      'accept-ranges': 'bytes',
      'content-range': `bytes */${fileSize}`,
    },
  });
}

function parseMediaByteRange(rangeHeader, fileSize) {
  if (!rangeHeader) return null;

  const match = /^bytes=(\d*)-(\d*)$/i.exec(String(rangeHeader).trim());
  if (!match) return { valid: false };

  const hasStart = match[1] !== '';
  const hasEnd = match[2] !== '';
  if (!hasStart && !hasEnd) return { valid: false };

  let start = hasStart ? Number(match[1]) : null;
  let end = hasEnd ? Number(match[2]) : null;

  if ((hasStart && !Number.isFinite(start)) || (hasEnd && !Number.isFinite(end))) {
    return { valid: false };
  }

  if (!hasStart) {
    const suffixLength = end;
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) return { valid: false };
    start = Math.max(fileSize - suffixLength, 0);
    end = fileSize - 1;
  } else {
    if (!Number.isInteger(start) || start < 0 || start >= fileSize) return { valid: false };
    if (!hasEnd || end >= fileSize) end = fileSize - 1;
    if (!Number.isInteger(end) || end < start) return { valid: false };
  }

  return { valid: true, start, end };
}

function createMediaProtocolResponse(filePath, request) {
  const stats = fs.statSync(filePath);
  const fileSize = stats.size;
  const contentType = getMediaContentType(filePath);
  const rangeHeader = request.headers.get('range');
  const method = String(request.method || 'GET').toUpperCase();
  const isHead = method === 'HEAD';

  if (rangeHeader) {
    const parsedRange = parseMediaByteRange(rangeHeader, fileSize);
    if (!parsedRange?.valid) return invalidRangeResponse(fileSize);

    const { start, end } = parsedRange;
    const contentLength = end - start + 1;
    const headers = {
      'accept-ranges': 'bytes',
      'content-type': contentType,
      'content-length': String(contentLength),
      'content-range': `bytes ${start}-${end}/${fileSize}`,
    };

    if (isHead) {
      return new Response(null, { status: 206, headers });
    }

    const stream = Readable.toWeb(fs.createReadStream(filePath, { start, end }));
    return new Response(stream, { status: 206, headers });
  }

  const headers = {
    'accept-ranges': 'bytes',
    'content-type': contentType,
    'content-length': String(fileSize),
  };

  if (isHead) {
    return new Response(null, { status: 200, headers });
  }

  const stream = Readable.toWeb(fs.createReadStream(filePath));
  return new Response(stream, { status: 200, headers });
}

function resolveMediaProtocolPath(requestUrl) {
  try {
    const parsed = new URL(requestUrl);
    if (parsed.hostname !== 'asset') return null;

    const requestedPath = parsed.searchParams.get('path');
    if (!requestedPath || !path.isAbsolute(requestedPath)) return null;

    const normalized = normalizeMediaFilePath(requestedPath);
    if (!mediaPathExists(normalized)) return null;

    const stats = fs.statSync(normalized);
    return stats.isFile() ? normalized : null;
  } catch {
    return null;
  }
}

function registerMediaProtocol() {
  protocol.handle(MEDIA_PROTOCOL_SCHEME, async (request) => {
    const resolvedPath = resolveMediaProtocolPath(request.url);
    if (!resolvedPath) {
      return new Response('Media not found.', { status: 404 });
    }

    try {
      return createMediaProtocolResponse(resolvedPath, request);
    } catch {
      return new Response('Failed to read media.', { status: 500 });
    }
  });
}

function serializeMediaRecord(item) {
  if (!item) return item;

  const fileExists = mediaPathExists(item.file_path);
  const thumbnailExists = mediaPathExists(item.thumbnail_path);

  return {
    ...item,
    canonical_path:
      item.canonical_path || (item.file_path ? canonicalizeMediaFilePath(item.file_path) : null),
    file_exists: fileExists,
    thumbnail_exists: thumbnailExists,
    file_url: fileExists ? toMediaProtocolUrl(item.file_path) : null,
    thumbnail_url: thumbnailExists ? toMediaProtocolUrl(item.thumbnail_path) : null,
    preview_url: thumbnailExists
      ? toMediaProtocolUrl(item.thumbnail_path)
      : fileExists
        ? toMediaProtocolUrl(item.file_path)
        : null,
  };
}

function syncMediaCanonicalPaths(db) {
  const items = mediaQueries.getMedia(db);
  const updateCanonicalPath = db.prepare('UPDATE media SET canonical_path = ? WHERE id = ?');
  const tx = db.transaction((records) => {
    records.forEach((item) => {
      const nextCanonicalPath = item.file_path ? canonicalizeMediaFilePath(item.file_path) : null;
      if (item.canonical_path !== nextCanonicalPath) {
        updateCanonicalPath.run(nextCanonicalPath, item.id);
      }
    });
  });
  tx(items);
}

function resolveRuntimeAssetPath(...segments) {
  const candidates = [
    path.join(process.resourcesPath, ...segments),
    path.join(app.getAppPath(), ...segments),
    path.join(__dirname, '../../', ...segments),
  ];

  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || null;
}

function resolveBuiltInMediaAssetPath(assetName) {
  if (!assetName) return null;

  const candidates = [
    path.join('test-media', assetName),
    path.join('..', 'test-media', assetName),
    path.join('public', 'test-media', assetName),
  ];

  for (const candidate of candidates) {
    const resolved = resolveRuntimeAssetPath(candidate);
    if (resolved) return resolved;
  }

  return null;
}

function resolveWindowIcon() {
  const iconPath = resolveRuntimeAssetPath(
    'public',
    'icons',
    process.platform === 'win32' ? 'app-icon.ico' : 'app-icon.png'
  );
  if (!iconPath) return undefined;
  const image = nativeImage.createFromPath(iconPath);
  return image.isEmpty() ? undefined : image;
}

const appWindowIcon = resolveWindowIcon();

function resolveReadyQueue(queue) {
  queue.forEach((resolve) => resolve({ success: true }));
  queue.length = 0;
}

function markOutputReady() {
  outputReady = true;
  resolveReadyQueue(outputReadyResolvers);
}

function markStageDisplayReady() {
  stageDisplayReady = true;
  resolveReadyQueue(stageDisplayReadyResolvers);
}

function waitForReady(kind) {
  if (kind === 'stage') {
    if (stageDisplayReady) return Promise.resolve({ success: true });
    return new Promise((resolve) => stageDisplayReadyResolvers.push(resolve));
  }

  if (outputReady) return Promise.resolve({ success: true });
  return new Promise((resolve) => outputReadyResolvers.push(resolve));
}

function resetOutputState() {
  outputState = { isBlack: false, isLogo: false };
}

function broadcast(channel, payload) {
  if (outputWindow) outputWindow.webContents.send(channel, payload);
  if (stageDisplayWindow) stageDisplayWindow.webContents.send(channel, payload);
  if (mainWindow) mainWindow.webContents.send(channel, payload);
}

function notifyMainWindow(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function getPreviewWindowState() {
  return {
    outputOpen: Boolean(outputWindow && !outputWindow.isDestroyed()),
    stageOpen: Boolean(stageDisplayWindow && !stageDisplayWindow.isDestroyed()),
  };
}

function publishPreviewWindowState(kind, open) {
  notifyMainWindow('preview:windowState', { kind, open });
}

function getSettingValue(db, key) {
  return db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value ?? null;
}

function getConfiguredDisplay(settingKey) {
  const db = getDb();
  const rawValue = getSettingValue(db, settingKey);
  if (!rawValue) return null;

  const displayId = Number(rawValue);
  if (!Number.isFinite(displayId)) return null;

  return screen.getAllDisplays().find((display) => display.id === displayId) || null;
}

function applyDisplayAssignment(win, settingKey) {
  const display = getConfiguredDisplay(settingKey);
  if (!win || win.isDestroyed() || !display) return false;
  win.setBounds(display.bounds);
  win.setFullScreen(true);
  return true;
}

function getNextStageSlide(slide) {
  if (!slide || !presentationSessionSlides.length) return null;
  const index = presentationSessionSlides.findIndex(
    (item) => item.id === slide.id && item.sectionId === slide.sectionId
  );
  if (index === -1) return null;
  return presentationSessionSlides[index + 1] || null;
}

function syncStageDisplay() {
  if (!stageDisplayWindow || stageDisplayWindow.isDestroyed()) return;
  stageDisplayWindow.webContents.send('stage:update', {
    currentSlide: currentStageSlide,
    nextSlide: getNextStageSlide(currentStageSlide),
    background: currentStageBackground,
  });
}

function syncOutputState() {
  broadcast('output:black', { active: outputState.isBlack });
  broadcast('output:logo', { active: outputState.isLogo });
}

function clearCountdownInterval() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}

function syncCountdownState() {
  broadcast('output:countdown', countdownState);
}

function resetCountdownState() {
  clearCountdownInterval();
  countdownState = { active: false, endAt: null, durationSeconds: 0 };
}

function resetMainWindowCloseRequestState() {
  closeController.resolveRequest();
}

function closePreviewWindows() {
  if (outputWindow && !outputWindow.isDestroyed()) {
    outputWindow.close();
  }
  if (stageDisplayWindow && !stageDisplayWindow.isDestroyed()) {
    stageDisplayWindow.close();
  }
}

// A crashed output or stage renderer is a blank projector mid-service. Reload
// it; the renderer's ready handshake ('output:ready' / 'stage:ready') then
// re-syncs the live slide and state (plan C1).
function recoverPreviewRenderer(kind, win, details) {
  console.error(`[main] ${kind} render process gone:`, details?.reason);
  if (details?.reason === 'clean-exit') return;
  if (!win || win.isDestroyed()) return;
  win.webContents.reload();
}

function prepareForAppShutdown() {
  closeController.markQuitting();
  clearCountdownInterval();
  closePreviewWindows();
}

function startCountdown(durationSeconds) {
  const sanitized = Math.max(1, Number(durationSeconds) || 0);
  resetCountdownState();
  countdownState = {
    active: true,
    endAt: Date.now() + sanitized * 1000,
    durationSeconds: sanitized,
  };
  countdownInterval = setInterval(() => {
    if (!countdownState.active) return;
    if (Date.now() >= countdownState.endAt) {
      resetCountdownState();
      syncCountdownState();
    }
  }, 250);
}

function getProfileData() {
  const username = os.userInfo().username || 'local';
  const parts = username.split(/[._-]+/).filter(Boolean);
  const displayName =
    parts.length > 1
      ? parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
      : username.charAt(0).toUpperCase() + username.slice(1);
  const initials = (parts.length ? parts : [username])
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

  return {
    username,
    displayName,
    initials: initials || username.slice(0, 2).toUpperCase(),
    subtitle: 'On this device',
  };
}

// ─── Seed Data ──────────────────────────────────────────────────────────────

function generateId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function seed(db) {
  const initialized = db.prepare("SELECT value FROM settings WHERE key = 'initialized'").get();
  if (initialized) return;

  const songs = [
    {
      title: 'Amazing Grace',
      artist: 'John Newton',
      ccli: '4755360',
      tags: '["hymn","classic"]',
      slides: JSON.stringify([
        {
          id: generateId(),
          type: 'verse',
          label: 'Verse 1',
          body: 'Amazing grace how sweet the sound\nThat saved a wretch like me\nI once was lost but now am found\nWas blind but now I see',
          notes: '',
          backgroundId: null,
          textStyle: { size: 52, align: 'center', valign: 'center', color: '#ffffff', bold: false },
        },
        {
          id: generateId(),
          type: 'verse',
          label: 'Verse 2',
          body: 'Twas grace that taught my heart to fear\nAnd grace my fears relieved\nHow precious did that grace appear\nThe hour I first believed',
          notes: '',
          backgroundId: null,
          textStyle: { size: 52, align: 'center', valign: 'center', color: '#ffffff', bold: false },
        },
        {
          id: generateId(),
          type: 'chorus',
          label: 'Chorus',
          body: "My chains are gone\nI've been set free\nMy God my Savior has ransomed me",
          notes: '',
          backgroundId: null,
          textStyle: { size: 52, align: 'center', valign: 'center', color: '#ffffff', bold: false },
        },
      ]),
    },
    {
      title: 'How Great Is Our God',
      artist: 'Chris Tomlin',
      ccli: '4348399',
      tags: '["contemporary","worship"]',
      slides: JSON.stringify([
        {
          id: generateId(),
          type: 'verse',
          label: 'Verse 1',
          body: 'The splendor of the King\nClothed in majesty\nLet all the earth rejoice\nAll the earth rejoice',
          notes: '',
          backgroundId: null,
          textStyle: { size: 52, align: 'center', valign: 'center', color: '#ffffff', bold: false },
        },
        {
          id: generateId(),
          type: 'chorus',
          label: 'Chorus',
          body: 'How great is our God\nSing with me\nHow great is our God\nAnd all will see\nHow great how great is our God',
          notes: '',
          backgroundId: null,
          textStyle: { size: 52, align: 'center', valign: 'center', color: '#ffffff', bold: false },
        },
        {
          id: generateId(),
          type: 'bridge',
          label: 'Bridge',
          body: 'Name above all names\nWorthy of all praise\nMy heart will sing\nHow great is our God',
          notes: '',
          backgroundId: null,
          textStyle: { size: 52, align: 'center', valign: 'center', color: '#ffffff', bold: false },
        },
      ]),
    },
    {
      title: 'Build My Life',
      artist: 'Housefires',
      ccli: '7070345',
      tags: '["contemporary","worship"]',
      slides: JSON.stringify([
        {
          id: generateId(),
          type: 'verse',
          label: 'Verse 1',
          body: 'Worthy of every song we could ever sing\nWorthy of all the praise we could ever bring\nWorthy of every breath we could ever breathe\nWe live for you',
          notes: '',
          backgroundId: null,
          textStyle: { size: 52, align: 'center', valign: 'center', color: '#ffffff', bold: false },
        },
        {
          id: generateId(),
          type: 'chorus',
          label: 'Chorus',
          body: 'Holy there is no one like you\nThere is none beside you\nOpen up my eyes in wonder\nAnd show me who you are',
          notes: '',
          backgroundId: null,
          textStyle: { size: 52, align: 'center', valign: 'center', color: '#ffffff', bold: false },
        },
      ]),
    },
  ];

  const sectionColors = ['#4a7cff', '#7c3aed', '#db2777'];
  const insertedSongs = songs.map((s) => songQueries.createSong(db, s));

  // Default presentation using all 3 songs as sections
  const sections = insertedSongs.map((song, i) => {
    // `song.slides` was stringified a few lines above by this same function;
    // if it does not parse, the seeder is broken and the first launch must say so.
    const slides = JSON.parse(song.slides);
    return {
      id: generateId(),
      title: song.title,
      type: 'song',
      color: sectionColors[i],
      collapsed: false,
      slides,
      backgroundId: null,
    };
  });

  presentationQueries.createPresentation(db, {
    title: 'Sunday Morning Service',
    sections,
  });

  db.prepare("INSERT INTO settings (key, value) VALUES ('initialized', 'true')").run();
}

// ─── Window Creation ─────────────────────────────────────────────────────────

function createMainWindow() {
  const preloadPath = isDev
    ? path.join(__dirname, '../../out/preload/index.js')
    : path.join(__dirname, '../preload/index.js');
  const isMac = process.platform === 'darwin';

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 800,
    minWidth: 1200,
    minHeight: 700,
    frame: true,
    autoHideMenuBar: !isMac,
    icon: appWindowIcon,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (RENDERER_DEV_URL) {
    mainWindow.loadURL(RENDERER_DEV_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../out/renderer/index.html'));
  }

  mainWindow.on('close', (event) => {
    const decision = closeController.decideClose({
      responsive: mainWindowResponsive,
      crashed: mainWindow.webContents.isCrashed(),
      now: Date.now(),
    });

    // Allow: let the default close proceed. This is the path a quit takes —
    // preventing it here is what used to cancel Cmd+Q entirely.
    if (decision.action === 'allow') {
      return;
    }

    if (decision.action === 'prompt-force') {
      const choice = dialog.showMessageBoxSync(mainWindow, {
        type: 'warning',
        buttons: ['Cancel', 'Force Close'],
        defaultId: 0,
        cancelId: 0,
        title: 'PresenterPro Is Not Responding',
        message: 'PresenterPro is not responding.',
        detail: 'Force closing may discard unsaved changes.',
      });
      event.preventDefault();
      if (choice === 1) {
        prepareForAppShutdown();
        app.quit();
      }
      return;
    }

    // Block: hand control to the renderer so it can prompt about unsaved
    // changes. The controller guarantees this cannot wait forever.
    event.preventDefault();
    if (decision.askRenderer) {
      mainWindow?.webContents.send('app:command', 'window:requestClose');
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    closeController.reset();

    // A deferred quit (see app.on('before-quit')) resumes here, now that the
    // renderer has approved the close.
    if (quitRequested) {
      quitRequested = false;
      prepareForAppShutdown();
      app.quit();
    }
    mainWindowResponsive = true;
    closePreviewWindows();
  });

  // A dead renderer can never answer the close handshake, so record it or the
  // window would be stranded waiting for a reply that cannot come.
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[main] render process gone:', details?.reason);
    closeController.markRendererGone();
  });

  mainWindow.on('unresponsive', () => {
    mainWindowResponsive = false;
  });

  mainWindow.on('responsive', () => {
    mainWindowResponsive = true;
  });
}

function setWindowedPreviewBounds(win) {
  if (!win) return;
  win.setFullScreen(false);
  win.setBounds({ width: 1280, height: 720 });
  win.center();
}

function createOutputWindow({ displayId = null, useConfiguredDisplay = true } = {}) {
  if (outputWindow) {
    if (typeof displayId === 'number') {
      const display = screen.getAllDisplays().find((d) => d.id === displayId);
      if (display) {
        outputWindow.setBounds(display.bounds);
        outputWindow.setFullScreen(true);
      }
    } else if (useConfiguredDisplay) {
      applyDisplayAssignment(outputWindow, 'output.mainDisplayId');
    } else {
      setWindowedPreviewBounds(outputWindow);
    }

    if (!outputWindow.isVisible()) outputWindow.showInactive();
    emitWindowViewState(outputWindow);
    publishPreviewWindowState('output', true);
    mainWindow?.focus();
    return;
  }

  outputReady = false;
  resetOutputState();

  outputWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    title: 'Output',
    frame: false,
    show: false,
    icon: appWindowIcon,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  outputWindow.once('ready-to-show', () => {
    if (!outputWindow) return;
    if (typeof displayId === 'number') {
      const display = screen.getAllDisplays().find((d) => d.id === displayId);
      if (display) {
        outputWindow.setBounds(display.bounds);
        outputWindow.setFullScreen(true);
      }
    } else if (useConfiguredDisplay) {
      applyDisplayAssignment(outputWindow, 'output.mainDisplayId');
    } else {
      setWindowedPreviewBounds(outputWindow);
    }
    outputWindow.showInactive();
    emitWindowViewState(outputWindow);
    publishPreviewWindowState('output', true);
    mainWindow?.focus();
  });

  if (RENDERER_DEV_URL) {
    outputWindow.loadURL(`${RENDERER_DEV_URL}/#/output`);
  } else {
    outputWindow.loadFile(path.join(__dirname, '../../out/renderer/index.html'), {
      hash: '/output',
    });
  }

  outputWindow.on('closed', () => {
    outputWindow = null;
    outputReady = false;
    outputReadyResolvers = [];
    resetOutputState();
    resetCountdownState();
    publishPreviewWindowState('output', false);
    notifyMainWindow('preview:windowClosed', { kind: 'output' });
  });
  outputWindow.webContents.on('render-process-gone', (_event, details) => {
    recoverPreviewRenderer('output', outputWindow, details);
  });

  outputWindow.on('enter-full-screen', () => emitWindowViewState(outputWindow));
  outputWindow.on('leave-full-screen', () => emitWindowViewState(outputWindow));
}

function createStageDisplayWindow(options = {}) {
  const { onlyIfAssigned = false, displayId = null, useConfiguredDisplay = true } = options;
  const assignedDisplay =
    typeof displayId === 'number'
      ? screen.getAllDisplays().find((d) => d.id === displayId) || null
      : useConfiguredDisplay
        ? getConfiguredDisplay('output.stageDisplayId')
        : null;
  if (onlyIfAssigned && !assignedDisplay) {
    return { opened: false, assigned: false };
  }

  if (stageDisplayWindow) {
    if (assignedDisplay) {
      stageDisplayWindow.setBounds(assignedDisplay.bounds);
      stageDisplayWindow.setFullScreen(true);
    } else {
      stageDisplayWindow.setFullScreen(false);
    }
    if (!stageDisplayWindow.isVisible()) stageDisplayWindow.showInactive();
    emitWindowViewState(stageDisplayWindow);
    publishPreviewWindowState('stage', true);
    return { opened: true, assigned: Boolean(assignedDisplay) };
  }

  stageDisplayReady = false;

  stageDisplayWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    title: 'Stage Display',
    frame: false,
    show: false,
    backgroundColor: '#000000',
    icon: appWindowIcon,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  stageDisplayWindow.once('ready-to-show', () => {
    if (!stageDisplayWindow) return;
    if (assignedDisplay) {
      stageDisplayWindow.setBounds(assignedDisplay.bounds);
      stageDisplayWindow.setFullScreen(true);
    } else if (useConfiguredDisplay) {
      applyDisplayAssignment(stageDisplayWindow, 'output.stageDisplayId');
    } else {
      stageDisplayWindow.setFullScreen(false);
    }
    stageDisplayWindow.showInactive();
    emitWindowViewState(stageDisplayWindow);
    publishPreviewWindowState('stage', true);
  });

  if (RENDERER_DEV_URL) {
    stageDisplayWindow.loadURL(`${RENDERER_DEV_URL}/#/stage-display`);
  } else {
    stageDisplayWindow.loadFile(path.join(__dirname, '../../out/renderer/index.html'), {
      hash: '/stage-display',
    });
  }

  stageDisplayWindow.on('closed', () => {
    stageDisplayWindow = null;
    stageDisplayReady = false;
    stageDisplayReadyResolvers = [];
    publishPreviewWindowState('stage', false);
    notifyMainWindow('preview:windowClosed', { kind: 'stage' });
  });
  stageDisplayWindow.webContents.on('render-process-gone', (_event, details) => {
    recoverPreviewRenderer('stage', stageDisplayWindow, details);
  });

  stageDisplayWindow.on('enter-full-screen', () => emitWindowViewState(stageDisplayWindow));
  stageDisplayWindow.on('leave-full-screen', () => emitWindowViewState(stageDisplayWindow));

  return { opened: true, assigned: Boolean(assignedDisplay) };
}

// ─── IPC Handlers ────────────────────────────────────────────────────────────

function registerIpcHandlers() {
  const db = getDb();
  // Every channel goes through the registry (plan B1): unknown channels are
  // rejected, throws and non-envelopes become failure envelopes, and
  // assertComplete() below fails the launch if a contract channel is missing.
  const ipc = createIpcRegistry(ipcMain);

  // Window controls
  ipc.handle('window:close', () => {
    if (mainWindow) {
      // The renderer resolved unsaved changes and approved the close. This
      // permission is single-use, so a later close still gets the prompt.
      closeController.allowNextClose();
      mainWindow.close();
    }
  });
  ipc.on('window:closeRequestResolved', () => {
    // The user cancelled the save prompt. Any quit that was waiting on this
    // handshake is cancelled too, or a later window close would quit the app.
    quitRequested = false;
    resetMainWindowCloseRequestState();
  });
  ipc.handle('window:minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });
  ipc.handle('window:maximize', () => {
    if (mainWindow) {
      mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
    }
  });
  ipc.handle('window:getViewState', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return {
      success: true,
      data: {
        isFullScreen: Boolean(win?.isFullScreen?.()),
      },
    };
  });
  ipc.handle('preview:getState', () => {
    return {
      success: true,
      data: getPreviewWindowState(),
    };
  });

  // Presentations
  ipc.handle('db:presentations:getAll', () => {
    try {
      return { success: true, data: presentationQueries.getPresentations(db) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  ipc.handle('db:presentations:get', (_, id) => {
    try {
      return { success: true, data: presentationQueries.getPresentation(db, id) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  ipc.handle('db:presentations:create', (_, data) => {
    try {
      return { success: true, data: presentationQueries.createPresentation(db, data) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  ipc.handle('db:presentations:update', (_, id, data) => {
    try {
      return { success: true, data: presentationQueries.updatePresentation(db, id, data) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Crash-recovery journal (plan A2). Same envelope as every other handler.
  ipc.handle('db:journal:list', () => {
    try {
      return { success: true, data: journalQueries.listJournals(db) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  ipc.handle('db:journal:delete', (_, presentationId) => {
    try {
      return { success: true, data: journalQueries.deleteJournal(db, presentationId) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  ipc.handle('db:versions:write', (_, data) => {
    try {
      return { success: true, data: versionQueries.writeVersion(db, data) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  ipc.handle('db:versions:latest', (_, presentationId) => {
    try {
      return { success: true, data: versionQueries.getLatestVersion(db, presentationId) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  ipc.handle('db:versions:list', (_, presentationId) => {
    try {
      return { success: true, data: versionQueries.listVersions(db, presentationId) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  ipc.handle('db:versions:deleteFor', (_, presentationId) => {
    try {
      return { success: true, data: versionQueries.deleteVersionsFor(db, presentationId) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  ipc.handle('db:presentations:touch', (_, id) => {
    try {
      return { success: true, data: presentationQueries.touchPresentation(db, id) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  ipc.handle('db:presentations:delete', (_, id) => {
    try {
      presentationQueries.deletePresentation(db, id);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Songs
  ipc.handle('db:songs:getAll', () => {
    try {
      return { success: true, data: songQueries.getSongs(db) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  ipc.handle('db:songs:create', (_, data) => {
    try {
      return { success: true, data: songQueries.createSong(db, data) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  ipc.handle('db:songs:update', (_, id, data) => {
    try {
      return { success: true, data: songQueries.updateSong(db, id, data) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  ipc.handle('db:songs:delete', (_, id) => {
    try {
      songQueries.deleteSong(db, id);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Media
  ipc.handle('db:media:getAll', () => {
    try {
      return { success: true, data: mediaQueries.getMedia(db).map(serializeMediaRecord) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  ipc.handle('db:mediaFolders:getAll', () => {
    try {
      return { success: true, data: mediaQueries.getMediaFolders(db) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  ipc.handle('db:mediaFolders:create', (_, data) => {
    try {
      return { success: true, data: mediaQueries.createMediaFolder(db, data) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  ipc.handle('db:media:create', (_, data) => {
    try {
      const normalized = data?.file_path
        ? normalizeMediaFilePath(data.file_path)
        : (data?.file_path ?? null);
      const thumbnailPath = data?.thumbnail_path
        ? normalizeMediaFilePath(data.thumbnail_path)
        : (data?.thumbnail_path ?? null);
      const created = mediaQueries.createMedia(db, {
        ...data,
        file_path: normalized,
        canonical_path: normalized ? canonicalizeMediaFilePath(normalized) : null,
        thumbnail_path: thumbnailPath,
      });
      return { success: true, data: serializeMediaRecord(created) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  ipc.handle('db:mediaFolders:update', (_, id, data) => {
    try {
      return { success: true, data: mediaQueries.updateMediaFolder(db, id, data) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  ipc.handle('db:mediaFolders:delete', (_, id) => {
    try {
      mediaQueries.deleteMediaFolder(db, id);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  ipc.handle('media:import', async (_, options = {}) => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'Media', extensions: ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'mov', 'webm'] },
        ],
      });
      if (result.canceled) return { success: true, data: [] };
      const inserted = result.filePaths.flatMap((filePath) => {
        const absPath = normalizeMediaFilePath(filePath);
        if (!mediaPathExists(absPath)) return [];
        const canonicalPath = canonicalizeMediaFilePath(absPath);
        const existing = mediaQueries
          .getMedia(db)
          .find((item) => item.canonical_path === canonicalPath);
        if (existing) return [serializeMediaRecord(existing)];
        const name = path.basename(absPath);
        const ext = path.extname(absPath).toLowerCase().slice(1);
        const type = ['mp4', 'mov', 'webm'].includes(ext) ? 'video' : 'image';
        const created = mediaQueries.createMedia(db, {
          name,
          type,
          file_path: absPath,
          canonical_path: canonicalPath,
          folder_id: options?.folderId ?? null,
        });
        return [serializeMediaRecord(created)];
      });
      return { success: true, data: inserted };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  ipc.handle('media:pick', async (_, { kind }) => {
    try {
      const filters =
        kind === 'video'
          ? [{ name: 'Videos', extensions: ['mp4', 'mov', 'webm'] }]
          : [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }];

      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters,
      });
      if (result.canceled || !result.filePaths?.length) return { success: true, data: null };

      const filePath = normalizeMediaFilePath(result.filePaths[0]);
      if (!mediaPathExists(filePath)) {
        return { success: false, error: 'The selected media file could not be found.' };
      }
      const canonicalPath = canonicalizeMediaFilePath(filePath);
      const existing = mediaQueries
        .getMedia(db)
        .find((item) => item.canonical_path === canonicalPath);
      if (existing) return { success: true, data: serializeMediaRecord(existing) };

      const name = path.basename(filePath);
      const ext = path.extname(filePath).toLowerCase().slice(1);
      const type = ['mp4', 'mov', 'webm'].includes(ext) ? 'video' : 'image';
      const inserted = mediaQueries.createMedia(db, {
        name,
        type,
        file_path: filePath,
        canonical_path: canonicalPath,
      });
      return { success: true, data: serializeMediaRecord(inserted) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  ipc.handle('db:media:update', (_, id, data) => {
    try {
      const normalized = data?.file_path ? normalizeMediaFilePath(data.file_path) : data?.file_path;
      const thumbnailPath = data?.thumbnail_path
        ? normalizeMediaFilePath(data.thumbnail_path)
        : data?.thumbnail_path;
      const updated = mediaQueries.updateMedia(db, id, {
        ...data,
        ...(normalized !== undefined
          ? {
              file_path: normalized,
              canonical_path: normalized ? canonicalizeMediaFilePath(normalized) : null,
            }
          : {}),
        ...(thumbnailPath !== undefined ? { thumbnail_path: thumbnailPath } : {}),
      });
      return { success: true, data: serializeMediaRecord(updated) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  ipc.handle('db:media:delete', (_, id) => {
    try {
      mediaQueries.deleteMedia(db, id);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Output windows
  ipc.handle('output:open', (_, options) => {
    const resolvedOptions =
      typeof options === 'number'
        ? { displayId: Number(options) }
        : options && typeof options === 'object'
          ? options
          : {};
    createOutputWindow(resolvedOptions);
    return { success: true };
  });
  ipc.handle('output:close', () => {
    if (outputWindow) {
      publishPreviewWindowState('output', false);
      notifyMainWindow('preview:windowClosed', { kind: 'output' });
      outputWindow.close();
    }
    return { success: true };
  });
  ipc.handle('stage:open', (_, options) => {
    try {
      const data = createStageDisplayWindow(options);
      return { success: true, data };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  ipc.handle('stage:close', () => {
    if (stageDisplayWindow) {
      publishPreviewWindowState('stage', false);
      notifyMainWindow('preview:windowClosed', { kind: 'stage' });
      stageDisplayWindow.close();
    }
    return { success: true };
  });
  ipc.handle('output:ready', () => {
    markOutputReady();
    // A renderer that (re)loads mid-session — a re-opened window, or the
    // reload after a crash — must show the live slide now, not on the next
    // advance (plan C1).
    if (outputWindow && !outputWindow.isDestroyed() && currentStageSlide) {
      outputWindow.webContents.send('output:update', {
        slide: currentStageSlide,
        background: currentStageBackground,
      });
    }
    syncOutputState();
    syncCountdownState();
    return { success: true };
  });
  ipc.handle('stage:ready', () => {
    markStageDisplayReady();
    syncStageDisplay();
    return { success: true };
  });
  ipc.handle('output:waitReady', () => waitForReady('output'));
  ipc.handle('stage:waitReady', () => waitForReady('stage'));
  ipc.handle('output:setSessionSlides', (_, { slides }) => {
    presentationSessionSlides = Array.isArray(slides) ? slides : [];
    syncStageDisplay();
    return { success: true };
  });

  ipc.handle('output:sendSlide', (_, { slide, background }) => {
    resetOutputState();
    currentStageSlide = slide || null;
    currentStageBackground = background || null;
    if (outputWindow) outputWindow.webContents.send('output:update', { slide, background });
    syncStageDisplay();
    syncOutputState();
    syncCountdownState();
    return { success: true };
  });
  ipc.handle('output:refreshSlide', (_, { slide, background }) => {
    currentStageSlide = slide || null;
    currentStageBackground = background || null;
    if (outputWindow) outputWindow.webContents.send('output:update', { slide, background });
    syncStageDisplay();
    return { success: true };
  });
  ipc.handle('output:black', () => {
    outputState = {
      isBlack: !outputState.isBlack,
      isLogo: false,
    };
    syncOutputState();
    return { success: true, data: outputState };
  });
  ipc.handle('output:logo', () => {
    outputState = {
      isBlack: false,
      isLogo: !outputState.isLogo,
    };
    syncOutputState();
    return { success: true, data: outputState };
  });
  ipc.handle('output:countdownStart', (_, { durationSeconds }) => {
    startCountdown(durationSeconds);
    syncCountdownState();
    return { success: true, data: countdownState };
  });
  ipc.handle('output:countdownStop', () => {
    resetCountdownState();
    syncCountdownState();
    return { success: true, data: countdownState };
  });
  ipc.handle('output:stop', () => {
    resetOutputState();
    resetCountdownState();
    presentationSessionSlides = [];
    currentStageSlide = null;
    currentStageBackground = null;
    if (outputWindow) {
      outputWindow.close();
      outputWindow = null;
    }
    if (stageDisplayWindow) {
      stageDisplayWindow.close();
      stageDisplayWindow = null;
    }
    if (mainWindow) mainWindow.webContents.send('presenter:stop');
    syncOutputState();
    syncCountdownState();
    return { success: true };
  });

  // Settings
  ipc.handle('settings:getAll', () => {
    try {
      const rows = db.prepare('SELECT key, value FROM settings').all();
      const settings = {};
      rows.forEach((r) => {
        settings[r.key] = r.value;
      });
      return { success: true, data: settings };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  ipc.handle('settings:set', (_, key, value) => {
    try {
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
      broadcast('settings:updated', { key, value });
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  ipc.handle('system:getProfile', () => {
    try {
      return { success: true, data: getProfileData() };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  ipc.handle('system:getDisplays', () => {
    try {
      return {
        success: true,
        data: screen.getAllDisplays().map((display, index) => ({
          id: display.id,
          label: display.label || `Display ${index + 1}`,
          bounds: display.bounds,
          primary: display.id === screen.getPrimaryDisplay().id,
        })),
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  ipc.handle('system:resolveBuiltInMedia', (_, assetNames = []) => {
    try {
      const names = Array.isArray(assetNames) ? assetNames : [];
      return {
        success: true,
        data: Object.fromEntries(
          names.map((assetName) => [assetName, resolveBuiltInMediaAssetPath(assetName)])
        ),
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipc.assertComplete();
}

// ─── Native Menu ─────────────────────────────────────────────────────────────

function buildNativeMenu() {
  const sendCommand = (command) => mainWindow?.webContents.send('app:command', command);
  const template = [
    {
      label: 'PresenterPro',
      submenu: [
        { label: 'About PresenterPro', role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'New Presentation',
          accelerator: 'CmdOrCtrl+N',
          click: () => sendCommand('file:new'),
        },
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: () => sendCommand('file:open') },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => sendCommand('file:save') },
        {
          label: 'Save As…',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => sendCommand('file:saveAs'),
        },
        // No accelerator: Pages and Keynote give Revert none either, and an
        // unbid shortcut for a destructive action is a hazard. This app has no
        // menu-state plumbing, so the item is always enabled and the renderer
        // command alerts when there is nothing to revert.
        { label: 'Revert to Last Save', click: () => sendCommand('file:revert') },
        { type: 'separator' },
        { label: 'Close', accelerator: 'CmdOrCtrl+W', click: () => sendCommand('file:close') },
      ],
    },
    {
      label: 'Insert',
      submenu: [
        {
          label: 'New Slide',
          accelerator: 'CmdOrCtrl+M',
          click: () => sendCommand('insert:newSlide'),
        },
        { type: 'separator' },
        { label: 'Insert Image…', click: () => sendCommand('insert:image') },
        { label: 'Insert Video…', click: () => sendCommand('insert:video') },
      ],
    },
    {
      label: 'Present',
      submenu: [
        { label: 'Start Presenting', accelerator: 'F5', click: () => sendCommand('present:start') },
        {
          label: 'Stop Presenting',
          accelerator: 'Escape',
          click: () => sendCommand('present:stop'),
        },
        { type: 'separator' },
        { label: 'Black Screen', accelerator: 'B', click: () => sendCommand('present:black') },
        { label: 'Logo Screen', accelerator: 'L', click: () => sendCommand('present:logo') },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => sendCommand('edit:undo') },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', click: () => sendCommand('edit:redo') },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Presentation Settings…', click: () => sendCommand('edit:presentationSettings') },
        { label: 'Output Settings…', click: () => sendCommand('view:outputSettings') },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { label: 'Song Library', click: () => sendCommand('view:songLibrary') },
        { label: 'Media Library', click: () => sendCommand('view:mediaLibrary') },
        { label: 'Show / Hide Presenter Panel', click: () => sendCommand('view:presenterPanel') },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── App Lifecycle ───────────────────────────────────────────────────────────

// One running copy per profile (plan C1). Two copies on the same database
// meant two editors writing one SQLite file; now the second launch hands
// focus to the first and exits. The lock is keyed by the user-data directory,
// so E2E profiles stay independent.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  // GPU / utility process crashes are otherwise invisible in the logs.
  app.on('child-process-gone', (_event, details) => {
    console.error('[main] child process gone:', details?.type, details?.reason);
  });

  app.whenReady().then(() => {
    const dockIconPath = resolveRuntimeAssetPath('public', 'icons', 'app-icon.png');
    if (process.platform === 'darwin' && dockIconPath && app.dock?.setIcon) {
      app.dock.setIcon(dockIconPath);
    }
    registerMediaProtocol();
    const db = getDb();
    runMigrations(db);
    syncMediaCanonicalPaths(db);
    seed(db);
    registerIpcHandlers();
    buildNativeMenu();
    createMainWindow();
  });
}

// Without this listener the window `close` handler's preventDefault() silently
// cancelled every quit, so Cmd+Q closed the window but left the process alive
// in the dock (phase7 finding #0).
//
// A quit must NOT bypass the unsaved-changes prompt, so it does not mark
// shutdown immediately. Instead it defers: cancel this quit, run the normal
// close handshake, and re-issue the quit from the `closed` handler once the
// renderer has approved. Marking shutdown here would silently discard unsaved
// work on Cmd+Q.
app.on('before-quit', (event) => {
  if (mainWindow && !mainWindow.isDestroyed() && !closeController.getState().isQuitting) {
    event.preventDefault();
    quitRequested = true;
    mainWindow.close();
    return;
  }
  prepareForAppShutdown();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});
