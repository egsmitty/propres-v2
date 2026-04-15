import { createSection, createTextSlide, createMediaSlide } from '@/utils/sectionTypes'

export const SAMPLE_MEDIA_LIBRARY = [
  {
    key: 'welcome',
    name: 'Particle Spin Welcome (MotionWorship Sample)',
    type: 'video',
    file_path: '/Users/ethansmith/Desktop/VSClaude/ProPresV2/test-media/ParticleSpinWelcomeHD_PRV.mp4',
    tags: 'sample,motionworship,announcement',
  },
  {
    key: 'background',
    name: 'Particle Spin Blue (MotionWorship Sample)',
    type: 'video',
    file_path: '/Users/ethansmith/Desktop/VSClaude/ProPresV2/test-media/ParticleSpinBlueHD_PRV.mp4',
    tags: 'sample,motionworship,background',
  },
  {
    key: 'countdown',
    name: 'Geo Depths Countdown (MotionWorship Sample)',
    type: 'video',
    file_path: '/Users/ethansmith/Desktop/VSClaude/ProPresV2/test-media/GeoDepthsCountdownHD_PRV.mp4',
    tags: 'sample,motionworship,countdown',
  },
]

function makeSection(index, title, slideLabels, type = 'announcement') {
  return createSection(type, index, {
    title,
    slides: slideLabels.map((label) => createTextSlide(type, { label })),
  })
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

export const PRESENTATION_TEMPLATES = [
  {
    id: 'featured-sunday-example',
    title: 'Sunday Morning Example',
    description: 'A completed sample service with announcements, worship lyrics, sermon notes, and a media item already wired in.',
    featured: true,
    async buildPresentation({ ensureMedia } = {}) {
      const welcomeMedia = ensureMedia ? await ensureMedia(SAMPLE_MEDIA_LIBRARY[0]) : null
      const backgroundMedia = ensureMedia ? await ensureMedia(SAMPLE_MEDIA_LIBRARY[1]) : null

      return {
        title: 'Sunday Morning Example',
        sections: [
          createSection('announcement', 0, {
            title: 'Pre-Service Announcements',
            backgroundId: backgroundMedia?.id ?? null,
            slides: [
              createMediaSlide(welcomeMedia, { label: 'Welcome Motion' }),
              makeBodySlide(
                'announcement',
                'Welcome',
                'Welcome to Riverside Community Church\nWe are glad you are here this morning',
                { size: 58, bold: true }
              ),
              makeBodySlide(
                'announcement',
                'Announcements',
                'Baptism Sunday — April 28\nPrayer Night — Wednesday at 6:30 PM\nYouth Cookout — Friday at 7:00 PM',
                { size: 40, bold: false }
              ),
              makeBodySlide(
                'announcement',
                'Giving',
                'Thank you for your faithful generosity.\nYou can give online, in the lobby, or through the church app.',
                { size: 36 }
              ),
            ],
          }),
          createSection('song', 1, {
            title: 'Worship — Great Things',
            backgroundId: backgroundMedia?.id ?? null,
            slides: [
              makeBodySlide('song', 'Title', 'Great Things', { size: 66, bold: true }),
              makeBodySlide('song', 'Verse 1', 'Come let us worship our King\nCome let us bow at His feet\nHe has done great things'),
              makeBodySlide('song', 'Chorus', 'Oh hero of Heaven You conquered the grave\nYou free every captive and break every chain'),
              makeBodySlide('song', 'Bridge', 'Hallelujah God above it all\nHallelujah God unshakable'),
            ],
          }),
          createSection('song', 2, {
            title: 'Worship — Gratitude',
            backgroundId: backgroundMedia?.id ?? null,
            slides: [
              makeBodySlide('song', 'Verse 1', 'All my words fall short\nI got nothing new\nHow could I express\nAll my gratitude'),
              makeBodySlide('song', 'Chorus', 'So I throw up my hands\nAnd praise You again and again\nCause all that I have is a hallelujah'),
              makeBodySlide('song', 'Outro', 'Come on my soul\nOh do not get shy on me\nLift up your song'),
            ],
          }),
          createSection('sermon', 3, {
            title: 'Sermon — Faithful In The Middle',
            backgroundId: backgroundMedia?.id ?? null,
            slides: [
              makeBodySlide(
                'sermon',
                'Sermon Title',
                'Faithful In The Middle\nPhilippians 1:3-11',
                { size: 54, bold: true, align: 'center' }
              ),
              makeBodySlide(
                'sermon',
                'Notes',
                '1. God is still forming us in ordinary moments\n2. Prayer keeps us tender in pressure\n3. Love should grow deeper and wiser',
                { size: 34, align: 'left' }
              ),
              makeBodySlide(
                'sermon',
                'Response',
                'Lord, make us faithful in the middle.\nTeach us to trust Your work before we see the outcome.',
                { size: 36, align: 'center' }
              ),
            ],
          }),
        ],
      }
    },
  },
  {
    id: 'sunday-service',
    title: 'Sunday Service',
    description: 'Welcome, worship, scripture, sermon, and closing structure.',
    buildPresentation: () => ({
      title: 'Sunday Service',
      sections: [
        makeSection(0, 'Welcome', ['Welcome'], 'announcement'),
        makeSection(1, 'Worship Set', ['Song 1', 'Song 2', 'Song 3'], 'song'),
        makeSection(2, 'Scripture', ['Scripture Reading'], 'sermon'),
        makeSection(3, 'Sermon', ['Sermon Title', 'Main Point'], 'sermon'),
        makeSection(4, 'Response', ['Closing Song', 'Benediction'], 'song'),
      ],
    }),
  },
  {
    id: 'worship-set',
    title: 'Worship Set',
    description: 'A clean worship-only flow for rehearsals or a music-first service.',
    buildPresentation: () => ({
      title: 'Worship Set',
      sections: [
        makeSection(0, 'Opening', ['Welcome'], 'announcement'),
        makeSection(1, 'Song 1', ['Verse 1', 'Chorus'], 'song'),
        makeSection(2, 'Song 2', ['Verse 1', 'Chorus'], 'song'),
        makeSection(3, 'Song 3', ['Verse 1', 'Chorus'], 'song'),
      ],
    }),
  },
  {
    id: 'sermon-scripture',
    title: 'Sermon + Scripture',
    description: 'A focused sermon deck with scripture, message points, and response.',
    buildPresentation: () => ({
      title: 'Sermon + Scripture',
      sections: [
        makeSection(0, 'Title', ['Sermon Title'], 'sermon'),
        makeSection(1, 'Scripture', ['Passage'], 'sermon'),
        makeSection(2, 'Message', ['Point 1', 'Point 2', 'Point 3'], 'sermon'),
        makeSection(3, 'Response', ['Prayer', 'Closing Thought'], 'sermon'),
      ],
    }),
  },
  {
    id: 'announcement-loop',
    title: 'Announcement Loop',
    description: 'A rotating announcement deck for pre-service and lobby screens.',
    buildPresentation: () => ({
      title: 'Announcement Loop',
      sections: [
        makeSection(0, 'Announcements', ['Upcoming Event', 'Volunteer Need', 'Giving', 'Next Steps'], 'announcement'),
      ],
    }),
  },
  {
    id: 'student-night',
    title: 'Student Night',
    description: 'A youth-service template with welcome, game moment, worship, message, and response.',
    buildPresentation: () => ({
      title: 'Student Night',
      sections: [
        makeSection(0, 'Welcome', ['Doors Open', 'Host Welcome'], 'announcement'),
        makeSection(1, 'Game Moment', ['Game Intro', 'Instructions', 'Winners'], 'announcement'),
        makeSection(2, 'Worship', ['Song 1', 'Song 2'], 'song'),
        makeSection(3, 'Message', ['Series Title', 'Main Point', 'Response'], 'sermon'),
        makeSection(4, 'Next Steps', ['Small Groups', 'Prayer', 'Dismissal'], 'announcement'),
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
        makeSection(0, 'Gathering', ['Welcome', 'Call To Prayer'], 'announcement'),
        makeSection(1, 'Scripture', ['Opening Passage', 'Reflection Prompt'], 'sermon'),
        makeSection(2, 'Guided Prayer', ['Church', 'City', 'Families', 'Missions'], 'sermon'),
        makeSection(3, 'Response Worship', ['Song 1', 'Song 2'], 'song'),
        makeSection(4, 'Closing', ['Benediction', 'Prayer Teams'], 'announcement'),
      ],
    }),
  },
]
