/**
 * First-run sample data (plan S1, SONG-28 / SONG-4 / MAIN-B10). Pure,
 * electron-free plain data so it can be unit-tested without loading
 * `better-sqlite3` or `electron` — see
 * `electron/main/__tests__/firstRunSeed.test.ts`. `electron/main/index.js`
 * requires this module the same way it already requires `./closeController`
 * (the main process is CommonJS and resolves relative `require`s against the
 * built output directory at runtime — see `electron.vite.config.js`).
 *
 * `seed(db)` used to insert three copyrighted songs (two under the wrong
 * CCLI number, one with a copyrighted chorus grafted onto a public-domain
 * hymn's title) and copy their slides into this sample presentation
 * (SONG-28). It also produced a second, unkeyed "Amazing Grace" row that the
 * renderer's built-in-hymn seeder (`src/utils/builtInSongSeed.js`) could
 * never reconcile with its own keyed row, duplicating it on every fresh
 * install (SONG-4).
 *
 * The fix for both: this module seeds NO songs at all. The renderer already
 * seeds the public-domain hymn library from `shared/hymns.json` via
 * `ensureBuiltInSongsSeeded()`; a second, independent song-seeding path here
 * was the bug. The sample presentation below stands on its own — its slide
 * text is copied verbatim from `shared/hymns.json`'s `amazing-grace` entry
 * (verses 1-3, John Newton, public domain, no CCLI) rather than referencing
 * any `songs` row.
 */

export interface FirstRunSlide {
  type: string;
  label: string;
  body: string;
  notes: string;
  backgroundId: null;
  textStyle: {
    size: number;
    align: string;
    valign: string;
    color: string;
    bold: boolean;
  };
}

export interface FirstRunSection {
  title: string;
  type: string;
  color: string;
  collapsed: boolean;
  backgroundId: null;
  slides: FirstRunSlide[];
}

export interface FirstRunPresentation {
  title: string;
  sections: FirstRunSection[];
}

const TEXT_STYLE = {
  size: 52,
  align: 'center',
  valign: 'center',
  color: '#ffffff',
  bold: false,
};

export const FIRST_RUN_PRESENTATION: FirstRunPresentation = {
  title: 'Sunday Morning Service',
  sections: [
    {
      title: 'Amazing Grace',
      type: 'song',
      color: '#4a7cff',
      collapsed: false,
      backgroundId: null,
      slides: [
        {
          type: 'verse',
          label: 'Verse 1',
          // Verbatim from shared/hymns.json ("amazing-grace" verse 1). John
          // Newton, 1779, public domain — no CCLI number.
          body: 'Amazing grace! How sweet the sound\nThat saved a wretch like me!\nI once was lost, but now am found,\nWas blind, but now I see.',
          notes: '',
          backgroundId: null,
          textStyle: TEXT_STYLE,
        },
        {
          type: 'verse',
          label: 'Verse 2',
          // Verbatim from shared/hymns.json ("amazing-grace" verse 2).
          body: "'Twas grace that taught my heart to fear,\nAnd grace my fears relieved;\nHow precious did that grace appear\nThe hour I first believed!",
          notes: '',
          backgroundId: null,
          textStyle: TEXT_STYLE,
        },
        {
          type: 'verse',
          label: 'Verse 3',
          // Verbatim from shared/hymns.json ("amazing-grace" verse 3).
          body: "Through many dangers, toils and snares\nI have already come;\n'Tis grace hath brought me safe thus far,\nAnd grace will lead me home.",
          notes: '',
          backgroundId: null,
          textStyle: TEXT_STYLE,
        },
      ],
    },
  ],
};
