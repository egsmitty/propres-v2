/**
 * The only way the main process registers an IPC channel (plan B1).
 *
 * Guarantees, in order of what they save the renderer from:
 *   1. A handler can only be registered for a channel the contract knows.
 *   2. Whatever a handler does — returns an envelope, returns nothing, throws
 *      synchronously, rejects — the renderer receives an envelope. Before this,
 *      a throw rejected `ipcRenderer.invoke` with a serialized Error and every
 *      call site that checked `result.success` dereferenced `undefined`.
 *   3. `assertComplete()` throws at launch if any contract channel has no
 *      handler, so a forgotten registration fails on startup (the E2E launch
 *      spec catches it), not on the first click during a service.
 */
import {
  INVOKE_METHODS,
  SEND_METHODS,
  errorMessage,
  fail,
  isEnvelope,
  ok,
  type Envelope,
  type InvokeChannel,
  type SendChannel,
} from '../../shared/ipcContract';

type IpcEvent = unknown;
export type InvokeHandler = (event: IpcEvent, ...args: never[]) => unknown;
export type SendListener = (event: IpcEvent, ...args: never[]) => void;

export interface IpcMainLike {
  handle(channel: string, listener: (event: IpcEvent, ...args: unknown[]) => unknown): void;
  on(channel: string, listener: (event: IpcEvent, ...args: unknown[]) => void): void;
}

export interface IpcRegistryOptions {
  /** Receives one line per swallowed throw or non-envelope return. Defaults to console.error. */
  log?: (message: string, error?: unknown) => void;
}

export interface IpcRegistry {
  handle(channel: InvokeChannel, handler: InvokeHandler): void;
  on(channel: SendChannel, listener: SendListener): void;
  /** Throws naming every contract channel without a handler. */
  assertComplete(): void;
}

const INVOKE_CHANNELS = new Set<string>(Object.values(INVOKE_METHODS));
const SEND_CHANNELS = new Set<string>(Object.values(SEND_METHODS));

export function createIpcRegistry(
  ipcMain: IpcMainLike,
  options: IpcRegistryOptions = {}
): IpcRegistry {
  const log =
    options.log ?? ((message: string, error?: unknown) => console.error(message, error ?? ''));
  const registered = new Set<string>();

  function normalize(channel: string, result: unknown): Envelope {
    if (result === undefined) return ok();
    if (isEnvelope(result)) return result;
    const message = `IPC handler for '${channel}' returned a non-envelope value`;
    log(message, result);
    return fail(message);
  }

  return {
    handle(channel, handler) {
      if (!INVOKE_CHANNELS.has(channel)) {
        throw new Error(`IPC channel '${channel}' is not in the contract (shared/ipcContract.ts)`);
      }
      registered.add(channel);
      ipcMain.handle(channel, async (event, ...args) => {
        try {
          const result = await (handler as (event: IpcEvent, ...args: unknown[]) => unknown)(
            event,
            ...args
          );
          return normalize(channel, result);
        } catch (error) {
          log(`IPC handler for '${channel}' threw`, error);
          return fail(errorMessage(error));
        }
      });
    },

    on(channel, listener) {
      if (!SEND_CHANNELS.has(channel)) {
        throw new Error(
          `IPC send channel '${channel}' is not in the contract (shared/ipcContract.ts)`
        );
      }
      registered.add(channel);
      ipcMain.on(channel, listener as (event: IpcEvent, ...args: unknown[]) => void);
    },

    assertComplete() {
      const missing = [...INVOKE_CHANNELS, ...SEND_CHANNELS].filter(
        (channel) => !registered.has(channel)
      );
      if (missing.length > 0) {
        throw new Error(`IPC channels in the contract with no handler: ${missing.join(', ')}`);
      }
    },
  };
}
