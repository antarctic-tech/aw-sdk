import { describe, it, expect, vi } from 'vitest';
import { ScopesModule } from '../../src/modules/scopes';
import { ParentToIframeMessageType, IframeToParentMessageType } from '../../src/types/protocol';
import { AWScopeError } from '../../src/utils/errors';
import type { PostMessageTransport } from '../../src/transport/postMessage';
import type { Logger } from '../../src/utils/logger';

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

describe('ScopesModule', () => {
  describe('getScopes', () => {
    it('возвращает список скоупов при SCOPES_RESULT', async () => {
      const transport = makeTransport(ParentToIframeMessageType.SCOPES_RESULT, {
        grantedScopes: ['a', 'b'],
      });
      const mod = new ScopesModule(transport, 5000, mockLogger);

      const scopes = await mod.getScopes();
      expect(scopes).toEqual(['a', 'b']);
    });

    it('отправляет GET_SCOPES', async () => {
      const transport = makeTransport(ParentToIframeMessageType.SCOPES_RESULT, {
        grantedScopes: [],
      });
      const mod = new ScopesModule(transport, 3000, mockLogger);

      await mod.getScopes();

      expect(transport.sendAndWait).toHaveBeenCalledWith(
        IframeToParentMessageType.GET_SCOPES,
        {},
        3000,
        undefined,
      );
    });

    it('кидает AWScopeError при SCOPES_FAIL', async () => {
      const transport = makeTransport(ParentToIframeMessageType.SCOPES_FAIL, {
        code: 'generic_error',
        message: 'fail',
      });
      const mod = new ScopesModule(transport, 5000, mockLogger);

      await expect(mod.getScopes()).rejects.toThrow(AWScopeError);
    });

    it('кидает AWScopeError при неожиданном типе', async () => {
      const transport = makeTransport('UNEXPECTED', {});
      const mod = new ScopesModule(transport, 5000, mockLogger);

      await expect(mod.getScopes()).rejects.toThrow(AWScopeError);
    });
  });

  describe('getData', () => {
    it('возвращает данные при SCOPES_DATA_RESULT', async () => {
      const transport = makeTransport(ParentToIframeMessageType.SCOPES_DATA_RESULT, {
        data: { balance: 100, currency: 'USDT' },
      });
      const mod = new ScopesModule(transport, 5000, mockLogger);

      const data = await mod.getData<{ balance: number; currency: string }>();
      expect(data.balance).toBe(100);
      expect(data.currency).toBe('USDT');
    });

    it('отправляет GET_SCOPES_DATA', async () => {
      const transport = makeTransport(ParentToIframeMessageType.SCOPES_DATA_RESULT, {
        data: null,
      });
      const mod = new ScopesModule(transport, 3000, mockLogger);

      await mod.getData();

      expect(transport.sendAndWait).toHaveBeenCalledWith(
        IframeToParentMessageType.GET_SCOPES_DATA,
        {},
        3000,
        undefined,
      );
    });

    it('кидает AWScopeError при SCOPES_FAIL', async () => {
      const transport = makeTransport(ParentToIframeMessageType.SCOPES_FAIL, {
        code: 'generic_error',
        message: 'nope',
      });
      const mod = new ScopesModule(transport, 5000, mockLogger);

      await expect(mod.getData()).rejects.toThrow(AWScopeError);
    });
  });
});
