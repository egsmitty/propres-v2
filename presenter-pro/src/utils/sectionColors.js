// Leaf module (REPO-30a): `sectionTypes.js` and `backgrounds.js` used to
// import each other, with `SECTION_COLORS` as the piece `sectionTypes.js`
// needed from `backgrounds.js`. Moving the data here — a module that imports
// nothing — breaks the cycle without changing what either file exports.
export const SECTION_COLORS = [
  'var(--section-1)',
  'var(--section-2)',
  'var(--section-3)',
  'var(--section-4)',
  'var(--section-5)',
];
