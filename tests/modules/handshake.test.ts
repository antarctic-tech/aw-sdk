import { describe, it, expect, vi, beforeAll } from 'vitest';
import { performHandshake } from '../../src/modules/handshake';
import { ParentToIframeMessageType, IframeToParentMessageType } from '../../src/types/protocol';
import { AWInitError } from '../../src/utils/errors';
import { InitErrorCodes } from '../../src/types/errors';
import type { PostMessageTransport } from '../../src/transport/postMessage';
import type { Logger } from '../../src/utils/logger';

beforeAll(() => {
  vi.stubGlobal('window', { location: { origin: 'http://localhost:3000' } });
});

const mockLogger: Logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Logger;

function makeTransport(responseType: string, payload: unknown) {
  return {
    sendAndWait: vi.fn().mockResolvedValue({
      type: responseType,
      requestId: 'r1',
      payload,
      version: '1.0',
      appId: 'app-1',
      timestamp: Date.now(),
    }),
  } as unknown as PostMessageTransport;
}

describe('performHandshake', () => {
  it('возвращает сессию при SDK_INIT_OK', async () => {
    const transport = makeTransport(ParentToIframeMessageType.SDK_INIT_OK, {
      sessionToken: 'tok-1',
      grantedScopes: ['user.profile.read'],
      userContext: { userId: 'u1', displayName: 'Alice' },
      expiresAt: 9999,
      supportedCommands: { init: 1 },
    });

    const result = await performHandshake(transport, 'app-1', ['user.profile.read'], 5000, mockLogger);

    expect(result.session.sessionToken).toBe('tok-1');
    expect(result.session.grantedScopes).toEqual(['user.profile.read']);
    expect(result.session.expiresAt).toBe(9999);
    expect(result.supportedCommands).toEqual({ init: 1 });
  });

  it('отправляет правильный payload в SDK_INIT', async () => {
    const transport = makeTransport(ParentToIframeMessageType.SDK_INIT_OK, {
      sessionToken: 't', grantedScopes: [], userContext: {}, expiresAt: 0,
    });

    await performHandshake(transport, 'my-app', ['a', 'b'], 3000, mockLogger);

    expect(transport.sendAndWait).toHaveBeenCalledWith(
      IframeToParentMessageType.SDK_INIT,
      expect.objectContaining({
        appId: 'my-app',
        requestedScopes: ['a', 'b'],
      }),
      3000,
      undefined,
    );
  });

  it('кидает AWInitError при SDK_INIT_FAIL', async () => {
    const transport = makeTransport(ParentToIframeMessageType.SDK_INIT_FAIL, {
      code: InitErrorCodes.ScopesRejected,
      message: 'Rejected by user',
    });

    await expect(
      performHandshake(transport, 'app-1', [], 5000, mockLogger),
    ).rejects.toThrow(AWInitError);
  });

  it('кидает AWInitError с правильным кодом при reject', async () => {
    const transport = makeTransport(ParentToIframeMessageType.SDK_INIT_FAIL, {
      code: InitErrorCodes.InvalidOrigin,
      message: 'Bad origin',
    });

    try {
      await performHandshake(transport, 'app-1', [], 5000, mockLogger);
    } catch (e) {
      expect(e).toBeInstanceOf(AWInitError);
      expect((e as AWInitError).errorCode).toBe(InitErrorCodes.InvalidOrigin);
    }
  });

  it('кидает AWInitError при неожиданном типе ответа', async () => {
    const transport = makeTransport('TOTALLY_UNEXPECTED', {});

    await expect(
      performHandshake(transport, 'app-1', [], 5000, mockLogger),
    ).rejects.toThrow(AWInitError);
  });

  it('userContext по умолчанию = {}', async () => {
    const transport = makeTransport(ParentToIframeMessageType.SDK_INIT_OK, {
      sessionToken: 't', grantedScopes: [], userContext: undefined, expiresAt: 0,
    });

    const result = await performHandshake(transport, 'a', [], 1000, mockLogger);
    expect(result.session.userContext).toEqual({});
  });
});
