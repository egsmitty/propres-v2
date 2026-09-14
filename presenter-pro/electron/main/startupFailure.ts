/**
 * Plan MB1 (audit MAIN-B1). What to tell the user when PresenterPro cannot
 * start — in practice, when the library database cannot be opened or
 * migrated. Before this, the startup promise rejected with nothing listening:
 * no window, no message, and the process idled in the dock.
 *
 * Pure, so the words are tested without Electron; `index.js` shows them with
 * `dialog.showErrorBox` and exits.
 */

export const STARTUP_FAILURE_TITLE = 'PresenterPro Could Not Start';

export interface StartupFailureContext {
  /** Electron's userData folder, where the library database lives. */
  userDataPath: string;
}

export interface StartupFailureMessage {
  title: string;
  message: string;
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message || 'Unknown error';
  if (error === undefined || error === null) return 'Unknown error';
  return String(error) || 'Unknown error';
}

export function describeStartupFailure(
  error: unknown,
  { userDataPath }: StartupFailureContext
): StartupFailureMessage {
  const folder = ['', 'Your library is in this folder:', userDataPath];

  // Matched by name, not class: the migration runner's NewerSchemaVersionError
  // (MAIN-B12) lives in the db layer, and a schema number means nothing to the
  // person reading this.
  if (error instanceof Error && error.name === 'NewerSchemaVersionError') {
    return {
      title: STARTUP_FAILURE_TITLE,
      message: [
        'This library was created by a newer version of PresenterPro.',
        'Install the latest version of PresenterPro to open it.',
        ...folder,
      ].join('\n'),
    };
  }

  return {
    title: STARTUP_FAILURE_TITLE,
    message: [
      'Your library could not be opened, so PresenterPro has to close.',
      ...folder,
      '',
      `Details: ${describeError(error)}`,
    ].join('\n'),
  };
}
