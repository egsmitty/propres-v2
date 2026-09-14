import { describe, it, expect } from 'vitest';

// Plan MB1 (audit MAIN-B1). A database that cannot be opened or migrated used
// to leave PresenterPro running with no window: the startup promise rejected,
// nothing caught it, and the process sat in the dock doing nothing. The main
// process now shows this message and exits. It is pure so the words can be
// tested without Electron.

import { describeStartupFailure, STARTUP_FAILURE_TITLE } from '../startupFailure';

const USER_DATA = '/Users/someone/Library/Application Support/PresenterPro';

const lastLine = (message: string) => message.slice(message.lastIndexOf('\n') + 1);

describe('describeStartupFailure', () => {
  it('uses one fixed title', () => {
    expect(STARTUP_FAILURE_TITLE).toBe('PresenterPro Could Not Start');
    expect(describeStartupFailure(new Error('x'), { userDataPath: USER_DATA }).title).toBe(
      'PresenterPro Could Not Start'
    );
  });

  it('says the library could not be opened, where it lives, and what went wrong', () => {
    const { message } = describeStartupFailure(
      new Error('SQLITE_CORRUPT: database disk image is malformed'),
      {
        userDataPath: USER_DATA,
      }
    );

    expect(message).toBe(
      [
        'Your library could not be opened, so PresenterPro has to close.',
        '',
        'Your library is in this folder:',
        USER_DATA,
        '',
        'Details: SQLITE_CORRUPT: database disk image is malformed',
      ].join('\n')
    );
  });

  it('explains a library written by a newer version, without technical detail', () => {
    const error = new Error(
      'This database was created by a newer version of PresenterPro (schema v9)'
    );
    error.name = 'NewerSchemaVersionError';

    const { message } = describeStartupFailure(error, { userDataPath: USER_DATA });

    expect(message).toBe(
      [
        'This library was created by a newer version of PresenterPro.',
        'Install the latest version of PresenterPro to open it.',
        '',
        'Your library is in this folder:',
        USER_DATA,
      ].join('\n')
    );
  });

  it('reports a thrown value that is not an Error', () => {
    const { message } = describeStartupFailure('disk full', { userDataPath: USER_DATA });

    expect(lastLine(message)).toBe('Details: disk full');
  });

  it('still says something when nothing useful was thrown', () => {
    for (const thrown of [undefined, null, new Error('')]) {
      const { message } = describeStartupFailure(thrown, { userDataPath: USER_DATA });
      expect(lastLine(message)).toBe('Details: Unknown error');
    }
  });
});
