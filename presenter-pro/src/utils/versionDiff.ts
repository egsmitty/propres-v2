/**
 * Plans VH2/VH3 (issues #160, #163) — what restoring a version would change.
 *
 * Pure: no I/O, no store. Compares the CURRENT (live) document against a
 * VERSION and reports the consequence of restoring that version:
 *   - `added`   — in the version, not in the current document: you would get it back;
 *   - `removed` — in the current document, not in the version: you would LOSE it;
 *   - `changed` — same id, different content — with WHICH aspect changed and a
 *                 literal before/after of the slide's text (#163);
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
export type SlideAspect = 'text' | 'formatting' | 'label' | 'notes' | 'background' | 'layout';
export type SectionAspect = 'title' | 'type' | 'background' | 'order';

export interface DiffSlide {
  id: string;
  /** The slide's label, else its preview, else "Untitled slide". */
  name: string;
  /** First non-empty line of the body with tags stripped, capped at 40 chars. */
  preview: string;
  status: DiffStatus;
  /** For `changed`: which aspects differ, in a fixed order. */
  changes?: SlideAspect[];
  /** The slide's text NOW (current document), for `changed` and `removed`. */
  before?: string;
  /** The slide's text AFTER restoring (the version), for `changed` and `added`. */
  after?: string;
}

export interface DiffSection {
  id: string;
  title: string;
  type: string;
  status: DiffStatus;
  /** For `changed`: the section's own aspects that differ (empty if only its slides changed). */
  changes?: SectionAspect[];
  slides: DiffSlide[];
}

export interface DiffSummary {
  slidesAdded: number;
  slidesRemoved: number;
  slidesChanged: number;
  sectionsAdded: number;
  sectionsRemoved: number;
  /** Slide or section backgrounds that differ. */
  backgroundsChanged: number;
  titleChanged: boolean;
  titleBefore: string;
  titleAfter: string;
  aspectChanged: boolean;
}

export interface VersionDiff {
  summary: DiffSummary;
  tree: DiffSection[];
}

type Node = Record<string, unknown>;

const PREVIEW_MAX = 40;
const TEXT_MAX = 160;

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

function cap(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** The slide's whole text, tags stripped, whitespace collapsed — uncapped. */
function plainText(slide: Node): string {
  return stripHtml(str(slide.body)).replace(/\s+/g, ' ').trim();
}

/** First non-empty line of the body, tags stripped, capped at `PREVIEW_MAX`. */
export function slidePreview(slide: Node): string {
  const line =
    stripHtml(str(slide.body))
      .split('\n')
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .find((l) => l.length > 0) ?? '';
  return cap(line, PREVIEW_MAX);
}

function describeSlide(slide: Node): Pick<DiffSlide, 'id' | 'name' | 'preview'> {
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

/** Which aspects of a changed slide differ, in a fixed, readable order. */
function slideAspects(current: Node, version: Node, withBoxes: boolean): SlideAspect[] {
  const out: SlideAspect[] = [];
  const textDiffers = plainText(current) !== plainText(version);
  const formattingDiffers = !textDiffers && str(current.body) !== str(version.body);
  if (textDiffers) out.push('text');
  if (formattingDiffers) out.push('formatting');
  if (str(current.label) !== str(version.label)) out.push('label');
  if (str(current.notes) !== str(version.notes)) out.push('notes');
  if ((current.backgroundId ?? null) !== (version.backgroundId ?? null)) out.push('background');
  const styleDiffers =
    canonicalJson(current.textStyle ?? null) !== canonicalJson(version.textStyle ?? null);
  const boxesDiffer =
    withBoxes && canonicalJson(current.textBoxes) !== canonicalJson(version.textBoxes);
  if (styleDiffers || (boxesDiffer && !textDiffers && !formattingDiffers)) out.push('layout');
  return out.length ? out : ['layout'];
}

function sectionAspects(current: Node, version: Node): SectionAspect[] {
  const out: SectionAspect[] = [];
  if (str(current.title) !== str(version.title)) out.push('title');
  if (str(current.type) !== str(version.type)) out.push('type');
  if ((current.backgroundId ?? null) !== (version.backgroundId ?? null)) out.push('background');
  const currentIds = nodes(current.slides).map(idOf);
  const versionIds = nodes(version.slides).map(idOf);
  // Ids are uuids, so '/' cannot occur inside one. Reordering is a real change
  // (V1's rule) — but only when it is the SAME set of slides in a new sequence.
  const sameSet = [...currentIds].sort().join('/') === [...versionIds].sort().join('/');
  if (sameSet && currentIds.join('/') !== versionIds.join('/')) out.push('order');
  return out;
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
    backgroundsChanged: 0,
    titleChanged: false,
    titleBefore: str(current.title),
    titleAfter: str(version.title),
    aspectChanged: false,
  };
  const currentSections = new Map(nodes(current.sections).map((s) => [idOf(s), s]));
  const tree: DiffSection[] = [];

  for (const vSection of nodes(version.sections)) {
    const id = idOf(vSection);
    const cSection = currentSections.get(id);
    const header = { id, title: str(vSection.title), type: str(vSection.type) };

    if (!cSection) {
      const slides = nodes(vSection.slides).map((s): DiffSlide => ({
        ...describeSlide(s),
        status: 'added',
        after: cap(plainText(s), TEXT_MAX),
      }));
      summary.sectionsAdded += 1;
      summary.slidesAdded += slides.length;
      tree.push({ ...header, status: 'added', slides });
      continue;
    }

    const currentSlides = new Map(nodes(cSection.slides).map((s) => [idOf(s), s]));
    const versionIds = new Set(nodes(vSection.slides).map(idOf));
    const ownChanges = sectionAspects(cSection, vSection);
    if (ownChanges.includes('background')) summary.backgroundsChanged += 1;
    let changed = ownChanges.length > 0;
    const slides: DiffSlide[] = [];

    for (const vSlide of nodes(vSection.slides)) {
      const cSlide = currentSlides.get(idOf(vSlide));
      if (!cSlide) {
        slides.push({
          ...describeSlide(vSlide),
          status: 'added',
          after: cap(plainText(vSlide), TEXT_MAX),
        });
        summary.slidesAdded += 1;
        changed = true;
        continue;
      }
      const withBoxes = hasBoxes(vSlide) && hasBoxes(cSlide);
      if (slideKey(vSlide, withBoxes) === slideKey(cSlide, withBoxes)) {
        slides.push({ ...describeSlide(vSlide), status: 'same' });
        continue;
      }
      const changes = slideAspects(cSlide, vSlide, withBoxes);
      if (changes.includes('background')) summary.backgroundsChanged += 1;
      slides.push({
        ...describeSlide(vSlide),
        status: 'changed',
        changes,
        before: cap(plainText(cSlide), TEXT_MAX),
        after: cap(plainText(vSlide), TEXT_MAX),
      });
      summary.slidesChanged += 1;
      changed = true;
    }
    // What you would lose, listed in place after the version's own slides.
    for (const cSlide of nodes(cSection.slides)) {
      if (versionIds.has(idOf(cSlide))) continue;
      slides.push({
        ...describeSlide(cSlide),
        status: 'removed',
        before: cap(plainText(cSlide), TEXT_MAX),
      });
      summary.slidesRemoved += 1;
      changed = true;
    }
    tree.push(
      changed
        ? { ...header, status: 'changed', changes: ownChanges, slides }
        : { ...header, status: 'same', slides }
    );
  }

  // Sections only in the current document: restoring drops them, slides and all.
  const versionSectionIds = new Set(nodes(version.sections).map(idOf));
  for (const cSection of nodes(current.sections)) {
    if (versionSectionIds.has(idOf(cSection))) continue;
    const slides = nodes(cSection.slides).map((s): DiffSlide => ({
      ...describeSlide(s),
      status: 'removed',
      before: cap(plainText(s), TEXT_MAX),
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

  summary.titleChanged = summary.titleBefore !== summary.titleAfter;
  summary.aspectChanged = canonicalJson(aspectOf(current)) !== canonicalJson(aspectOf(version));
  return { summary, tree };
}
