import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PostMessageTransport } from '../../src/transport/postMessage';
import { AWSDKError, AWTimeoutError } from '../../src/utils/errors';
import type { Logger } from '../../src/utils/logger';

const parentOrigin = 'https://wallet.example';
const logger = { log: () => {}, warn: () => {}, error: () => {} } as unknown as Logger;

function setup() {
  const browser = Object.assign(new EventTarget(), { parent: { postMessage: vi.fn() } });
  vi.stubGlobal('window', browser);
  return new PostMessageTransport(parentOrigin, 'app-1', logger);
}

// Ошибку ловим заранее: reject приходит синхронно из destroy()/таймера, до await в тесте
function settle(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('PostMessageTransport', () => {
  it('destroy() отклоняет ожидающие запросы и снимает их таймеры', async () => {
    const transport = setup();
    transport.init();
    const result = settle(transport.sendAndWait('SCAN', {}, 10 * 60 * 1000, { maxAttempts: 1, baseDelay: 0 }));
    expect(vi.getTimerCount()).toBe(1);

    transport.destroy();

    const error = await result;
    expect(error).toBeInstanceOf(AWSDKError);
    expect(error).not.toBeInstanceOf(AWTimeoutError);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('без destroy() запрос падает по таймауту', async () => {
    const transport = setup();
    transport.init();
    const result = settle(transport.sendAndWait('PING', {}, 1000, { maxAttempts: 1, baseDelay: 0 }));
    await vi.advanceTimersByTimeAsync(1000);
    expect(await result).toBeInstanceOf(AWTimeoutError);
  });
});
