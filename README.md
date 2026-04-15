# PresenterPro

PresenterPro is a local-first Electron desktop app for worship presentations. It combines a PowerPoint-style editor with worship-media features like a song library, presentation filmstrip, Presenter View, and a separate full-screen output window.

## Project Layout

- `presenter-pro/`: the Electron + React application
- `tasks/`: project todo lists and implementation notes
- `CLAUDE.md`: current project status and architectural notes
- `propresenter-clone-prompt-v2.pdf`: original spec/reference

## Run Locally

From the app folder:

```bash
cd presenter-pro
npm install
npm start
```

That opens the Electron app in development mode.

## Build

```bash
cd presenter-pro
npm run build
```

## Package For Sharing

Create an unpacked app bundle for quick local testing:

```bash
cd presenter-pro
npm run dist:dir
```

Create a distributable macOS build:

```bash
cd presenter-pro
npm run dist:mac
```

The packaged output is written to `presenter-pro/dist/`.

## Notes

- App data is stored locally in Electron's user-data folder as a SQLite database.
- The first launch seeds a starter presentation and sample songs.
- This project currently targets local desktop use and does not include sync or cloud hosting.
- Shared Mac builds are unsigned, so macOS may ask the recipient to right-click the app and choose `Open` the first time.
