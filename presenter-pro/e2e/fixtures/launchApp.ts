import { test as base, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import type { ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * E2E specs permitted to be skipped, with the reason they cannot run in this
 * environment. Every entry REQUIRES a justification and must be reported.
 * Never add an entry to make a failing test go away — a failing E2E is a
 * finding, not an obstacle.
 */
export const E2E_ENVIRONMENT_SKIPS: ReadonlyArray<{ spec: string; reason: string }> = [];

const MAIN_ENTRY = path.resolve(__dirname, '../../out/main/index.js');
const FIRST_WINDOW_TIMEOUT_MS = 60_000;

/** Substrings in main-process stderr that indicate a fatal startup failure. */
export const FATAL_STDERR_MARKERS = [
  'Cannot find module',
  'UnhandledPromiseRejection',
  'Uncaught Exception',
] as const;

export interface LaunchedApp {
  app: ElectronApplication;
  window: Page;
  userDataDir: string;
  /**
   * The Electron main process, captured at launch. Use this — never
   * `app.process()` after the app may have exited: Playwright disposes its
   * wrapper on exit and that accessor then throws an internal TypeError, which
   * turns a successful quit into a failed test.
   */
  process: ChildProcess;
  /** Everything the main process wrote to stderr since launch. */
  stderr: () => string;
}

function realpath(p: string): string {
  return fs.realpathSync.native(p);
}

/**
 * Launch the built app against a throwaway profile.
 *
 * ISOLATION GUARANTEE: the app opens `app.getPath('userData')/presenterpro.db`.
 * Running against a developer's real profile would read — and could destroy —
 * their actual presentations. Every launch therefore gets a fresh temp
 * userData directory, and this function THROWS if the app resolves its
 * userData anywhere outside the OS temp dir. That guard exists so a future
 * refactor cannot silently drop the flag.
 */
export interface LaunchOptions {
  /**
   * Reuse an existing throwaway profile (e.g. to relaunch and prove a second
   * start is a no-op). Must be under the OS temp dir — enforced.
   */
  userDataDir?: string;
  /** Seed the profile before launch — e.g. write a legacy database into it. */
  prepareUserData?: (userDataDir: string) => void;
}

export async function launchApp(options: LaunchOptions = {}): Promise<LaunchedApp> {
  if (!fs.existsSync(MAIN_ENTRY)) {
    throw new Error(
      `Built main entry not found at ${MAIN_ENTRY}. Run \`npm run build\` first ` +
        '(`npm run test:e2e` does this for you).'
    );
  }

  const userDataDir = options.userDataDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'ppro-e2e-'));
  if (!realpath(userDataDir).startsWith(realpath(os.tmpdir()))) {
    throw new Error(
      `REFUSING TO LAUNCH: userDataDir "${userDataDir}" is not under the OS temp dir.`
    );
  }
  options.prepareUserData?.(userDataDir);

  // Never inherit a dev-server URL from the shell: the app must load the
  // BUILT renderer, or we are not testing what ships.
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
  delete env.ELECTRON_RENDERER_URL;

  const app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
    env,
  });

  let stderrBuffer = '';
  let stdoutBuffer = '';
  const proc = app.process();
  proc.stderr?.on('data', (chunk: Buffer | string) => {
    stderrBuffer += chunk.toString();
  });
  proc.stdout?.on('data', (chunk: Buffer | string) => {
    stdoutBuffer += chunk.toString();
  });

  /** Attach everything the main process said to a launch failure, so the cause is in the report. */
  const withProcessOutput = (stage: string, cause: unknown): Error => {
    const reason = cause instanceof Error ? cause.message : String(cause);
    const exit =
      proc.exitCode !== null ? `exit code ${proc.exitCode}` : `signal ${proc.signalCode}`;
    return new Error(
      `${stage} failed (pid ${proc.pid}, ${proc.exitCode === null && proc.signalCode === null ? 'still running' : exit}): ${reason}\n` +
        `--- main process stderr ---\n${stderrBuffer || '(empty)'}\n` +
        `--- main process stdout ---\n${stdoutBuffer || '(empty)'}`
    );
  };

  // Wait for the window BEFORE evaluating anything in the main process. An
  // evaluate issued straight after launch races the app's synchronous startup
  // (DB open, migrations, seeding) and fails with Playwright's "Resulting
  // promise was garbage collected". Once the window exists, `ready` is past.
  // Generous on purpose: a cold Electron start on a busy machine (or a macOS
  // CI runner) has been observed to take longer than Playwright's 30s default
  // with nothing on stderr. A genuine hang still fails — just later.
  let window: Page;
  try {
    window = await app.firstWindow({ timeout: FIRST_WINDOW_TIMEOUT_MS });
    await window.waitForLoadState('domcontentloaded');
  } catch (cause) {
    throw withProcessOutput('firstWindow', cause);
  }

  // Verify the isolation took effect, from inside the main process. Be clear
  // about what this is: DETECTION, not prevention. The app opens its database
  // during `ready`, before any evaluate can run, so nothing here can stop a
  // mis-targeted launch — the `--user-data-dir` switch above is the prevention.
  // This check makes a silent regression of that switch a loud red run.
  let resolvedUserData: string;
  try {
    resolvedUserData = await app.evaluate(({ app: electronApp }) =>
      electronApp.getPath('userData')
    );
  } catch (cause) {
    throw withProcessOutput('userData check', cause);
  }
  const tmpRoot = realpath(os.tmpdir());
  if (!realpath(resolvedUserData).startsWith(tmpRoot)) {
    proc.kill('SIGKILL');
    throw new Error(
      `REFUSING TO CONTINUE: app resolved userData to "${resolvedUserData}", which is not under ` +
        `the OS temp dir "${tmpRoot}". The --user-data-dir switch is not taking effect; a real ` +
        'profile may already have been opened. Investigate before running E2E again.'
    );
  }

  return { app, window, userDataDir, process: proc, stderr: () => stderrBuffer };
}

/**
 * A fresh profile shows the onboarding tutorial over Home. Dismiss it when
 * present so specs can reach the controls underneath; do nothing otherwise.
 */
export async function dismissTutorialIfPresent(window: Page): Promise<void> {
  const skip = window.getByRole('button', { name: 'Skip Tour' });
  try {
    await skip.waitFor({ state: 'visible', timeout: 5_000 });
  } catch {
    return; // not shown — nothing to dismiss
  }
  await skip.click();
  await expect(skip).toBeHidden();
}

const EXIT_WAIT_MS = 5_000;

/** Resolve when the process has exited, or reject after `ms`. */
function waitForExit(proc: ChildProcess, ms: number): Promise<void> {
  if (proc.exitCode !== null || proc.signalCode !== null) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`process ${proc.pid} did not exit in ${ms}ms`)),
      ms
    );
    proc.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/**
 * Tear the app down deterministically, whatever state a spec left it in.
 *
 * Do NOT use `app.close()` here: it asks Electron to quit *gracefully*, which —
 * correctly — runs the unsaved-changes handshake and blocks on the dialog if a
 * spec left a presentation unsaved. A harness that owns a throwaway profile
 * should not negotiate. Electron provides exactly the right tool:
 * `app.exit(0)` ends the process immediately, closes every window without
 * asking, and skips `before-quit`/`will-quit` entirely. SIGKILL is the last
 * resort only, because a killed main process can leave helper processes
 * lingering into the next launch.
 *
 * Also never touch a process a spec already exited (the quit spec): Playwright
 * disposes its wrapper on exit and its accessors then throw.
 *
 * This function does not return until the process is actually gone, so the
 * next launch never overlaps a dying predecessor.
 */
export interface CloseOptions {
  /** Leave the profile on disk so a spec can relaunch against it. */
  keepUserData?: boolean;
}

export async function closeApp(launched: LaunchedApp, options: CloseOptions = {}): Promise<void> {
  const proc = launched.process; // NOT app.process() — see LaunchedApp.process
  const alive = () => proc.exitCode === null && proc.signalCode === null;

  try {
    if (alive()) {
      // The evaluate itself rejects when the process dies mid-call — expected.
      await launched.app.evaluate(({ app }) => app.exit(0)).catch(() => undefined);
      try {
        await waitForExit(proc, EXIT_WAIT_MS);
      } catch {
        if (alive()) proc.kill('SIGKILL');
        await waitForExit(proc, EXIT_WAIT_MS).catch(() => undefined);
      }
    }
  } finally {
    if (!options.keepUserData) fs.rmSync(launched.userDataDir, { recursive: true, force: true });
  }
}

/**
 * Playwright fixture: every spec receives a freshly launched, isolated app and
 * it is torn down (process + temp profile) whether the spec passes or fails.
 */
export const test = base.extend<{ launched: LaunchedApp }>({
  // Playwright requires fixture functions to destructure their first argument
  // (it inspects the parameter to resolve dependencies). This fixture depends
  // on nothing, so the pattern is empty — Playwright's documented form.
  // eslint-disable-next-line no-empty-pattern
  launched: async ({}, use) => {
    const launched = await launchApp();
    try {
      await use(launched);
    } finally {
      await closeApp(launched);
    }
  },
});

export { expect };
