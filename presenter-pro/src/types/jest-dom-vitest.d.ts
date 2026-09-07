/* eslint-disable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars -- module augmentation idiom: the empty interfaces merge into Vitest's, `any` mirrors jest-dom's own typing, and `T` must be declared to match the target's type parameters */
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

// Vitest 5 exposes `Matchers<R, T>` as the extension point (its `Assertion`
// now takes two type parameters), while @testing-library/jest-dom 7 still
// augments a single-parameter `Assertion<T>`, so its matchers never attach.
// This augmentation targets the interface Vitest 5 actually merges. Drop it
// once jest-dom ships a Vitest 5 augmentation.
declare module 'vitest' {
  interface Matchers<R, T> extends TestingLibraryMatchers<any, R> {}
  interface AsymmetricMatchersContaining extends TestingLibraryMatchers<any, any> {}
}
