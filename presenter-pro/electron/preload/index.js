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
  createMedia: (data) => ipcRenderer.invoke('db:media:create', data),
  importMedia: () => ipcRenderer.invoke('media:import'),
  updateMedia: (id, data) => ipcRenderer.invoke('db:media:update', id, data),
  deleteMedia: (id) => ipcRenderer.invoke('db:media:delete', id),

  // Output / Presenter
  openPresenterView: () => ipcRenderer.invoke('presenter:open'),
  closePresenterView: () => ipcRenderer.invoke('presenter:close'),
  openOutputWindow: () => ipcRenderer.invoke('output:open'),
  closeOutputWindow: () => ipcRenderer.invoke('output:close'),
  sendSlide: (slide, background) => ipcRenderer.invoke('output:sendSlide', { slide, background }),
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

  // Presenter window navigating to a slide
  presenterGoToSlide: (slide) => ipcRenderer.invoke('presenter:goToSlide', { slide }),
  refreshLiveSlide: (slide, background) => ipcRenderer.invoke('output:refreshSlide', { slide, background }),

  // Window controls
  windowClose: () => ipcRenderer.invoke('window:close'),
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowMaximize: () => ipcRenderer.invoke('window:maximize'),

  // System
  getSettings: () => ipcRenderer.invoke('settings:getAll'),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  getProfile: () => ipcRenderer.invoke('system:getProfile'),

  // Events (main -> renderer)
  onSlideAdvance: (cb) => subscribe('presenter:slideAdvance', cb),
  onPresenterStop: (cb) => subscribe('presenter:stop', cb),
  onOutputUpdate: (cb) => subscribe('output:update', cb),
  onOutputBlack: (cb) => subscribe('output:black', cb),
  onOutputLogo: (cb) => subscribe('output:logo', cb),
  onOutputCountdown: (cb) => subscribe('output:countdown', cb),
  onPresenterStart: (cb) => subscribe('presenter:start', cb),
  onPresenterSlidesUpdate: (cb) => subscribe('presenter:updateSlides', cb),
  onAppCommand: (cb) => subscribe('app:command', cb),
})
