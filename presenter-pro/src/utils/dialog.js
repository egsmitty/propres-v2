import { useDialogStore } from '@/store/dialogStore';

// Low-level: show a fully-specified dialog and resolve with { action, values } or null if cancelled.
// - fields: optional [{ name, label, type: 'text'|'select', defaultValue, options?, placeholder? }]
// - actions: [{ label, value, variant?, primary?, cancel? }]
export function showDialog(config) {
  return new Promise((resolve) => {
    useDialogStore.getState().show({
      ...config,
      resolve: (result) => {
        useDialogStore.getState().close();
        resolve(result);
      },
    });
  });
}

// Convenience: yes/no confirm. Resolves to boolean.
export async function confirmDialog(message, options = {}) {
  const result = await showDialog({
    title: options.title || 'Confirm',
    description: message,
    actions: [
      { label: options.cancelLabel || 'Cancel', value: false, cancel: true },
      {
        label: options.confirmLabel || 'OK',
        value: true,
        primary: true,
        variant: options.danger ? 'danger' : 'primary',
      },
    ],
  });
  return Boolean(result?.action);
}

// Convenience: single-line text prompt. Resolves to string (trimmed) or null.
//
// `options.requireValue` (plan G1): a message to show when the user confirms an
// EMPTY box, after which the prompt comes back. Rename flows pass it, because
// there is no sensible default for a name someone chose and silently dropping
// the rename — which is what this did for every caller — tells them nothing.
// Create flows leave it off, where empty legitimately means "never mind".
// Cancel always cancels, with or without it.
export async function promptDialog(message, defaultValue = '', options = {}) {
  let seededValue = defaultValue;

  for (;;) {
    const result = await showDialog({
      title: options.title || 'Input',
      description: message,
      fields: [
        {
          name: 'value',
          type: 'text',
          defaultValue: seededValue,
          placeholder: options.placeholder,
          autoFocus: true,
        },
      ],
      actions: [
        { label: 'Cancel', value: null, cancel: true },
        { label: options.confirmLabel || 'OK', value: 'confirm', primary: true },
      ],
    });

    if (!result || result.action !== 'confirm') return null;
    const value = (result.values?.value || '').trim();
    if (value) return value;
    if (!options.requireValue) return null;

    await alertDialog(options.requireValue, {
      title: options.requireValueTitle || 'Name Required',
    });
    seededValue = '';
  }
}

// Convenience: info alert. Resolves when acknowledged.
export async function alertDialog(message, options = {}) {
  await showDialog({
    title: options.title || 'PresenterPro',
    description: message,
    actions: [{ label: 'OK', value: true, primary: true, cancel: true }],
  });
}
