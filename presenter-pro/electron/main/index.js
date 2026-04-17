const { app, BrowserWindow, ipcMain, Menu, dialog, shell } = require('electron')
const os = require('os')
const path = require('path')
const { getDb } = require('../db/index')
const { runMigrations } = require('../db/migrations')
const songQueries = require('../db/queries/songs')
const presentationQueries = require('../db/queries/presentations')
const mediaQueries = require('../db/queries/media')

const isDev = !app.isPackaged

let mainWindow = null
let presenterWindow = null
let outputWindow = null
let presenterReady = false
let outputReady = false
let outputState = { isBlack: false, isLogo: false }
let countdownState = { active: false, endAt: null, durationSeconds: 0 }
let countdownInterval = null
let presenterReadyResolvers = []
let outputReadyResolvers = []
let presentationSessionActive = false
let allowPresenterWindowClose = false

function resolveReadyQueue(queue) {
  queue.forEach((resolve) => resolve({ success: true }))
  queue.length = 0
}

function markPresenterReady() {
  presenterReady = true
  resolveReadyQueue(presenterReadyResolvers)
}

function markOutputReady() {
  outputReady = true
  resolveReadyQueue(outputReadyResolvers)
}

function waitForReady(kind) {
  if (kind === 'presenter') {
    if (presenterReady) return Promise.resolve({ success: true })
    return new Promise((resolve) => presenterReadyResolvers.push(resolve))
  }

  if (outputReady) return Promise.resolve({ success: true })
  return new Promise((resolve) => outputReadyResolvers.push(resolve))
}

function resetOutputState() {
  outputState = { isBlack: false, isLogo: false }
}

function setPresentationSessionActive(active) {
  presentationSessionActive = active
  if (presenterWindow && !presenterWindow.isDestroyed()) {
    presenterWindow.setClosable(!active)
  }
}

function broadcast(channel, payload) {
  if (outputWindow) outputWindow.webContents.send(channel, payload)
  if (presenterWindow) presenterWindow.webContents.send(channel, payload)
  if (mainWindow) mainWindow.webContents.send(channel, payload)
}

function syncOutputState() {
  broadcast('output:black', { active: outputState.isBlack })
  broadcast('output:logo', { active: outputState.isLogo })
}

function clearCountdownInterval() {
  if (countdownInterval) {
    clearInterval(countdownInterval)
    countdownInterval = null
  }
}

function syncCountdownState() {
  broadcast('output:countdown', countdownState)
}

function resetCountdownState() {
  clearCountdownInterval()
  countdownState = { active: false, endAt: null, durationSeconds: 0 }
}

function startCountdown(durationSeconds) {
  const sanitized = Math.max(1, Number(durationSeconds) || 0)
  resetCountdownState()
  countdownState = {
    active: true,
    endAt: Date.now() + sanitized * 1000,
    durationSeconds: sanitized,
  }
  countdownInterval = setInterval(() => {
    if (!countdownState.active) return
    if (Date.now() >= countdownState.endAt) {
      resetCountdownState()
      syncCountdownState()
    }
  }, 250)
}

function getProfileData() {
  const username = os.userInfo().username || 'local'
  const parts = username.split(/[._-]+/).filter(Boolean)
  const displayName = parts.length > 1
    ? parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
    : username.charAt(0).toUpperCase() + username.slice(1)
  const initials = (parts.length ? parts : [username])
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')

  return {
    username,
    displayName,
    initials: initials || username.slice(0, 2).toUpperCase(),
    subtitle: 'On this device',
  }
}

// ─── Seed Data ──────────────────────────────────────────────────────────────

function generateId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function seed(db) {
  const initialized = db.prepare("SELECT value FROM settings WHERE key = 'initialized'").get()
  if (initialized) return

  const songs = [
    {
      title: 'Amazing Grace',
      artist: 'John Newton',
      ccli: '4755360',
      tags: '["hymn","classic"]',
      slides: JSON.stringify([
        { id: generateId(), type: 'verse', label: 'Verse 1', body: 'Amazing grace how sweet the sound\nThat saved a wretch like me\nI once was lost but now am found\nWas blind but now I see', notes: '', backgroundId: null, textStyle: { size: 52, align: 'center', valign: 'center', color: '#ffffff', bold: false } },
        { id: generateId(), type: 'verse', label: 'Verse 2', body: "Twas grace that taught my heart to fear\nAnd grace my fears relieved\nHow precious did that grace appear\nThe hour I first believed", notes: '', backgroundId: null, textStyle: { size: 52, align: 'center', valign: 'center', color: '#ffffff', bold: false } },
        { id: generateId(), type: 'chorus', label: 'Chorus', body: "My chains are gone\nI've been set free\nMy God my Savior has ransomed me", notes: '', backgroundId: null, textStyle: { size: 52, align: 'center', valign: 'center', color: '#ffffff', bold: false } },
      ])
    },
    {
      title: 'How Great Is Our God',
      artist: 'Chris Tomlin',
      ccli: '4348399',
      tags: '["contemporary","worship"]',
      slides: JSON.stringify([
        { id: generateId(), type: 'verse', label: 'Verse 1', body: 'The splendor of the King\nClothed in majesty\nLet all the earth rejoice\nAll the earth rejoice', notes: '', backgroundId: null, textStyle: { size: 52, align: 'center', valign: 'center', color: '#ffffff', bold: false } },
        { id: generateId(), type: 'chorus', label: 'Chorus', body: 'How great is our God\nSing with me\nHow great is our God\nAnd all will see\nHow great how great is our God', notes: '', backgroundId: null, textStyle: { size: 52, align: 'center', valign: 'center', color: '#ffffff', bold: false } },
        { id: generateId(), type: 'bridge', label: 'Bridge', body: 'Name above all names\nWorthy of all praise\nMy heart will sing\nHow great is our God', notes: '', backgroundId: null, textStyle: { size: 52, align: 'center', valign: 'center', color: '#ffffff', bold: false } },
      ])
    },
    {
      title: 'Build My Life',
      artist: 'Housefires',
      ccli: '7070345',
      tags: '["contemporary","worship"]',
      slides: JSON.stringify([
        { id: generateId(), type: 'verse', label: 'Verse 1', body: 'Worthy of every song we could ever sing\nWorthy of all the praise we could ever bring\nWorthy of every breath we could ever breathe\nWe live for you', notes: '', backgroundId: null, textStyle: { size: 52, align: 'center', valign: 'center', color: '#ffffff', bold: false } },
        { id: generateId(), type: 'chorus', label: 'Chorus', body: 'Holy there is no one like you\nThere is none beside you\nOpen up my eyes in wonder\nAnd show me who you are', notes: '', backgroundId: null, textStyle: { size: 52, align: 'center', valign: 'center', color: '#ffffff', bold: false } },
      ])
    },
  ]

  const sectionColors = ['#4a7cff', '#7c3aed', '#db2777']
  const insertedSongs = songs.map((s) => songQueries.createSong(db, s))

  // Default presentation using all 3 songs as sections
  const sections = insertedSongs.map((song, i) => {
    let slides = []
    try { slides = JSON.parse(song.slides) } catch {}
    return {
      id: generateId(),
      title: song.title,
      type: 'song',
      color: sectionColors[i],
      collapsed: false,
      slides,
      backgroundId: null,
    }
  })

  presentationQueries.createPresentation(db, {
    title: 'Sunday Morning Service',
    sections,
  })

  db.prepare("INSERT INTO settings (key, value) VALUES ('initialized', 'true')").run()
}

// ─── Window Creation ─────────────────────────────────────────────────────────

function createMainWindow() {
  const preloadPath = isDev
    ? path.join(__dirname, '../../out/preload/index.js')
    : path.join(__dirname, '../preload/index.js')

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 800,
    minWidth: 1200,
    minHeight: 700,
    frame: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../out/renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
    if (presenterWindow) presenterWindow.close()
    if (outputWindow) outputWindow.close()
  })
}

function createPresenterWindow() {
  if (presenterWindow) {
    presenterWindow.show()
    presenterWindow.focus()
    return
  }

  presenterReady = false

  presenterWindow = new BrowserWindow({
    width: 900,
    height: 600,
    minWidth: 700,
    minHeight: 500,
    title: 'Presenter View',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  presenterWindow.once('ready-to-show', () => {
    if (!presenterWindow) return
    presenterWindow.show()
    presenterWindow.focus()
  })

  presenterWindow.on('close', (event) => {
    if (presentationSessionActive && !allowPresenterWindowClose) {
      event.preventDefault()
      presenterWindow.focus()
    }
  })

  if (isDev) {
    presenterWindow.loadURL('http://localhost:5173/#/presenter')
  } else {
    presenterWindow.loadFile(path.join(__dirname, '../../out/renderer/index.html'), {
      hash: '/presenter',
    })
  }

  presenterWindow.on('closed', () => {
    presenterWindow = null
    presenterReady = false
    presenterReadyResolvers = []
  })
}

function createOutputWindow() {
  if (outputWindow) {
    if (!outputWindow.isVisible()) outputWindow.showInactive()
    if (presenterWindow && !presenterWindow.isDestroyed()) presenterWindow.focus()
    return
  }

  outputReady = false
  resetOutputState()

  outputWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    title: 'Output',
    frame: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  outputWindow.once('ready-to-show', () => {
    if (!outputWindow) return
    if (presenterWindow && !presenterWindow.isDestroyed()) {
      outputWindow.showInactive()
      presenterWindow.focus()
    } else {
      outputWindow.show()
    }
  })

  if (isDev) {
    outputWindow.loadURL('http://localhost:5173/#/output')
  } else {
    outputWindow.loadFile(path.join(__dirname, '../../out/renderer/index.html'), {
      hash: '/output',
    })
  }

  outputWindow.on('closed', () => {
    outputWindow = null
    outputReady = false
    outputReadyResolvers = []
    resetOutputState()
    resetCountdownState()
  })
}

// ─── IPC Handlers ────────────────────────────────────────────────────────────

function registerIpcHandlers() {
  const db = getDb()

  // Window controls
  ipcMain.handle('window:close', () => { if (mainWindow) mainWindow.close() })
  ipcMain.handle('window:minimize', () => { if (mainWindow) mainWindow.minimize() })
  ipcMain.handle('window:maximize', () => {
    if (mainWindow) {
      mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
    }
  })

  // Presentations
  ipcMain.handle('db:presentations:getAll', () => {
    try { return { success: true, data: presentationQueries.getPresentations(db) } }
    catch (e) { return { success: false, error: e.message } }
  })
  ipcMain.handle('db:presentations:get', (_, id) => {
    try { return { success: true, data: presentationQueries.getPresentation(db, id) } }
    catch (e) { return { success: false, error: e.message } }
  })
  ipcMain.handle('db:presentations:create', (_, data) => {
    try { return { success: true, data: presentationQueries.createPresentation(db, data) } }
    catch (e) { return { success: false, error: e.message } }
  })
  ipcMain.handle('db:presentations:update', (_, id, data) => {
    try { return { success: true, data: presentationQueries.updatePresentation(db, id, data) } }
    catch (e) { return { success: false, error: e.message } }
  })
  ipcMain.handle('db:presentations:delete', (_, id) => {
    try { presentationQueries.deletePresentation(db, id); return { success: true } }
    catch (e) { return { success: false, error: e.message } }
  })

  // Songs
  ipcMain.handle('db:songs:getAll', () => {
    try { return { success: true, data: songQueries.getSongs(db) } }
    catch (e) { return { success: false, error: e.message } }
  })
  ipcMain.handle('db:songs:create', (_, data) => {
    try { return { success: true, data: songQueries.createSong(db, data) } }
    catch (e) { return { success: false, error: e.message } }
  })
  ipcMain.handle('db:songs:update', (_, id, data) => {
    try { return { success: true, data: songQueries.updateSong(db, id, data) } }
    catch (e) { return { success: false, error: e.message } }
  })
  ipcMain.handle('db:songs:delete', (_, id) => {
    try { songQueries.deleteSong(db, id); return { success: true } }
    catch (e) { return { success: false, error: e.message } }
  })

  // Media
  ipcMain.handle('db:media:getAll', () => {
    try { return { success: true, data: mediaQueries.getMedia(db) } }
    catch (e) { return { success: false, error: e.message } }
  })
  ipcMain.handle('db:media:create', (_, data) => {
    try { return { success: true, data: mediaQueries.createMedia(db, data) } }
    catch (e) { return { success: false, error: e.message } }
  })
  ipcMain.handle('media:import', async () => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'Media', extensions: ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'mov', 'webm'] },
        ],
      })
      if (result.canceled) return { success: true, data: [] }
      const inserted = result.filePaths.map((filePath) => {
        const name = path.basename(filePath)
        const ext = path.extname(filePath).toLowerCase().slice(1)
        const type = ['mp4', 'mov', 'webm'].includes(ext) ? 'video' : 'image'
        return mediaQueries.createMedia(db, { name, type, file_path: filePath })
      })
      return { success: true, data: inserted }
    } catch (e) { return { success: false, error: e.message } }
  })
  ipcMain.handle('db:media:update', (_, id, data) => {
    try { return { success: true, data: mediaQueries.updateMedia(db, id, data) } }
    catch (e) { return { success: false, error: e.message } }
  })
  ipcMain.handle('db:media:delete', (_, id) => {
    try { mediaQueries.deleteMedia(db, id); return { success: true } }
    catch (e) { return { success: false, error: e.message } }
  })

  // Presenter / Output windows
  ipcMain.handle('presenter:open', () => { createPresenterWindow(); return { success: true } })
  ipcMain.handle('presenter:close', () => { if (presenterWindow) presenterWindow.close(); return { success: true } })
  ipcMain.handle('output:open', () => { createOutputWindow(); return { success: true } })
  ipcMain.handle('output:close', () => { if (outputWindow) outputWindow.close(); return { success: true } })
  ipcMain.handle('presenter:ready', () => {
    markPresenterReady()
    return { success: true }
  })
  ipcMain.handle('output:ready', () => {
    markOutputReady()
    return { success: true }
  })
  ipcMain.handle('presenter:waitReady', () => waitForReady('presenter'))
  ipcMain.handle('output:waitReady', () => waitForReady('output'))

  // Send full slide list to presenter window
  ipcMain.handle('presenter:start', (_, { slides }) => {
    setPresentationSessionActive(true)
    allowPresenterWindowClose = false
    resetOutputState()
    if (presenterWindow) presenterWindow.webContents.send('presenter:start', { slides })
    if (presenterWindow && !presenterWindow.isDestroyed()) presenterWindow.focus()
    syncOutputState()
    syncCountdownState()
    return { success: true }
  })

  ipcMain.handle('presenter:updateSlides', (_, { slides }) => {
    if (presenterWindow) presenterWindow.webContents.send('presenter:updateSlides', { slides })
    return { success: true }
  })

  // Presenter window chose a slide → send to output
  ipcMain.handle('presenter:goToSlide', (_, { slide }) => {
    resetOutputState()
    if (outputWindow) outputWindow.webContents.send('output:update', { slide, background: null })
    if (mainWindow) mainWindow.webContents.send('presenter:slideAdvance', { slide })
    syncOutputState()
    syncCountdownState()
    return { success: true }
  })

  ipcMain.handle('output:sendSlide', (_, { slide, background }) => {
    resetOutputState()
    if (outputWindow) outputWindow.webContents.send('output:update', { slide, background })
    if (presenterWindow) presenterWindow.webContents.send('presenter:slideAdvance', { slide })
    syncOutputState()
    syncCountdownState()
    return { success: true }
  })
  ipcMain.handle('output:refreshSlide', (_, { slide, background }) => {
    if (outputWindow) outputWindow.webContents.send('output:update', { slide, background })
    if (presenterWindow) presenterWindow.webContents.send('presenter:slideAdvance', { slide })
    return { success: true }
  })
  ipcMain.handle('output:black', () => {
    outputState = {
      isBlack: !outputState.isBlack,
      isLogo: false,
    }
    syncOutputState()
    return { success: true, data: outputState }
  })
  ipcMain.handle('output:logo', () => {
    outputState = {
      isBlack: false,
      isLogo: !outputState.isLogo,
    }
    syncOutputState()
    return { success: true, data: outputState }
  })
  ipcMain.handle('output:countdownStart', (_, { durationSeconds }) => {
    startCountdown(durationSeconds)
    syncCountdownState()
    return { success: true, data: countdownState }
  })
  ipcMain.handle('output:countdownStop', () => {
    resetCountdownState()
    syncCountdownState()
    return { success: true, data: countdownState }
  })
  ipcMain.handle('output:stop', () => {
    setPresentationSessionActive(false)
    allowPresenterWindowClose = true
    resetOutputState()
    resetCountdownState()
    if (outputWindow) { outputWindow.close(); outputWindow = null }
    if (presenterWindow) presenterWindow.webContents.send('presenter:stop')
    if (mainWindow) mainWindow.webContents.send('presenter:stop')
    syncOutputState()
    syncCountdownState()
    return { success: true }
  })

  // Settings
  ipcMain.handle('settings:getAll', () => {
    try {
      const rows = db.prepare('SELECT key, value FROM settings').all()
      const settings = {}
      rows.forEach((r) => { settings[r.key] = r.value })
      return { success: true, data: settings }
    } catch (e) { return { success: false, error: e.message } }
  })
  ipcMain.handle('settings:set', (_, key, value) => {
    try {
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
      return { success: true }
    } catch (e) { return { success: false, error: e.message } }
  })
  ipcMain.handle('system:getProfile', () => {
    try {
      return { success: true, data: getProfileData() }
    } catch (e) { return { success: false, error: e.message } }
  })
}

// ─── Native Menu ─────────────────────────────────────────────────────────────

function buildNativeMenu() {
  const sendCommand = (command) => mainWindow?.webContents.send('app:command', command)
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
        { label: 'New Presentation', accelerator: 'CmdOrCtrl+N', click: () => sendCommand('file:new') },
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: () => sendCommand('file:open') },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => sendCommand('file:save') },
        { label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', click: () => sendCommand('file:saveAs') },
        { type: 'separator' },
        { label: 'Close', accelerator: 'CmdOrCtrl+W', click: () => sendCommand('file:close') },
      ],
    },
    {
      label: 'Insert',
      submenu: [
        { label: 'New Slide', accelerator: 'CmdOrCtrl+M', click: () => sendCommand('insert:newSlide') },
      ],
    },
    {
      label: 'Present',
      submenu: [
        { label: 'Start Presenting', accelerator: 'F5', click: () => sendCommand('present:start') },
        { label: 'Stop Presenting', accelerator: 'Escape', click: () => sendCommand('present:stop') },
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
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ─── App Lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(() => {
  const db = getDb()
  runMigrations(db)
  seed(db)
  registerIpcHandlers()
  buildNativeMenu()
  createMainWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
})
