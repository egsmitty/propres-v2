# PresenterPro — Phase 5

## Goal
Turn backgrounds and media into a church-first workflow that feels intuitive: reusable media library, section-based backgrounds that persist under lyrics, countdown overlays, and a separate path for full-screen media playback.

## Product Model
- `Song`, `Announcement`, and `Sermon` sections are first-class section types.
- Each section type should use church-friendly language for its content field:
  - `Lyrics` for songs
  - `Text` for announcements
  - `Notes` for sermons
- Backgrounds are not presentation-wide.
- A background should continue underneath text across slide changes inside the same section until it is changed.
- Media slides can be inserted into any section as their own item in the flow.
- When a media slide plays, it should take over the output and stop the running background behind it.
- Countdown is an overlay that can sit on top of a section background.
- Countdown is a live control that can be turned on over anything at any time.

## Phase 5A — Domain And Naming Cleanup
- [x] Remove presentation-wide background behavior from the editor flow
- [x] Standardize church-friendly section terminology in the UI: `Song`, `Announcement`, and `Sermon`
- [x] Add clear media-slide insertion inside sections without forcing a separate playlist-style concept
- [x] Rename background actions so they speak in section language instead of generic presentation language
- [x] Swap content-field labels by section type: `Lyrics`, `Text`, and `Notes`

## Phase 5B — Media Library As A Reusable Asset Library
- [x] Keep imported media app-wide so users import once and reuse across many songs or announcements
- [x] Redesign the Media Library so it clearly feels like a saved library, not a one-off file picker
- [x] Add search/filter support inside the Media Library
- [x] Add basic library management: rename and delete
- [x] Add “used in this section” or similar context help if it improves reuse without clutter

## Phase 5C — Section Background System
- [x] Make section background the primary background model for songs, announcements, and sermons
- [x] Add explicit background flows based on section type instead of generic presentation-wide wording
- [x] Keep slide-level overrides available only when truly needed, with the section background as the default
- [x] Make newly inserted song slides inherit the section background automatically
- [x] Make background changes persist across slide advances inside the section until another section/background takes over

## Phase 5D — Continuous Background Playback
- [x] Separate the live text layer from the running background layer in Presenter and Output
- [x] Prevent video/image backgrounds from “restarting” on every slide inside the same section
- [x] Only restart or swap the background when the active section background actually changes
- [x] Preserve the continuous-background behavior in both editor preview and live output as closely as practical

## Phase 5E — Countdown Overlay
- [x] Add an `Add Countdown` feature that can be placed over a section background
- [x] Implement countdown as a live overlay control that can be toggled over any output state
- [x] Show countdown above the background layer and beneath/alongside readable text as appropriate
- [x] Ensure countdown styling is legible for church use without too much setup

## Phase 5F — Media Slides In The Flow
- [x] Add a clear `Media` slide type that can be inserted into any section flow
- [x] Make media slides take over the output cleanly without the section background continuing behind them
- [x] Support live switching from media slides back to normal text slides and section backgrounds
- [x] Keep media slides understandable to volunteers as just another item in the section order

## Phase 5G — UX Refinement
- [x] Add a PowerPoint-like background picker flow, but scoped to the current section
- [x] Make it obvious what scope a media choice will affect before applying it
- [x] Improve section cards/filmstrip indicators so background ownership is visible at a glance
- [x] Keep the workflow understandable to non-technical church volunteers
