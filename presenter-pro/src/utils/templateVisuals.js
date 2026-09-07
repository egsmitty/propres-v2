// Visual DATA for the Home page's template cards: gradients and accents are
// part of each template's identity, not UI chrome, so they stay literal here
// (plan E1).

export const TEMPLATE_VISUALS = {
  blank: {
    gradient: 'linear-gradient(160deg, #fcfcfd 0%, #eef1f7 100%)',
    card: '#ffffff',
    accent: '#2f73ff',
    eyebrow: 'Start Fresh',
    title: 'Blank Presentation',
    lines: ['Build your own flow', 'Add songs, media, and slides'],
  },
  'sunday-service': {
    gradient: 'linear-gradient(160deg, #102542 0%, #1f5f8b 55%, #8eb8e5 100%)',
    card: 'rgba(255,255,255,0.94)',
    accent: '#174d77',
    eyebrow: 'Weekend Service',
    title: 'Sunday Flow',
    lines: ['Welcome', 'Worship Set', 'Scripture', 'Sermon'],
  },
  'worship-set': {
    gradient: 'linear-gradient(160deg, #2b193d 0%, #5f2a82 52%, #d088ff 100%)',
    card: 'rgba(255,255,255,0.94)',
    accent: '#602f86',
    eyebrow: 'Music Set',
    title: 'Worship Deck',
    lines: ['Opening', 'Song 1', 'Song 2', 'Song 3'],
  },
  'sermon-scripture': {
    gradient: 'linear-gradient(160deg, #4a2208 0%, #8b4513 58%, #f0c27b 100%)',
    card: 'rgba(255,255,255,0.95)',
    accent: '#7b3d11',
    eyebrow: 'Message Focus',
    title: 'Sermon Notes',
    lines: ['Title', 'Passage', 'Point 1', 'Response'],
  },
  'announcement-loop': {
    gradient: 'linear-gradient(160deg, #0f2b21 0%, #1d5c47 55%, #91d9bf 100%)',
    card: 'rgba(255,255,255,0.95)',
    accent: '#205945',
    eyebrow: 'Lobby Rotation',
    title: 'Announcement Loop',
    lines: ['Upcoming Event', 'Volunteer Need', 'Giving'],
  },
  'student-night': {
    gradient: 'linear-gradient(160deg, #1f1b42 0%, #304f9c 52%, #ffb84d 100%)',
    card: 'rgba(255,255,255,0.96)',
    accent: '#314f9a',
    eyebrow: 'Youth Service',
    title: 'Student Night',
    lines: ['Welcome', 'Game Moment', 'Worship', 'Message'],
  },
  'prayer-night': {
    gradient: 'linear-gradient(160deg, #0c2430 0%, #1f5a68 52%, #d9c89e 100%)',
    card: 'rgba(255,255,255,0.96)',
    accent: '#295c6d',
    eyebrow: 'Quiet Gathering',
    title: 'Prayer Night',
    lines: ['Scripture', 'Guided Prayer', 'Response', 'Closing'],
  },
  'featured-sunday-example': {
    gradient: 'linear-gradient(160deg, #1b2336 0%, #314a78 52%, #f0b45f 100%)',
    card: 'rgba(255,255,255,0.96)',
    accent: '#24416f',
    eyebrow: 'Featured Example',
    title: 'Sunday Morning',
    lines: ['Announcements', 'Worship', 'Message', 'Media'],
  },
};
