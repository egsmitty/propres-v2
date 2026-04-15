import { updatePresentation } from '@/utils/ipc'

export async function resolveUnsavedChanges(presentation, isDirty, setDirty, actionLabel = 'continue') {
  if (!presentation || !isDirty) return true

  const shouldSave = window.confirm(`You have unsaved changes. Save before you ${actionLabel}?`)
  if (shouldSave) {
    const result = await updatePresentation(presentation.id, presentation)
    if (result?.success === false) {
      window.alert(result.error || 'Failed to save your presentation.')
      return false
    }
    setDirty(false)
    return true
  }

  return window.confirm(`Discard unsaved changes and ${actionLabel}?`)
}
