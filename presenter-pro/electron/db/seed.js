const songQueries = require('./queries/songs');
const presentationQueries = require('./queries/presentations');

// First-launch seed data. Lives here (rather than electron/main/index.js) so
// it can be unit-tested against real SQLite without loading electron — see
// electron/db/__tests__/seed.test.ts.

function generateId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * Seed the starter library on first launch, guarded by the `initialized`
 * settings row. MAIN-B10: the three song inserts, the presentation insert,
 * and the `initialized` flag are one `db.transaction(...)`, so a crash
 * partway through (disk full, process killed) leaves either nothing or
 * everything — never a library with orphaned songs and no presentation, or
 * songs seeded again on the next launch because `initialized` never got set.
 */
function seed(db) {
  const initialized = db.prepare("SELECT value FROM settings WHERE key = 'initialized'").get();
  if (initialized) return;

  const songs = [
    {
      title: 'Amazing Grace',
      artist: 'John Newton',
      ccli: '4755360',
      tags: '["hymn","classic"]',
      slides: JSON.stringify([
        {
          id: generateId(),
          type: 'verse',
          label: 'Verse 1',
          body: 'Amazing grace how sweet the sound\nThat saved a wretch like me\nI once was lost but now am found\nWas blind but now I see',
          notes: '',
          backgroundId: null,
          textStyle: { size: 52, align: 'center', valign: 'center', color: '#ffffff', bold: false },
        },
        {
          id: generateId(),
          type: 'verse',
          label: 'Verse 2',
          body: 'Twas grace that taught my heart to fear\nAnd grace my fears relieved\nHow precious did that grace appear\nThe hour I first believed',
          notes: '',
          backgroundId: null,
          textStyle: { size: 52, align: 'center', valign: 'center', color: '#ffffff', bold: false },
        },
        {
          id: generateId(),
          type: 'chorus',
          label: 'Chorus',
          body: "My chains are gone\nI've been set free\nMy God my Savior has ransomed me",
          notes: '',
          backgroundId: null,
          textStyle: { size: 52, align: 'center', valign: 'center', color: '#ffffff', bold: false },
        },
      ]),
    },
    {
      title: 'How Great Is Our God',
      artist: 'Chris Tomlin',
      ccli: '4348399',
      tags: '["contemporary","worship"]',
      slides: JSON.stringify([
        {
          id: generateId(),
          type: 'verse',
          label: 'Verse 1',
          body: 'The splendor of the King\nClothed in majesty\nLet all the earth rejoice\nAll the earth rejoice',
          notes: '',
          backgroundId: null,
          textStyle: { size: 52, align: 'center', valign: 'center', color: '#ffffff', bold: false },
        },
        {
          id: generateId(),
          type: 'chorus',
          label: 'Chorus',
          body: 'How great is our God\nSing with me\nHow great is our God\nAnd all will see\nHow great how great is our God',
          notes: '',
          backgroundId: null,
          textStyle: { size: 52, align: 'center', valign: 'center', color: '#ffffff', bold: false },
        },
        {
          id: generateId(),
          type: 'bridge',
          label: 'Bridge',
          body: 'Name above all names\nWorthy of all praise\nMy heart will sing\nHow great is our God',
          notes: '',
          backgroundId: null,
          textStyle: { size: 52, align: 'center', valign: 'center', color: '#ffffff', bold: false },
        },
      ]),
    },
    {
      title: 'Build My Life',
      artist: 'Housefires',
      ccli: '7070345',
      tags: '["contemporary","worship"]',
      slides: JSON.stringify([
        {
          id: generateId(),
          type: 'verse',
          label: 'Verse 1',
          body: 'Worthy of every song we could ever sing\nWorthy of all the praise we could ever bring\nWorthy of every breath we could ever breathe\nWe live for you',
          notes: '',
          backgroundId: null,
          textStyle: { size: 52, align: 'center', valign: 'center', color: '#ffffff', bold: false },
        },
        {
          id: generateId(),
          type: 'chorus',
          label: 'Chorus',
          body: 'Holy there is no one like you\nThere is none beside you\nOpen up my eyes in wonder\nAnd show me who you are',
          notes: '',
          backgroundId: null,
          textStyle: { size: 52, align: 'center', valign: 'center', color: '#ffffff', bold: false },
        },
      ]),
    },
  ];

  const sectionColors = ['#4a7cff', '#7c3aed', '#db2777'];

  const runSeed = db.transaction(() => {
    const insertedSongs = songs.map((s) => songQueries.createSong(db, s));

    // Default presentation using all 3 songs as sections
    const sections = insertedSongs.map((song, i) => {
      // `song.slides` was stringified a few lines above by this same function;
      // if it does not parse, the seeder is broken and the first launch must say so.
      const slides = JSON.parse(song.slides);
      return {
        id: generateId(),
        title: song.title,
        type: 'song',
        color: sectionColors[i],
        collapsed: false,
        slides,
        backgroundId: null,
      };
    });

    presentationQueries.createPresentation(db, {
      title: 'Sunday Morning Service',
      sections,
    });

    db.prepare("INSERT INTO settings (key, value) VALUES ('initialized', 'true')").run();
  });

  runSeed();
}

module.exports = { seed };
