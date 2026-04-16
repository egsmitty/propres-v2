import { deletePresentation, updatePresentation } from '@/utils/ipc'
import { alertDialog, showDialog } from '@/utils/dialog'

export async function resolveUnsavedChanges({
  presentation,
  isDirty,
  requiresInitialSave,
  setDirty,
  setRequiresInitialSave,
  actionLabel = 'continue',
}) {
  if (!presentation || (!isDirty && !requiresInitialSave)) return true

  const description = requiresInitialSave
    ? `Save this new presentation before you ${actionLabel}?`
    : `You have unsaved changes. Save before you ${actionLabel}?`

  const result = await showDialog({
    title: 'Unsaved Changes',
    description,
    actions: [
      { label: 'Cancel', value: 'cancel', cancel: true },
      { label: 'Discard', value: 'discard', variant: 'danger' },
      { label: 'Save', value: 'save', primary: true },
    ],
  })

  const choice = result?.action
  if (choice === 'cancel' || !choice) return false

  if (choice === 'save') {
    const saveResult = await updatePresentation(presentation.id, presentation)
    if (saveResult?.success === false) {
      await alertDialog(saveResult.error || 'Failed to save your presentation.', { title: 'Save Failed' })
      return false
    }
    setDirty(false)
    setRequiresInitialSave?.(false)
    return true
  }

  // discard
  if (requiresInitialSave && presentation.id) {
    const deleteResult = await deletePresentation(presentation.id)
    if (deleteResult?.success === false) {
      await alertDialog(deleteResult.error || 'Failed to discard your new presentation.', { title: 'Discard Failed' })
      return false
    }
  }

  setDirty(false)
  setRequiresInitialSave?.(false)
  return true
}
