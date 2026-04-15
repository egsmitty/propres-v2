const { contextBridge, ipcRenderer } = require('electron')

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
  importMedia: () => ipcRenderer.invoke('media:import'),
  deleteMedia: (id) => ipcRenderer.invoke('db:media:delete', id),

  // Output / Presenter
  openPresenterView: () => ipcRenderer.invoke('presenter:open'),
  closePresenterView: () => ipcRenderer.invoke('presenter:close'),
  openOutputWindow: () => ipcRenderer.invoke('output:open'),
  closeOutputWindow: () => ipcRenderer.invoke('output:close'),
  sendSlide: (slide, background) => ipcRenderer.invoke('output:sendSlide', { slide, background }),
  sendBlack: () => ipcRenderer.invoke('output:black'),
  sendLogo: () => ipcRenderer.invoke('output:logo'),
  stopPresenting: () => ipcRenderer.invoke('output:stop'),

  // Send full slide list to presenter window on start
  startPresentation: (slides) => ipcRenderer.invoke('presenter:start', { slides }),

  // Presenter window navigating to a slide
  presenterGoToSlide: (slide) => ipcRenderer.invoke('presenter:goToSlide', { slide }),

  // Window controls
  windowClose: () => ipcRenderer.invoke('window:close'),
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowMaximize: () => ipcRenderer.invoke('window:maximize'),

  // System
  getSettings: () => ipcRenderer.invoke('settings:getAll'),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),

  // Events (main -> renderer)
  onSlideAdvance: (cb) => ipcRenderer.on('presenter:slideAdvance', (_, data) => cb(data)),
  onPresenterStop: (cb) => ipcRenderer.on('presenter:stop', () => cb()),
  onOutputUpdate: (cb) => ipcRenderer.on('output:update', (_, data) => cb(data)),
  onOutputBlack: (cb) => ipcRenderer.on('output:black', () => cb()),
  onOutputLogo: (cb) => ipcRenderer.on('output:logo', () => cb()),
  onPresenterStart: (cb) => ipcRenderer.on('presenter:start', (_, data) => cb(data)),
  onAppCommand: (cb) => ipcRenderer.on('app:command', (_, command) => cb(command)),
})
