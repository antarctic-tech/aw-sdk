import { describe, it, expect, vi } from 'vitest';
import { OperationsModule } from '../../src/modules/operations';
import { ParentToIframeMessageType, IframeToParentMessageType } from '../../src/types/protocol';
import { AWOperationError } from '../../src/utils/errors';
import { OperationErrorCodes } from '../../src/types/errors';
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

describe('OperationsModule', () => {
  describe('prepare', () => {
    const params = {
      type: 'transfer' as const,
      amount: '100',
      currency: 'USDT',
      to: '0xabc',
    };

    it('возвращает операцию при OPERATION_PREPARED', async () => {
      const transport = makeTransport(ParentToIframeMessageType.OPERATION_PREPARED, {
        operationId: 'op-1',
        type: 'transfer',
        status: 'pending',
        amount: '100',
        currency: 'USDT',
        to: '0xabc',
      });
      const mod = new OperationsModule(transport, 5000, mockLogger);

      const result = await mod.prepare(params);

      expect(result.operationId).toBe('op-1');
      expect(result.status).toBe('pending');
    });

    it('отправляет PREPARE_OPERATION с payload', async () => {
      const transport = makeTransport(ParentToIframeMessageType.OPERATION_PREPARED, {
        operationId: 'op-1', type: 'transfer', status: 'pending', amount: '100', currency: 'USDT', to: '0x',
      });
      const mod = new OperationsModule(transport, 3000, mockLogger);

      await mod.prepare(params);

      expect(transport.sendAndWait).toHaveBeenCalledWith(
        IframeToParentMessageType.PREPARE_OPERATION,
        params,
        3000,
        undefined,
      );
    });

    it('кидает AWOperationError при OPERATION_PREPARE_FAIL', async () => {
      const transport = makeTransport(ParentToIframeMessageType.OPERATION_PREPARE_FAIL, {
        code: OperationErrorCodes.InvalidAmount,
        message: 'Amount too small',
      });
      const mod = new OperationsModule(transport, 5000, mockLogger);

      await expect(mod.prepare(params)).rejects.toThrow(AWOperationError);
    });

    it('кидает AWOperationError при неожиданном типе', async () => {
      const transport = makeTransport('UNEXPECTED', {});
      const mod = new OperationsModule(transport, 5000, mockLogger);

      await expect(mod.prepare(params)).rejects.toThrow(AWOperationError);
    });
  });

  describe('requestConfirmation', () => {
    it('возвращает результат при OPERATION_APPROVED', async () => {
      const transport = makeTransport(ParentToIframeMessageType.OPERATION_APPROVED, {
        operationId: 'op-1',
        status: 'succeeded',
        txId: 'tx-42',
      });
      const mod = new OperationsModule(transport, 5000, mockLogger);

      const result = await mod.requestConfirmation('op-1');

      expect(result.operationId).toBe('op-1');
      expect(result.txId).toBe('tx-42');
      expect(result.status).toBe('succeeded');
    });

    it('кидает AWOperationError при OPERATION_REJECTED', async () => {
      const transport = makeTransport(ParentToIframeMessageType.OPERATION_REJECTED, {
        operationId: 'op-1',
        reason: 'User said no',
      });
      const mod = new OperationsModule(transport, 5000, mockLogger);

      try {
        await mod.requestConfirmation('op-1');
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(AWOperationError);
        expect((e as AWOperationError).errorCode).toBe(OperationErrorCodes.UserRejected);
        expect((e as AWOperationError).operationId).toBe('op-1');
      }
    });

    it('не использует retry (ожидание пользователя)', async () => {
      const transport = makeTransport(ParentToIframeMessageType.OPERATION_APPROVED, {
        operationId: 'op-1', status: 'succeeded', txId: 'tx-1',
      });
      const mod = new OperationsModule(transport, 5000, mockLogger, { maxAttempts: 3, baseDelay: 100 });

      await mod.requestConfirmation('op-1');

      // sendAndWait вызывается без retry config (4-й аргумент отсутствует)
      const call = (transport.sendAndWait as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call[3]).toBeUndefined();
    });
  });
});
