/**
 * Plan VH2 (issue #160) — what restoring a version would change.
 *
 * Pure: no I/O, no store. Compares the CURRENT (live) document against a
 * VERSION and reports the consequence of restoring that version:
 *   - `added`   — in the version, not in the current document: you would get it back;
 *   - `removed` — in the current document, not in the version: you would LOSE it;
 *   - `changed` — same id, different content;
 *   - `same`.
 * The tree is the version's structure (what you are heading into), annotated,
 * with removed sections and slides listed in place so losses are visible.
 *
 * Content keys use V1's canonicalizer (`canonicalJson`), over content-bearing
 * fields only. Deliberately excluded: `collapsed` and `color` on a section
 * (UI/cosmetic), `placeholderText` and the legacy `textBox` mirror on a slide.
 * When either side has no `textBoxes` (a legacy body-only snapshot), both sides
 * are keyed without them so the comparison falls back to `body`.
 */

import { canonicalJson } from '@/utils/presentationVersions';

export type DiffStatus = 'same' | 'added' | 'removed' | 'changed';

export interface DiffSlide {
  id: string;
  /** The slide's label, else its preview, else "Untitled slide". */
  name: string;
  /** First non-empty line of the body with tags stripped, capped at 40 chars. */
  preview: string;
  status: DiffStatus;
}

export interface DiffSection {
  id: string;
  title: string;
  type: string;
  status: DiffStatus;
  slides: DiffSlide[];
}

export interface DiffSummary {
  slidesAdded: number;
  slidesRemoved: number;
  slidesChanged: number;
  sectionsAdded: number;
  sectionsRemoved: number;
  titleChanged: boolean;
  aspectChanged: boolean;
}

export interface VersionDiff {
  summary: DiffSummary;
  tree: DiffSection[];
}

type Node = Record<string, unknown>;

const PREVIEW_MAX = 40;

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function nodes(value: unknown): Node[] {
  return Array.isArray(value) ? (value as Node[]) : [];
}

function idOf(node: Node): string {
  return String(node.id ?? '');
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** First non-empty line of the body, tags stripped, capped at `PREVIEW_MAX`. */
export function slidePreview(slide: Node): string {
  const line =
    stripHtml(str(slide.body))
      .split('\n')
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .find((l) => l.length > 0) ?? '';
  return line.length > PREVIEW_MAX ? `${line.slice(0, PREVIEW_MAX - 1)}…` : line;
}

function describeSlide(slide: Node): Omit<DiffSlide, 'status'> {
  const preview = slidePreview(slide);
  const label = str(slide.label).trim();
  return { id: idOf(slide), name: label || preview || 'Untitled slide', preview };
}

function hasBoxes(slide: Node): boolean {
  return Array.isArray(slide.textBoxes) && slide.textBoxes.length > 0;
}

function slideKey(slide: Node, withBoxes: boolean): string {
  return canonicalJson({
    label: slide.label ?? null,
    body: slide.body ?? null,
    notes: slide.notes ?? null,
    backgroundId: slide.backgroundId ?? null,
    textStyle: slide.textStyle ?? null,
    textBoxes: withBoxes ? slide.textBoxes : null,
  });
}

function sectionOwnKey(section: Node): string {
  return canonicalJson({
    title: section.title ?? null,
    type: section.type ?? null,
    backgroundId: section.backgroundId ?? null,
  });
}

function aspectOf(doc: Node): unknown {
  return {
    aspectRatio: doc.aspectRatio ?? null,
    customAspectWidth: doc.customAspectWidth ?? null,
    customAspectHeight: doc.customAspectHeight ?? null,
  };
}

export function diffPresentationStructure(currentIn: unknown, versionIn: unknown): VersionDiff {
  const current = (currentIn ?? {}) as Node;
  const version = (versionIn ?? {}) as Node;
  const summary: DiffSummary = {
    slidesAdded: 0,
    slidesRemoved: 0,
    slidesChanged: 0,
    sectionsAdded: 0,
    sectionsRemoved: 0,
    titleChanged: false,
    aspectChanged: false,
  };
  const currentSections = new Map(nodes(current.sections).map((s) => [idOf(s), s]));
  const tree: DiffSection[] = [];

  for (const vSection of nodes(version.sections)) {
    const id = idOf(vSection);
    const cSection = currentSections.get(id);
    const header = { id, title: str(vSection.title), type: str(vSection.type) };

    if (!cSection) {
      const slides = nodes(vSection.slides).map((s) => ({
        ...describeSlide(s),
        status: 'added' as const,
      }));
      summary.sectionsAdded += 1;
      summary.slidesAdded += slides.length;
      tree.push({ ...header, status: 'added', slides });
      continue;
    }

    const currentSlides = new Map(nodes(cSection.slides).map((s) => [idOf(s), s]));
    const versionOrder = nodes(vSection.slides).map(idOf);
    const currentOrder = nodes(cSection.slides).map(idOf);
    // Reordering slides is a real change (V1's rule), so the section is
    // `changed` even when every slide's own content is `same`. Ids are uuids,
    // so '/' cannot occur inside one.
    let changed =
      sectionOwnKey(vSection) !== sectionOwnKey(cSection) ||
      versionOrder.join('/') !== currentOrder.join('/');
    const slides: DiffSlide[] = [];

    for (const vSlide of nodes(vSection.slides)) {
      const cSlide = currentSlides.get(idOf(vSlide));
      if (!cSlide) {
        slides.push({ ...describeSlide(vSlide), status: 'added' });
        summary.slidesAdded += 1;
        changed = true;
        continue;
      }
      const withBoxes = hasBoxes(vSlide) && hasBoxes(cSlide);
      const same = slideKey(vSlide, withBoxes) === slideKey(cSlide, withBoxes);
      slides.push({ ...describeSlide(vSlide), status: same ? 'same' : 'changed' });
      if (!same) {
        summary.slidesChanged += 1;
        changed = true;
      }
    }
    // What you would lose, listed in place after the version's own slides.
    for (const cSlide of nodes(cSection.slides)) {
      if (versionOrder.includes(idOf(cSlide))) continue;
      slides.push({ ...describeSlide(cSlide), status: 'removed' });
      summary.slidesRemoved += 1;
      changed = true;
    }
    tree.push({ ...header, status: changed ? 'changed' : 'same', slides });
  }

  // Sections only in the current document: restoring drops them, slides and all.
  const versionIds = new Set(nodes(version.sections).map(idOf));
  for (const cSection of nodes(current.sections)) {
    if (versionIds.has(idOf(cSection))) continue;
    const slides = nodes(cSection.slides).map((s) => ({
      ...describeSlide(s),
      status: 'removed' as const,
    }));
    summary.sectionsRemoved += 1;
    summary.slidesRemoved += slides.length;
    tree.push({
      id: idOf(cSection),
      title: str(cSection.title),
      type: str(cSection.type),
      status: 'removed',
      slides,
    });
  }

  summary.titleChanged = str(current.title) !== str(version.title);
  summary.aspectChanged = canonicalJson(aspectOf(current)) !== canonicalJson(aspectOf(version));
  return { summary, tree };
}
