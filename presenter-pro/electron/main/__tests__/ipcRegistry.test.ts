import { describe, it, expect, vi } from 'vitest';
import { createIpcRegistry } from '../ipcRegistry';
import { INVOKE_METHODS, SEND_METHODS } from '../../../shared/ipcContract';

// Plan B1. The registry is the only way main registers a channel. It makes the
// envelope a guarantee: whatever a handler does, the renderer receives
// `{ success, data }` or `{ success, error }`.

type Handler = (...args: unknown[]) => unknown;

function fakeIpcMain() {
  const handlers = new Map<string, Handler>();
  const listeners = new Map<string, Handler>();
  return {
    handle: (channel: string, fn: Handler) => void handlers.set(channel, fn),
    on: (channel: string, fn: Handler) => void listeners.set(channel, fn),
    handlers,
    listeners,
  };
}

const EVENT = { sender: {} };
const invokeChannel = INVOKE_METHODS.getSongs; // any real invoke channel
const sendChannel = SEND_METHODS.resolveWindowCloseRequest;

describe('createIpcRegistry', () => {
  it('rejects a channel that is not in the contract, at registration time', () => {
    const ipcMain = fakeIpcMain();
    const ipc = createIpcRegistry(ipcMain, { log: () => {} });
    expect(() => ipc.handle('ghost:channel' as never, () => ok())).toThrow(/ghost:channel/);
    expect(() => ipc.on('ghost:send' as never, () => {})).toThrow(/ghost:send/);
    expect(ipcMain.handlers.size).toBe(0);
  });

  it('passes an envelope through untouched', async () => {
    const ipcMain = fakeIpcMain();
    const ipc = createIpcRegistry(ipcMain, { log: () => {} });
    const envelope = { success: true, data: [1, 2, 3] };
    ipc.handle(invokeChannel, () => envelope);
    await expect(ipcMain.handlers.get(invokeChannel)!(EVENT)).resolves.toBe(envelope);
  });

  it('turns an undefined return into a success envelope', async () => {
    const ipcMain = fakeIpcMain();
    const ipc = createIpcRegistry(ipcMain, { log: () => {} });
    ipc.handle(invokeChannel, () => undefined);
    await expect(ipcMain.handlers.get(invokeChannel)!(EVENT)).resolves.toEqual({ success: true });
  });

  it('turns a synchronous throw into a failure envelope and logs it', async () => {
    const ipcMain = fakeIpcMain();
    const log = vi.fn();
    const ipc = createIpcRegistry(ipcMain, { log });
    ipc.handle(invokeChannel, () => {
      throw new Error('disk on fire');
    });
    await expect(ipcMain.handlers.get(invokeChannel)!(EVENT)).resolves.toEqual({
      success: false,
      error: 'disk on fire',
    });
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0]![0])).toContain(invokeChannel);
  });

  it('turns an asynchronous rejection into a failure envelope', async () => {
    const ipcMain = fakeIpcMain();
    const ipc = createIpcRegistry(ipcMain, { log: () => {} });
    ipc.handle(invokeChannel, async () => {
      throw new Error('later');
    });
    await expect(ipcMain.handlers.get(invokeChannel)!(EVENT)).resolves.toEqual({
      success: false,
      error: 'later',
    });
  });

  it('turns a non-envelope return into a failure envelope naming the channel, and logs it', async () => {
    const ipcMain = fakeIpcMain();
    const log = vi.fn();
    const ipc = createIpcRegistry(ipcMain, { log });
    ipc.handle(invokeChannel, () => ({ rows: [] }));
    const result = (await ipcMain.handlers.get(invokeChannel)!(EVENT)) as {
      success: boolean;
      error: string;
    };
    expect(result.success).toBe(false);
    expect(result.error).toContain(invokeChannel);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('forwards the event and every argument to the handler', async () => {
    const ipcMain = fakeIpcMain();
    const ipc = createIpcRegistry(ipcMain, { log: () => {} });
    const handler = vi.fn(() => ok('x'));
    ipc.handle(invokeChannel, handler);
    await ipcMain.handlers.get(invokeChannel)!(EVENT, 7, { title: 'T' });
    expect(handler).toHaveBeenCalledWith(EVENT, 7, { title: 'T' });
  });

  it('registers fire-and-forget listeners with ipcMain.on', () => {
    const ipcMain = fakeIpcMain();
    const ipc = createIpcRegistry(ipcMain, { log: () => {} });
    const listener = vi.fn();
    ipc.on(sendChannel, listener);
    ipcMain.listeners.get(sendChannel)!(EVENT);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('assertComplete names every contract channel that has no handler', () => {
    const ipcMain = fakeIpcMain();
    const ipc = createIpcRegistry(ipcMain, { log: () => {} });
    for (const channel of Object.values(INVOKE_METHODS)) {
      if (channel !== INVOKE_METHODS.getSongs && channel !== INVOKE_METHODS.getMedia) {
        ipc.handle(channel, () => ok());
      }
    }
    // The send channel is missing too.
    expect(() => ipc.assertComplete()).toThrow(
      /db:songs:getAll[\s\S]*db:media:getAll[\s\S]*window:closeRequestResolved|db:media:getAll[\s\S]*db:songs:getAll/
    );
  });

  it('assertComplete passes when every channel is registered', () => {
    const ipcMain = fakeIpcMain();
    const ipc = createIpcRegistry(ipcMain, { log: () => {} });
    for (const channel of Object.values(INVOKE_METHODS)) ipc.handle(channel, () => ok());
    for (const channel of Object.values(SEND_METHODS)) ipc.on(channel, () => {});
    expect(() => ipc.assertComplete()).not.toThrow();
  });
});

function ok(data?: unknown) {
  return data === undefined ? { success: true as const } : { success: true as const, data };
}
