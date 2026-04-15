# PresenterPro — Phase 4

## Goal
Reshape the app entry flow so the first screen feels closer to Office: `Home` for templates plus quick resume, `New` for starting a presentation, `Recent` for deeper history, and `Open` for searching existing work.

## Phase 4A — Draft And Save Flow
- [x] Treat template-created presentations like new drafts so immediate exit still prompts save or discard
- [x] Keep the existing blank-new draft behavior intact while extending it to templates

## Phase 4B — Navigation Frame
- [x] Rebuild the left rail as `Home / New / Recent / Open`
- [x] Use larger Word-style navigation buttons with the icon above the label
- [x] Add a profile block at the top of the sidebar using local device data

## Phase 4C — Home Experience
- [x] Keep templates at the top of `Home`
- [x] Show only the most recent 10 presentations on `Home`
- [x] Keep the tutorial entry on `Home`, aligned as a secondary action on the right

## Phase 4D — New Experience
- [x] Make `New` a dedicated create surface instead of relying on a standalone header button
- [x] Put `Blank Presentation` first on the `New` page
- [x] Upgrade template cards so they feel more polished and presentation-like

## Phase 4E — Recent And Open Separation
- [x] Keep a standalone `Recent` tab that shows the most recent 25 presentations
- [x] Keep `Open` focused on searching existing presentations only
- [x] Preserve search by title or date with visible highlight feedback
