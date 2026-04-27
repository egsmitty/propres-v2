const { contextBridge, ipcRenderer } = require('electron')

function subscribe(channel, cb) {
  const handler = (_, data) => cb(data)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

contextBridge.exposeInMainWorld('electronAPI', {
  // Presentations
  getPresentations: () => ipcRenderer.invoke('db:presentations:getAll'),
  getPresentation: (id) => ipcRenderer.invoke('db:presentations:get', id),
  createPresentation: (data) => ipcRenderer.invoke('db:presentations:create', data),
  updatePresentation: (id, data) => ipcRenderer.invoke('db:presentations:update', id, data),
  deletePresentation: (id) => ipcRenderer.invoke('db:presentations:delete', id),

  // Songs
  getSongs: () => ipcRenderer.invoke('db:songs:getAll'),
  createSong: (data) => ipcRenderer.invoke('db:songs:create', data),
  updateSong: (id, data) => ipcRenderer.invoke('db:songs:update', id, data),
  deleteSong: (id) => ipcRenderer.invoke('db:songs:delete', id),

  // Media
  getMedia: () => ipcRenderer.invoke('db:media:getAll'),
  getMediaFolders: () => ipcRenderer.invoke('db:mediaFolders:getAll'),
  createMediaFolder: (data) => ipcRenderer.invoke('db:mediaFolders:create', data),
  createMedia: (data) => ipcRenderer.invoke('db:media:create', data),
  updateMediaFolder: (id, data) => ipcRenderer.invoke('db:mediaFolders:update', id, data),
  deleteMediaFolder: (id) => ipcRenderer.invoke('db:mediaFolders:delete', id),
  importMedia: (options) => ipcRenderer.invoke('media:import', options),
  pickMedia: (kind) => ipcRenderer.invoke('media:pick', { kind }),
  updateMedia: (id, data) => ipcRenderer.invoke('db:media:update', id, data),
  deleteMedia: (id) => ipcRenderer.invoke('db:media:delete', id),

  // Output / Presenter
  openPresenterView: () => ipcRenderer.invoke('presenter:open'),
  closePresenterView: () => ipcRenderer.invoke('presenter:close'),
  openOutputWindow: (options) => ipcRenderer.invoke('output:open', options),
  openStageDisplayWindow: (options) => ipcRenderer.invoke('stage:open', options),
  closeOutputWindow: () => ipcRenderer.invoke('output:close'),
  closeStageDisplayWindow: () => ipcRenderer.invoke('stage:close'),
  sendSlide: (slide, background) => ipcRenderer.invoke('output:sendSlide', { slide, background }),
  setPresentationSessionSlides: (slides) => ipcRenderer.invoke('output:setSessionSlides', { slides }),
  sendBlack: () => ipcRenderer.invoke('output:black'),
  sendLogo: () => ipcRenderer.invoke('output:logo'),
  startCountdown: (durationSeconds) => ipcRenderer.invoke('output:countdownStart', { durationSeconds }),
  stopCountdown: () => ipcRenderer.invoke('output:countdownStop'),
  stopPresenting: () => ipcRenderer.invoke('output:stop'),

  // Send full slide list to presenter window on start
  startPresentation: (slides) => ipcRenderer.invoke('presenter:start', { slides }),
  updatePresentationSlides: (slides) => ipcRenderer.invoke('presenter:updateSlides', { slides }),
  waitForPresenterReady: () => ipcRenderer.invoke('presenter:waitReady'),
  notifyPresenterReady: () => ipcRenderer.invoke('presenter:ready'),
  waitForOutputReady: () => ipcRenderer.invoke('output:waitReady'),
  notifyOutputReady: () => ipcRenderer.invoke('output:ready'),
  waitForStageDisplayReady: () => ipcRenderer.invoke('stage:waitReady'),
  notifyStageDisplayReady: () => ipcRenderer.invoke('stage:ready'),

  // Presenter window navigating to a slide
  presenterGoToSlide: (slide) => ipcRenderer.invoke('presenter:goToSlide', { slide }),
  refreshLiveSlide: (slide, background) => ipcRenderer.invoke('output:refreshSlide', { slide, background }),

  // Window controls
  windowClose: () => ipcRenderer.invoke('window:close'),
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowMaximize: () => ipcRenderer.invoke('window:maximize'),
  getWindowViewState: () => ipcRenderer.invoke('window:getViewState'),
  getPreviewWindowState: () => ipcRenderer.invoke('preview:getState'),

  // System
  platform: process.platform,
  getSettings: () => ipcRenderer.invoke('settings:getAll'),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  getProfile: () => ipcRenderer.invoke('system:getProfile'),
  getSystemDisplays: () => ipcRenderer.invoke('system:getDisplays'),

  // Events (main -> renderer)
  onSlideAdvance: (cb) => subscribe('presenter:slideAdvance', cb),
  onPresenterStop: (cb) => subscribe('presenter:stop', cb),
  onOutputUpdate: (cb) => subscribe('output:update', cb),
  onOutputBlack: (cb) => subscribe('output:black', cb),
  onOutputLogo: (cb) => subscribe('output:logo', cb),
  onOutputCountdown: (cb) => subscribe('output:countdown', cb),
  onStageUpdate: (cb) => subscribe('stage:update', cb),
  onPresenterStart: (cb) => subscribe('presenter:start', cb),
  onPresenterSlidesUpdate: (cb) => subscribe('presenter:updateSlides', cb),
  onAppCommand: (cb) => subscribe('app:command', cb),
  onSettingsUpdated: (cb) => subscribe('settings:updated', cb),
  onWindowViewState: (cb) => subscribe('window:viewState', cb),
  onPreviewWindowClosed: (cb) => subscribe('preview:windowClosed', cb),
  onPreviewWindowState: (cb) => subscribe('preview:windowState', cb),
})
