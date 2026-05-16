import { createSection, createTextSlide } from '@/utils/sectionTypes'
import { flattenSongGroupsToSlides, getSongGroupsAndArrangement, splitTextIntoSlidesByLineCount } from '@/utils/songSections'

export const SAMPLE_MEDIA_LIBRARY = [
  {
    key: 'welcome-announcements',
    name: 'Illumine Welcome',
    type: 'video',
    asset_name: 'IllumineWelcomeHD.mp4',
    tags: '["built-in","template","announcements","welcome"]',
  },
  {
    key: 'general-background',
    name: 'Celestial Blue',
    type: 'image',
    asset_name: 'CelestialBlueHD.jpg',
    tags: '["built-in","template","background","general"]',
  },
  {
    key: 'song-motion-1',
    name: 'Color Flow Magenta Ice',
    type: 'video',
    asset_name: 'ColorFlowMagentaIceHD.mp4',
    tags: '["built-in","template","background","song"]',
  },
  {
    key: 'song-motion-2',
    name: 'Illumine Cool Rays',
    type: 'video',
    asset_name: 'IllumineCoolRaysHD.mp4',
    tags: '["built-in","template","background","song"]',
  },
  {
    key: 'song-motion-3',
    name: 'Summer Wildflowers Daisy Sunset',
    type: 'video',
    asset_name: 'SummerWildflowersDaisySunsetHD.mp4',
    tags: '["built-in","template","background","song"]',
  },
]

const BUILT_IN_HYMN_IDS = {
  amazingGrace: 'amazing-grace',
  allCreatures: 'all-creatures-of-our-god-and-king',
  howGreatThouArt: 'how-great-thou-art',
  greatIsThyFaithfulness: 'great-is-thy-faithfulness',
}

function makeBodySlide(type, label, body, style = {}) {
  return createTextSlide(type, {
    label,
    body,
    textStyle: {
      size: 52,
      align: type === 'sermon' ? 'left' : 'center',
      valign: 'center',
      color: '#ffffff',
      bold: label.toLowerCase().includes('title') || label.toLowerCase().includes('welcome'),
      ...style,
    },
  })
}

function buildSongSectionFromLibrarySong(song, index, backgroundId = null) {
  if (!song) {
    return createSection('song', index, {
      title: 'Missing Built-In Song',
      backgroundId,
      slides: [makeBodySlide('song', 'Song Missing', 'This template song could not be found in the library.')],
    })
  }

  const { groups, arrangement } = getSongGroupsAndArrangement(song)
  const flattened = flattenSongGroupsToSlides(groups, arrangement, {
    regenerateSlideIds: true,
    regenerateGroupIds: true,
    songId: song.id,
  })

  return createSection('song', index, {
    title: song.title,
    songId: song.id,
    backgroundId,
    songGroups: flattened.groups,
    songOrder: flattened.arrangement,
    slides: flattened.slides,
  })
}

function buildScriptureSlides({ reference, text }) {
  return splitTextIntoSlidesByLineCount(text, 2).map((body, index) =>
    createTextSlide('sermon', {
      label: index === 0 ? reference : `${reference} (cont.)`,
      body,
      textStyle: {
        size: 42,
        align: 'center',
        valign: 'center',
        color: '#ffffff',
      },
    })
  )
}

function buildSermonPlaceholderSection(index, title = 'Sermon') {
  return createSection('sermon', index, {
    title,
    slides: [
      makeBodySlide('sermon', 'Sermon Title', 'Faithful In The Middle\nPhilippians 1:3-11', {
        size: 54,
        bold: true,
        align: 'center',
      }),
      makeBodySlide('sermon', 'Main Points', '1. God is still at work in ordinary moments\n2. The church grows deeper through prayer\n3. Faithfulness forms us before outcomes appear', {
        size: 34,
        align: 'left',
        bold: false,
      }),
      makeBodySlide('sermon', 'Response', 'Lord, make us faithful in the middle.\nTeach us to trust Your work before we see the outcome.', {
        size: 36,
        align: 'center',
        bold: false,
      }),
    ],
  })
}

function buildAnnouncementsSection(index, backgroundId = null) {
  return createSection('announcement', index, {
    title: 'Pre-Service Announcements',
    backgroundId,
    slides: [
      makeBodySlide('announcement', 'Welcome', 'Welcome to worship\nWe are glad you are here', {
        size: 58,
        bold: true,
      }),
      makeBodySlide('announcement', 'Announcements', 'Baptism Sunday this month\nPrayer Night on Wednesday\nServe Team signups in the lobby', {
        size: 40,
        bold: false,
      }),
    ],
  })
}

function findSongByBuiltInKey(songLibrary = [], builtInKey) {
  return songLibrary.find((song) => song.builtInKey === builtInKey || song.built_in_key === builtInKey) || null
}

export const PRESENTATION_TEMPLATES = [
  {
    id: 'sunday-service',
    title: 'Basic Worship Service',
    description: 'Announcements, four built-in hymns, and sermon placeholders with real media backgrounds.',
    async buildPresentation({ ensureMedia, songLibrary = [] } = {}) {
      const announcementsMedia = ensureMedia ? await ensureMedia(SAMPLE_MEDIA_LIBRARY[0]) : null
      const generalBackground = ensureMedia ? await ensureMedia(SAMPLE_MEDIA_LIBRARY[1]) : null
      const songBackgroundOne = ensureMedia ? await ensureMedia(SAMPLE_MEDIA_LIBRARY[2]) : null
      const songBackgroundTwo = ensureMedia ? await ensureMedia(SAMPLE_MEDIA_LIBRARY[3]) : null
      const songBackgroundThree = ensureMedia ? await ensureMedia(SAMPLE_MEDIA_LIBRARY[4]) : null

      return {
        title: 'Basic Worship Service',
        sections: [
          buildAnnouncementsSection(0, announcementsMedia?.id ?? null),
          buildSongSectionFromLibrarySong(findSongByBuiltInKey(songLibrary, BUILT_IN_HYMN_IDS.amazingGrace), 1, songBackgroundOne?.id ?? null),
          buildSongSectionFromLibrarySong(findSongByBuiltInKey(songLibrary, BUILT_IN_HYMN_IDS.allCreatures), 2, songBackgroundTwo?.id ?? null),
          buildSongSectionFromLibrarySong(findSongByBuiltInKey(songLibrary, BUILT_IN_HYMN_IDS.howGreatThouArt), 3, songBackgroundThree?.id ?? null),
          buildSermonPlaceholderSection(4),
          buildSongSectionFromLibrarySong(findSongByBuiltInKey(songLibrary, BUILT_IN_HYMN_IDS.greatIsThyFaithfulness), 5, generalBackground?.id ?? null),
        ],
      }
    },
  },
  {
    id: 'worship-set',
    title: 'Worship Set',
    description: 'A three-song worship flow built from the seeded hymn library.',
    async buildPresentation({ ensureMedia, songLibrary = [] } = {}) {
      const songBackgroundOne = ensureMedia ? await ensureMedia(SAMPLE_MEDIA_LIBRARY[2]) : null
      const songBackgroundTwo = ensureMedia ? await ensureMedia(SAMPLE_MEDIA_LIBRARY[3]) : null
      const songBackgroundThree = ensureMedia ? await ensureMedia(SAMPLE_MEDIA_LIBRARY[4]) : null

      return {
        title: 'Worship Set',
        sections: [
          buildSongSectionFromLibrarySong(findSongByBuiltInKey(songLibrary, BUILT_IN_HYMN_IDS.amazingGrace), 0, songBackgroundOne?.id ?? null),
          buildSongSectionFromLibrarySong(findSongByBuiltInKey(songLibrary, BUILT_IN_HYMN_IDS.allCreatures), 1, songBackgroundTwo?.id ?? null),
          buildSongSectionFromLibrarySong(findSongByBuiltInKey(songLibrary, BUILT_IN_HYMN_IDS.howGreatThouArt), 2, songBackgroundThree?.id ?? null),
        ],
      }
    },
  },
  {
    id: 'sermon-scripture',
    title: 'Sermon Set',
    description: 'A focused sermon deck with message placeholders and KJV scripture slides.',
    async buildPresentation() {
      return {
        title: 'Sermon Set',
        sections: [
          buildSermonPlaceholderSection(0, 'Sermon'),
          createSection('sermon', 1, {
            title: 'Scripture Reading',
            slides: buildScriptureSlides({
              reference: 'Psalm 23:1-3 (KJV)',
              text: 'The Lord is my shepherd; I shall not want.\nHe maketh me to lie down in green pastures:\nhe leadeth me beside the still waters.\nHe restoreth my soul:\nhe leadeth me in the paths of righteousness\nfor his name\'s sake.',
            }),
          }),
        ],
      }
    },
  },
  {
    id: 'featured-sunday-example',
    title: 'Sunday Morning Example',
    description: 'A polished sample service with announcements, worship, sermon notes, and a featured flow.',
    async buildPresentation({ ensureMedia, songLibrary = [] } = {}) {
      const announcementsMedia = ensureMedia ? await ensureMedia(SAMPLE_MEDIA_LIBRARY[0]) : null
      const generalBackground = ensureMedia ? await ensureMedia(SAMPLE_MEDIA_LIBRARY[1]) : null
      const songBackgroundOne = ensureMedia ? await ensureMedia(SAMPLE_MEDIA_LIBRARY[2]) : null
      const songBackgroundTwo = ensureMedia ? await ensureMedia(SAMPLE_MEDIA_LIBRARY[3]) : null

      return {
        title: 'Sunday Morning Example',
        sections: [
          buildAnnouncementsSection(0, announcementsMedia?.id ?? null),
          buildSongSectionFromLibrarySong(findSongByBuiltInKey(songLibrary, BUILT_IN_HYMN_IDS.amazingGrace), 1, songBackgroundOne?.id ?? null),
          buildSongSectionFromLibrarySong(findSongByBuiltInKey(songLibrary, BUILT_IN_HYMN_IDS.greatIsThyFaithfulness), 2, songBackgroundTwo?.id ?? null),
          createSection('sermon', 3, {
            title: 'Scripture Reading',
            backgroundId: generalBackground?.id ?? null,
            slides: buildScriptureSlides({
              reference: 'Psalm 100:4-5 (KJV)',
              text: 'Enter into his gates with thanksgiving,\nand into his courts with praise:\nbe thankful unto him, and bless his name.\nFor the Lord is good;\nhis mercy is everlasting;\nand his truth endureth to all generations.',
            }),
          }),
          buildSermonPlaceholderSection(4, 'Message'),
        ],
      }
    },
  },
  {
    id: 'announcement-loop',
    title: 'Announcement Loop',
    description: 'A rotating announcement deck for pre-service and lobby screens.',
    async buildPresentation({ ensureMedia } = {}) {
      const announcementsMedia = ensureMedia ? await ensureMedia(SAMPLE_MEDIA_LIBRARY[0]) : null
      return {
        title: 'Announcement Loop',
        sections: [
          buildAnnouncementsSection(0, announcementsMedia?.id ?? null),
        ],
      }
    },
  },
  {
    id: 'student-night',
    title: 'Student Night',
    description: 'A youth-service template with welcome, game moment, worship, message, and response.',
    buildPresentation: () => ({
      title: 'Student Night',
      sections: [
        createSection('announcement', 0, {
          title: 'Welcome',
          slides: [makeBodySlide('announcement', 'Doors Open', 'Doors open at 6:30 PM\nGrab a seat and say hello!')],
        }),
        createSection('announcement', 1, {
          title: 'Game Moment',
          slides: [
            makeBodySlide('announcement', 'Game Intro', 'Tonight\'s game: Team Relay', { size: 50 }),
            makeBodySlide('announcement', 'Instructions', 'Line up by team\nListen for the host cue\nCheer loud and have fun', { size: 34, bold: false }),
          ],
        }),
        buildSermonPlaceholderSection(2, 'Message'),
      ],
    }),
  },
  {
    id: 'prayer-night',
    title: 'Prayer Night',
    description: 'A calm service flow for scripture, guided prayer, reflection, and closing worship.',
    buildPresentation: () => ({
      title: 'Prayer Night',
      sections: [
        createSection('announcement', 0, {
          title: 'Gathering',
          slides: [makeBodySlide('announcement', 'Welcome', 'Welcome to Prayer Night\nLet\'s quiet our hearts before the Lord', { size: 50 })],
        }),
        createSection('sermon', 1, {
          title: 'Guided Prayer',
          slides: [
            makeBodySlide('sermon', 'Church', 'Pray for our church leaders,\nsmall groups, and volunteers.', { size: 34, align: 'left', bold: false }),
            makeBodySlide('sermon', 'City', 'Pray for our city,\nschools, first responders, and families.', { size: 34, align: 'left', bold: false }),
          ],
        }),
      ],
    }),
  },
]
