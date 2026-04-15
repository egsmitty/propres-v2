import { deletePresentation, updatePresentation } from '@/utils/ipc'

export async function resolveUnsavedChanges({
  presentation,
  isDirty,
  requiresInitialSave,
  setDirty,
  setRequiresInitialSave,
  actionLabel = 'continue',
}) {
  if (!presentation || (!isDirty && !requiresInitialSave)) return true

  const savePrompt = requiresInitialSave
    ? `Save this new presentation before you ${actionLabel}?`
    : `You have unsaved changes. Save before you ${actionLabel}?`

  const shouldSave = window.confirm(savePrompt)
  if (shouldSave) {
    const result = await updatePresentation(presentation.id, presentation)
    if (result?.success === false) {
      window.alert(result.error || 'Failed to save your presentation.')
      return false
    }
    setDirty(false)
    setRequiresInitialSave?.(false)
    return true
  }

  const discardPrompt = requiresInitialSave
    ? `Discard this new presentation and ${actionLabel}?`
    : `Discard unsaved changes and ${actionLabel}?`

  const shouldDiscard = window.confirm(discardPrompt)
  if (!shouldDiscard) return false

  if (requiresInitialSave && presentation.id) {
    const result = await deletePresentation(presentation.id)
    if (result?.success === false) {
      window.alert(result.error || 'Failed to discard your new presentation.')
      return false
    }
  }

  setDirty(false)
  setRequiresInitialSave?.(false)
  return true
}
