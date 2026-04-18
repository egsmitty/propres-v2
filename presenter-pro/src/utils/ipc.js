// Typed wrappers around window.electronAPI
// All functions return { success, data, error }

const api = () => window.electronAPI

// Presentations
export async function getPresentations() {
  return api().getPresentations()
}
export async function getPresentation(id) {
  return api().getPresentation(id)
}
export async function createPresentation(data) {
  return api().createPresentation(data)
}
export async function updatePresentation(id, data) {
  return api().updatePresentation(id, data)
}
export async function deletePresentation(id) {
  return api().deletePresentation(id)
}

// Songs
export async function getSongs() {
  return api().getSongs()
}
export async function createSong(data) {
  return api().createSong(data)
}
export async function updateSong(id, data) {
  return api().updateSong(id, data)
}
export async function deleteSong(id) {
  return api().deleteSong(id)
}

// Media
export async function getMedia() {
  return api().getMedia()
}
export async function createMedia(data) {
  return api().createMedia(data)
}
export async function importMedia() {
  return api().importMedia()
}
export async function pickMedia(kind) {
  return api().pickMedia(kind)
}
export async function updateMedia(id, data) {
  return api().updateMedia(id, data)
}
export async function deleteMedia(id) {
  return api().deleteMedia(id)
}

// Output / Presenter
export async function openPresenterView() {
  return api().openPresenterView()
}
export async function closePresenterView() {
  return api().closePresenterView()
}
export async function openOutputWindow() {
  return api().openOutputWindow()
}
export async function openStageDisplayWindow(options) {
  return api().openStageDisplayWindow(options)
}
export async function closeOutputWindow() {
  return api().closeOutputWindow()
}
export async function closeStageDisplayWindow() {
  return api().closeStageDisplayWindow()
}
export async function sendSlide(slide, background) {
  return api().sendSlide(slide, background)
}
export async function setPresentationSessionSlides(slides) {
  return api().setPresentationSessionSlides(slides)
}
export async function refreshLiveSlide(slide, background) {
  return api().refreshLiveSlide(slide, background)
}
export async function updatePresentationSlides(slides) {
  return api().updatePresentationSlides(slides)
}
export async function sendBlack() {
  return api().sendBlack()
}
export async function sendLogo() {
  return api().sendLogo()
}
export async function startCountdown(durationSeconds) {
  return api().startCountdown(durationSeconds)
}
export async function stopCountdown() {
  return api().stopCountdown()
}
export async function stopPresenting() {
  return api().stopPresenting()
}

// Settings
export async function getSettings() {
  return api().getSettings()
}
export async function setSetting(key, value) {
  return api().setSetting(key, value)
}
export async function getProfile() {
  return api().getProfile()
}
export async function getSystemDisplays() {
  return api().getSystemDisplays()
}
