import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionModule } from '../../src/modules/session';
import { ParentToIframeMessageType, IframeToParentMessageType } from '../../src/types/protocol';
import { AWSessionError } from '../../src/utils/errors';
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

describe('SessionModule', () => {
  describe('refresh', () => {
    it('возвращает новый токен при SESSION_REFRESHED', async () => {
      const transport = makeTransport(ParentToIframeMessageType.SESSION_REFRESHED, {
        sessionToken: 'new-tok',
        grantedScopes: ['a'],
        expiresAt: 9999,
      });
      const mod = new SessionModule(transport, 5000, mockLogger);

      const result = await mod.refresh();

      expect(result.sessionToken).toBe('new-tok');
      expect(result.grantedScopes).toEqual(['a']);
      expect(result.expiresAt).toBe(9999);
    });

    it('отправляет SESSION_REFRESH', async () => {
      const transport = makeTransport(ParentToIframeMessageType.SESSION_REFRESHED, {
        sessionToken: 't', grantedScopes: [], expiresAt: 0,
      });
      const mod = new SessionModule(transport, 3000, mockLogger);

      await mod.refresh();

      expect(transport.sendAndWait).toHaveBeenCalledWith(
        IframeToParentMessageType.SESSION_REFRESH,
        {},
        3000,
        undefined,
      );
    });

    it('кидает AWSessionError при SESSION_REFRESH_FAIL', async () => {
      const transport = makeTransport(ParentToIframeMessageType.SESSION_REFRESH_FAIL, {
        code: 'refresh_failed',
        message: 'Token invalid',
      });
      const mod = new SessionModule(transport, 5000, mockLogger);

      await expect(mod.refresh()).rejects.toThrow(AWSessionError);
    });

    it('кидает AWSessionError при неожиданном типе', async () => {
      const transport = makeTransport('UNEXPECTED', {});
      const mod = new SessionModule(transport, 5000, mockLogger);

      await expect(mod.refresh()).rejects.toThrow(AWSessionError);
    });
  });

  describe('getStatus', () => {
    it('возвращает статус при SESSION_STATUS', async () => {
      const transport = makeTransport(ParentToIframeMessageType.SESSION_STATUS, {
        status: 'active',
        grantedScopes: ['x'],
        expiresAt: 123,
      });
      const mod = new SessionModule(transport, 5000, mockLogger);

      const status = await mod.getStatus();
      expect(status.status).toBe('active');
      expect(status.grantedScopes).toEqual(['x']);
    });

    it('кидает AWSessionError при SESSION_STATUS_FAIL', async () => {
      const transport = makeTransport(ParentToIframeMessageType.SESSION_STATUS_FAIL, {
        code: 'generic_error',
        message: 'fail',
      });
      const mod = new SessionModule(transport, 5000, mockLogger);

      await expect(mod.getStatus()).rejects.toThrow(AWSessionError);
    });
  });

  describe('startAutoRefresh / stopAutoRefresh', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('вызывает refresh за 60с до истечения', async () => {
      const transport = makeTransport(ParentToIframeMessageType.SESSION_REFRESHED, {
        sessionToken: 'new', grantedScopes: [], expiresAt: Date.now() + 300_000,
      });
      const mod = new SessionModule(transport, 5000, mockLogger);
      const onRefreshed = vi.fn();

      // Сессия истекает через 120с → refresh через 60с
      mod.startAutoRefresh(Date.now() + 120_000, onRefreshed);

      await vi.advanceTimersByTimeAsync(60_000);

      expect(onRefreshed).toHaveBeenCalledOnce();
      mod.destroy();
    });

    it('вызывает onFailed при ошибке refresh', async () => {
      const transport = {
        sendAndWait: vi.fn().mockRejectedValue(new Error('timeout')),
      } as unknown as PostMessageTransport;
      const mod = new SessionModule(transport, 5000, mockLogger);
      const onFailed = vi.fn();

      mod.startAutoRefresh(Date.now() + 120_000, vi.fn(), onFailed);

      await vi.advanceTimersByTimeAsync(60_000);

      expect(onFailed).toHaveBeenCalledOnce();
      mod.destroy();
    });

    it('stopAutoRefresh останавливает таймер', async () => {
      const transport = makeTransport(ParentToIframeMessageType.SESSION_REFRESHED, {
        sessionToken: 'n', grantedScopes: [], expiresAt: Date.now() + 300_000,
      });
      const mod = new SessionModule(transport, 5000, mockLogger);
      const onRefreshed = vi.fn();

      mod.startAutoRefresh(Date.now() + 120_000, onRefreshed);
      mod.stopAutoRefresh();

      await vi.advanceTimersByTimeAsync(120_000);

      expect(onRefreshed).not.toHaveBeenCalled();
      mod.destroy();
    });

    afterEach(() => {
      vi.useRealTimers();
    });
  });
});
