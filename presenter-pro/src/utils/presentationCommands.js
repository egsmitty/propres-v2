import { useAppStore } from '@/store/appStore';
import { useEditorStore } from '@/store/editorStore';
import {
  createPresentation,
  createMedia,
  deletePresentation,
  getMedia,
  getSongs,
  pickMedia,
  getPresentation,
  resolveBuiltInMedia,
  touchPresentation,
  updatePresentation,
} from '@/utils/ipc';
import { mediaComparisonKey, normalizePresentation } from '@/utils/backgrounds';
import { PRESENTATION_TEMPLATES, SAMPLE_MEDIA_LIBRARY } from '@/utils/presentationTemplates';
import { uuid } from '@/utils/uuid';
import {
  createMediaSlide,
  createSection,
  createTextSlide,
  promptForSectionSetup,
} from '@/utils/sectionTypes';
import { DEFAULT_PLACEHOLDER_TEXT } from '@/utils/textBoxes';
import { alertDialog, confirmDialog, promptDialog } from '@/utils/dialog';
import {
  captureVersion,
  ensureVersion,
  isDivergedFromLatest,
  revertToLatestVersion,
} from '@/utils/presentationVersionsSync';
import { ensureBuiltInSongsSeeded } from '@/utils/builtInSongSeed';

function selectFirstSlide(presentation) {
  const firstSection = presentation?.sections?.[0];
  const firstSlide = firstSection?.slides?.[0];
  useEditorStore.getState().setSelectedSlide(firstSection?.id ?? null, firstSlide?.id ?? null);
}

function insertSectionAfterSelection(sections = [], selectedSectionId, section) {
  if (!section) return sections;
  if (!sections.length) return [section];

  const currentIndex = sections.findIndex((entry) => entry.id === selectedSectionId);
  const insertIndex = currentIndex >= 0 ? currentIndex + 1 : sections.length;
  const next = [...sections];
  next.splice(insertIndex, 0, section);
  return next;
}

function insertSlideAfterSelection(
  sections = [],
  selectedSectionId,
  selectedSlideId,
  nextSlide,
  fallbackSectionType = 'announcement'
) {
  if (!nextSlide) return { sections, sectionId: selectedSectionId };

  if (!sections.length) {
    const section = createSection(fallbackSectionType, 0, {
      title: 'Slides',
      slides: [nextSlide],
    });
    return { sections: [section], sectionId: section.id };
  }

  const currentSectionIndex = sections.findIndex((section) => section.id === selectedSectionId);
  const targetSectionIndex = currentSectionIndex >= 0 ? currentSectionIndex : 0;
  const targetSection = sections[targetSectionIndex];
  const slides = [...targetSection.slides];
  const selectedIndex = slides.findIndex((slide) => slide.id === selectedSlideId);
  const insertIndex = selectedIndex >= 0 ? selectedIndex + 1 : slides.length;
  slides.splice(insertIndex, 0, nextSlide);

  return {
    sectionId: targetSection.id,
    sections: sections.map((section, index) =>
      index === targetSectionIndex ? { ...section, slides } : section
    ),
  };
}

export function loadPresentationIntoEditor(presentation) {
  const normalized = normalizePresentation(presentation);
  useEditorStore.getState().setPresentation(normalized);
  selectFirstSlide(normalized);
  useAppStore.getState().setCurrentView('editor');
  return normalized;
}

/**
 * @param {object} [options]
 * @param {boolean} [options.fresh] The presentation was just created, so it
 *   counts as never-saved and cannot have diverged from its own first version.
 */
export async function openPresentationInEditor(id, options = {}) {
  await touchPresentation(id);
  const loaded = await getPresentation(id);
  if (!loaded?.success || !loaded.data) return null;
  const normalized = loadPresentationIntoEditor(loaded.data);

  // Set the flags BEFORE any version I/O. A brand-new presentation has to count
  // as unsaved from the instant the editor appears — if a quit lands while the
  // version round trips are still in flight, `resolveUnsavedChanges` sees a
  // clean document and skips the Unsaved Changes gate entirely.
  if (options.fresh) markPresentationFreshOpen();

  // First restore point for a presentation that has none. Pass the SAME
  // normalized object that went into the store — a second, independent
  // normalization would re-mint uuids for id-less content and the snapshot
  // would never match the live document again (plan A5, pitfall 2).
  await ensureVersion(normalized);

  // The crash story: after a crash the row holds autosaved edits while the
  // newest version holds the last deliberate save. They differ, so the document
  // opens unsaved with Revert available — no recovery prompt needed. A freshly
  // created presentation is skipped: it cannot differ from the version just
  // written from it, so the extra round trip buys nothing.
  if (!options.fresh && (await isDivergedFromLatest(normalized))) {
    const state = useEditorStore.getState();
    state.setDirty(true);
    state.setRequiresInitialSave(false);
  }
  return normalized;
}

function markPresentationFreshOpen() {
  const state = useEditorStore.getState();
  state.setDirty(false);
  state.setRequiresInitialSave(true);
}

export async function createNewPresentation(title = 'Untitled Presentation') {
  const initialSection = createSection('announcement', 0, {
    title: 'Slides',
    slides: [createTextSlide('announcement')],
  });

  const result = await createPresentation({
    title,
    sections: [initialSection],
  });

  if (!result?.success || !result.data) return null;
  return openPresentationInEditor(result.data.id, { fresh: true });
}

export async function createPresentationFromTemplate(templateId) {
  const template = PRESENTATION_TEMPLATES.find((item) => item.id === templateId);
  if (!template) return null;

  await ensureBuiltInSongsSeeded();

  const builtInMediaCache = new Map();

  async function resolveTemplateMediaDefinition(mediaDefinition) {
    if (!mediaDefinition) return null;
    if (mediaDefinition.file_path) return mediaDefinition;

    const assetName = mediaDefinition.asset_name;
    if (!assetName) return mediaDefinition;

    if (!builtInMediaCache.has(assetName)) {
      const result = await resolveBuiltInMedia([assetName]);
      builtInMediaCache.set(assetName, result?.success ? result.data?.[assetName] || null : null);
    }

    const resolvedPath = builtInMediaCache.get(assetName);
    if (!resolvedPath) return null;

    return {
      ...mediaDefinition,
      file_path: resolvedPath,
    };
  }

  async function ensureMedia(mediaDefinition) {
    const resolvedDefinition = await resolveTemplateMediaDefinition(mediaDefinition);
    if (!resolvedDefinition?.file_path) return null;

    const existing = await getMedia();
    const matches = existing?.success ? existing.data : [];
    const targetKey =
      resolvedDefinition.canonical_path || mediaComparisonKey(resolvedDefinition.file_path);
    const found = matches.find((item) =>
      item.canonical_path && targetKey
        ? item.canonical_path === targetKey
        : item.file_path === resolvedDefinition.file_path
    );
    if (found) return found;

    const created = await createMedia(resolvedDefinition);
    return created?.success ? created.data : null;
  }

  const songsResult = await getSongs();
  const songLibrary = songsResult?.success ? songsResult.data || [] : [];

  const payload = await template.buildPresentation({
    ensureMedia,
    songLibrary,
    sampleMedia: SAMPLE_MEDIA_LIBRARY,
  });
  const result = await createPresentation(payload);
  if (!result?.success || !result.data) return null;

  return openPresentationInEditor(result.data.id, { fresh: true });
}

export async function saveCurrentPresentation() {
  const state = useEditorStore.getState();
  const presentation = state.presentation;
  if (!presentation) return null;

  const result = await updatePresentation(presentation.id, presentation);
  if (result?.success && result.data) {
    // Deliberately NOT loadPresentationIntoEditor: that resets the selection to
    // the first slide and clears undo history, which is fine when opening a
    // document and wrong when saving the one you are working in.
    state.syncSavedPresentation(result.data);
    // Save is the commit: it is what moves the restore point forward. The
    // snapshot is taken from the same normalized value the store now holds.
    await captureVersion(useEditorStore.getState().presentation);
  } else if (result?.success) {
    state.setDirty(false);
    state.setRequiresInitialSave(false);
  }
  return result;
}

/**
 * Throw away every change since the last save (plan A5).
 *
 * The native File menu has no enable/disable plumbing, so this must fail out
 * loud rather than silently returning — otherwise the same command behaves
 * differently depending on which menu bar the user reaches for.
 */
export async function revertCurrentPresentationToLastSave() {
  const state = useEditorStore.getState();
  if (!state.presentation) return false;
  if (!state.isDirty || state.requiresInitialSave) {
    await alertDialog('There are no changes to revert.', { title: 'Revert to Last Save' });
    return false;
  }

  const ok = await confirmDialog(
    'Your changes since the last save will be lost. This cannot be undone.',
    { title: 'Revert to Last Save', confirmLabel: 'Revert', danger: true }
  );
  if (!ok) return false;

  return revertToLatestVersion(state.presentation.id);
}

export async function saveCurrentPresentationAs() {
  const state = useEditorStore.getState();
  const presentation = state.presentation;
  if (!presentation) return null;

  const suggestedTitle = presentation.title?.trim()
    ? `${presentation.title} Copy`
    : 'Untitled Presentation Copy';
  const title = await promptDialog('Save presentation as:', suggestedTitle, {
    title: 'Save As',
    confirmLabel: 'Save',
  });
  if (!title) return null;

  const result = await createPresentation({
    title,
    sections: presentation.sections || [],
    aspectRatio: presentation.aspectRatio || '16:9',
    customAspectWidth: presentation.customAspectWidth ?? null,
    customAspectHeight: presentation.customAspectHeight ?? null,
  });
  if (!result?.success || !result.data) return result;

  const loaded = await openPresentationInEditor(result.data.id);
  if (loaded) useEditorStore.getState().setDirty(false);
  return { success: true, data: loaded };
}

export async function insertNewSlideIntoCurrentPresentation() {
  const state = useEditorStore.getState();
  const presentation = state.presentation;
  if (!presentation) return null;

  const currentSection =
    presentation.sections.find((section) => section.id === state.selectedSectionId) ||
    presentation.sections[0] ||
    null;
  let sectionType = currentSection?.type || 'announcement';
  const newSlide = createTextSlide(sectionType);
  const sections = presentation.sections ? [...presentation.sections] : [];
  const inserted = insertSlideAfterSelection(
    sections,
    state.selectedSectionId,
    state.selectedSlideId,
    newSlide,
    sectionType
  );

  const preserveCurrentEditing =
    state.editingSlideId === state.selectedSlideId && Boolean(state.selectedSlideId);
  const preservedTextBoxIds = preserveCurrentEditing ? [...(state.selectedTextBoxIds || [])] : [];

  // setPresentation resets both flags unless told otherwise; an ordinary edit
  // must not silently turn a never-saved presentation into a saved one, or
  // Discard picks the wrong (destructive) branch.
  state.setPresentation(
    normalizePresentation({
      ...presentation,
      sections: inserted.sections,
    }),
    { isDirty: true, requiresInitialSave: state.requiresInitialSave }
  );
  state.setDirty(true);
  if (preserveCurrentEditing) {
    state.setSelectedSlide(state.selectedSectionId, state.selectedSlideId);
    state.setSelectedTextBoxIds(preservedTextBoxIds);
    state.setEditingSlide(state.selectedSlideId);
  } else {
    state.setSelectedSlide(inserted.sectionId, newSlide.id, { suppressAutoEdit: true });
  }

  return newSlide;
}

export function insertSectionAfterCurrentSelection(section) {
  const state = useEditorStore.getState();
  if (!state.presentation || !section) return null;

  const nextSections = insertSectionAfterSelection(
    state.presentation.sections || [],
    state.selectedSectionId,
    section
  );

  state.mutateSections(() => nextSections);
  state.setSelectedSlide(section.id, section.slides[0]?.id ?? null);
  return section;
}

export async function insertNewSectionIntoCurrentPresentation(sectionType = 'announcement') {
  const state = useEditorStore.getState();
  const presentation = state.presentation;
  if (!presentation) return null;

  const setup = await promptForSectionSetup(sectionType);
  if (!setup) return null;

  const section = createSection(setup.type, presentation.sections.length, {
    title: setup.title,
    slides: [createTextSlide(setup.type)],
  });

  return insertSectionAfterCurrentSelection(section);
}

export async function ensureSectionForInsertion(preferredType = null) {
  const state = useEditorStore.getState();
  const presentation = state.presentation;
  if (!presentation) return null;

  const existing =
    presentation.sections.find((section) => section.id === state.selectedSectionId) ||
    presentation.sections[0] ||
    null;
  if (existing) return existing;

  const setup = await promptForSectionSetup(preferredType);
  if (!setup) return null;

  const section = createSection(setup.type, presentation.sections.length, {
    title: setup.title,
    slides: [],
  });

  state.addSection(section);
  return section;
}

export async function insertMediaSlideIntoCurrentPresentation(media) {
  const state = useEditorStore.getState();
  const presentation = state.presentation;
  if (!presentation || !media) return null;

  const slide = createMediaSlide(media);
  const targetSection = await ensureSectionForInsertion();
  if (!targetSection) return null;

  const inserted = insertSlideAfterSelection(
    state.presentation.sections || [],
    state.selectedSectionId || targetSection.id,
    state.selectedSlideId,
    slide,
    targetSection.type
  );

  state.mutateSections(() => inserted.sections);
  state.setSelectedSlide(inserted.sectionId, slide.id);
  return slide;
}

function cloneSlideForClipboard(slide) {
  return JSON.parse(JSON.stringify(slide));
}

export async function importMediaToSelectedSlide(kind) {
  const state = useEditorStore.getState();
  const presentation = state.presentation;
  if (!presentation) return null;

  const picked = await pickMedia(kind);
  if (!picked?.success || !picked.data) return picked;

  const inserted = await insertMediaSlideIntoCurrentPresentation(picked.data);
  return inserted ? picked : null;
}

export function copySelectedSlideToClipboard() {
  const state = useEditorStore.getState();
  const slide = state.presentation?.sections
    ?.find((section) => section.id === state.selectedSectionId)
    ?.slides?.find((item) => item.id === state.selectedSlideId);

  if (!slide) return false;
  useAppStore.getState().setSlideClipboard(cloneSlideForClipboard(slide));
  return true;
}

export function pasteSlideAfterSelected() {
  const state = useEditorStore.getState();
  const clipboard = useAppStore.getState().slideClipboard;
  if (!state.presentation || !clipboard) return false;

  const targetSectionId = state.selectedSectionId || state.presentation.sections[0]?.id;
  if (!targetSectionId) return false;

  const nextSlide = {
    ...cloneSlideForClipboard(clipboard),
    id: uuid(),
  };

  state.mutateSections((sections) =>
    sections.map((section) => {
      if (section.id !== targetSectionId) return section;
      const slides = [...section.slides];
      const selectedIndex = slides.findIndex((slide) => slide.id === state.selectedSlideId);
      const insertIndex = selectedIndex >= 0 ? selectedIndex + 1 : slides.length;
      slides.splice(insertIndex, 0, nextSlide);
      return { ...section, slides };
    })
  );

  state.setSelectedSlide(targetSectionId, nextSlide.id);
  return true;
}

export function clearSelectedSlide() {
  const state = useEditorStore.getState();
  if (!state.presentation || !state.selectedSectionId || !state.selectedSlideId) return false;

  state.mutateSections((sections) =>
    sections.map((section) => {
      if (section.id !== state.selectedSectionId) return section;
      return {
        ...section,
        slides: section.slides.map((slide) =>
          slide.id === state.selectedSlideId
            ? {
                ...slide,
                type: 'text',
                body: '',
                mediaId: null,
                backgroundId: null,
                placeholderText: slide.placeholderText ?? DEFAULT_PLACEHOLDER_TEXT,
              }
            : slide
        ),
      };
    })
  );

  return true;
}

export async function deleteSelectedSlideFromCurrentPresentation() {
  const state = useEditorStore.getState();
  const presentation = state.presentation;
  if (!presentation || !state.selectedSectionId || !state.selectedSlideId) return false;

  const selectedIds = [...(state.selectedSlideIds || [])];
  if (!selectedIds.includes(state.selectedSlideId)) selectedIds.push(state.selectedSlideId);
  if (!selectedIds.length) return false;

  const idsToDelete = new Set(selectedIds);
  const allSlides = presentation.sections.flatMap((section) =>
    section.slides.map((slide) => ({ id: slide.id, sectionId: section.id }))
  );
  const primaryIndex = allSlides.findIndex((slide) => slide.id === state.selectedSlideId);
  const nextSelection =
    allSlides.slice(primaryIndex + 1).find((slide) => !idsToDelete.has(slide.id)) ||
    allSlides
      .slice(0, Math.max(0, primaryIndex))
      .reverse()
      .find((slide) => !idsToDelete.has(slide.id)) ||
    null;

  const nextSections = presentation.sections.map((section) => ({
    ...section,
    slides: section.slides.filter((slide) => !idsToDelete.has(slide.id)),
  }));

  state.mutateSections(() => nextSections);
  state.setSelectedSlide(nextSelection?.sectionId ?? null, nextSelection?.id ?? null);
  return true;
}

export async function renamePresentationById(id, currentTitle) {
  const title = await promptDialog('', currentTitle || 'Untitled Presentation', {
    title: 'Rename Presentation',
    confirmLabel: 'Rename',
    placeholder: 'Presentation title',
    // Plan G1. Not a default name here: this renames a presentation in a list,
    // and quietly substituting "Untitled Presentation" would overwrite a name
    // the user chose AND pin it as the newest restore point below.
    requireValue: 'A presentation needs a name.',
  });
  if (!title) return null;

  const loaded = await getPresentation(id);
  if (!loaded?.success || !loaded.data) return loaded;

  const result = await updatePresentation(id, {
    ...loaded.data,
    title,
  });
  // Renaming from Home writes the row without touching the editor store. With
  // no version captured, the row would diverge from its newest restore point
  // and the presentation would open dirty forever (plan A5, fact 10).
  if (result?.success && result.data) await captureVersion(normalizePresentation(result.data));
  return result;
}

export async function deletePresentationById(id, title) {
  const ok = await confirmDialog(`Delete "${title}"?`, {
    title: 'Delete Presentation',
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!ok) return null;
  return deletePresentation(id);
}
