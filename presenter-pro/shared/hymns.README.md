# hymns.json — Consumption Instructions for Codex

This file is the **single source of truth** for the four built-in public-domain hymns referenced by spec issues B2 and B4. It has been pre-generated and committed. **Do not regenerate, edit lyric content, or split slides inside this file.**

## File location
`presenter-pro/shared/hymns.json`

Add the sibling `shared/hymns.README.md` (this file) to the repo so future contributors understand the contract.

## Shape

```jsonc
{
  "hymns": [
    {
      "id": "amazing-grace",            // stable kebab-case identifier
      "title": "Amazing Grace",         // display name in the Song Library
      "author": "John Newton",          // metadata only; surface if the app already shows authorship
      "year": 1779,                     // metadata only
      "publicDomain": true,             // always true for entries in this file
      "publicDomainNote": "…",          // optional; present where licensing has a nuance
      "sections": [
        { "type": "blank",  "name": "Blank",   "lyrics": "" },
        { "type": "verse",  "name": "Verse 1", "lyrics": "…multi-line text with \\n…" },
        { "type": "chorus", "name": "Chorus",  "lyrics": "…" },
        … more sections …
        { "type": "blank",  "name": "Blank",   "lyrics": "" }
      ]
    },
    … more hymns …
  ]
}
```

### Field rules

- `type` uses the app's existing section-group type strings (`verse`, `chorus`, `bridge`, `pre-chorus`, `blank`). Map these directly to the same types the rest of the app uses for songs — do not invent new types.
- `name` is the human-readable section group label. Use it as-is for the section header. Auto-incremented numbering (C3) only applies to user-created sections at runtime; do not overwrite the names here.
- `lyrics` is the full lyric text for that section, with `\n` separating display lines. **It is NOT pre-split into slides.** The app must split it (per B2: a new slide every 2 lines) using whatever existing slide-building utility the song editor already uses.
- Every hymn begins with a `{ type: "blank" }` section and ends with a `{ type: "blank" }` section. Carry these through to the generated song unchanged. Per B2, these blanks display the song's background image (which is set at template build time, not in this file).

## How to consume this file

### 1. Seeding the Song Library (issue B2)
On first app launch (or whenever the built-in library seed runs), iterate over `hymns[]` and create one song record per entry:

- Use `title` as the song name.
- Convert each section in `sections[]` into the app's internal section-group structure.
- For each section's `lyrics`, run it through the **existing** slide-splitting utility used elsewhere in the song editor, applying the **2 lines per slide** rule. Do not add ad-hoc splitting logic in the seed path; route through the same code that user-created songs use.
- For blank sections, produce a single empty slide (the slide will render only the background once one is assigned).
- Persist each song via the same persistence layer user-created songs go through. Tag them as built-in if the library has a flag for that (e.g., `builtIn: true`, `editable: false`) — if no such concept exists, leave them as regular library entries.

These four hymns must appear in the Song Library on a fresh install with no further user action.

### 2. Templates (issue B4)
The three built-in templates reference these hymns as placeholder content. **The template builder should reference the library entries seeded in step 1 — not re-parse `hymns.json` independently.** Match whatever pattern the existing app already uses for "song in a service order" (reference vs. embedded copy — match the existing data model, do not introduce a new pattern).

Per B4, template construction assigns each song a **background** from the test-media folder. Assign backgrounds at template-build time using the existing background-set APIs. Do not store backgrounds in `hymns.json`.

### 3. Updating lyrics later
If a future change needs different lyric content, edit `hymns.json` and re-run the seed (or migrate existing user installs). The seed should be idempotent: running it twice should not produce duplicate library entries. Use `id` as the dedup key.

## Public-domain status notes

- **Amazing Grace** (1779) — fully public domain worldwide.
- **All Creatures of Our God and King** — original 1225 text by Francis of Assisi is PD; Draper's 1919 English translation is PD in the U.S. (pre-1929) and in life+70 jurisdictions (Draper died 1933, PD as of 2004).
- **How Great Thou Art** — Boberg's 1885 Swedish original is PD; Stuart K. Hine's 1949 English translation **may still be under copyright in some jurisdictions**. See `publicDomainNote` in the file. If this becomes an issue, swap this hymn for another PD selection (e.g., "Holy, Holy, Holy" by Reginald Heber, 1826).
- **Great Is Thy Faithfulness** (1923) — entered U.S. public domain on January 1, 2019 under the 95-year rule. Outside the U.S., status varies by jurisdiction (life+70 — Chisholm died 1960, so PD in those jurisdictions on January 1, 2031). See `publicDomainNote`.

If shipping outside the U.S., flag the last two to the user before going live.

## What NOT to do

- ❌ Do not pre-split `lyrics` into per-slide arrays inside this file.
- ❌ Do not add a `slides` field — slides are derived at runtime.
- ❌ Do not embed backgrounds, fonts, or styling — those belong to the song record / template, not the source content.
- ❌ Do not regenerate this file from scratch or substitute different lyrics. Treat it as committed content.
- ❌ Do not duplicate this content into a parallel JS module or per-hymn .txt files. One source.
