# Session 2 — Song Section Labels

## Plan
- [x] Add `SECTION_TYPES`, `getSectionType`, `getSectionColor` to `src/utils/sectionTypes.js`
- [x] Update `slideParser.js` — expand `LABEL_RE` and type-mapping to cover `tag`, `turnaround`/`turn`/`T.A.`, `blank`, and verify `intro`/`outro`
- [x] Update `SongEditorModal.jsx` — replace `TYPES` with `SECTION_TYPES`, drive dropdown from it, add color badge on each slide card, add custom label input when `type === 'custom'`
- [x] Update CLAUDE.md to mark Song Section Labels as complete
- [ ] Commit

## Review
- **sectionTypes.js** — added `SECTION_TYPES` array (9 types), `getSectionType(id)`, and `getSectionColor(id)`. Appended after existing exports with no conflicts.
- **slideParser.js** — expanded `LABEL_RE` to include `turnaround`, `turn`, `t.a.`, and `blank`. Extracted a `resolveType()` helper that normalises aliases (`turn`/`t.a.` → `turnaround`, `pre-chorus` → `chorus`). Verified all 15 test cases correct before touching the file.
- **SongEditorModal.jsx** — removed the old hardcoded `TYPES` array; dropdown now driven by `SECTION_TYPES`. Added a 4px colored left-edge badge to each slide card using `getSectionColor`. When `slide.type === 'custom'`, the label field becomes an editable input (maxLength 30, placeholder "Label name…"); for all other types it shows the label as read-only text.
- No database, IPC, or other component touched.
