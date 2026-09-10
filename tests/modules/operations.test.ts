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

    it('отправляет REQUEST_OPERATION_CONFIRM с operationId', async () => {
      const transport = makeTransport(ParentToIframeMessageType.OPERATION_APPROVED, {
        operationId: 'op-1',
        status: 'succeeded',
      });
      const mod = new OperationsModule(transport, 3000, mockLogger);

      await mod.requestConfirmation('op-1');

      expect(transport.sendAndWait).toHaveBeenCalledWith(
        IframeToParentMessageType.REQUEST_OPERATION_CONFIRM,
        { operationId: 'op-1' },
        3000,
      );
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

    it('кидает AWOperationError при неожиданном типе ответа', async () => {
      const transport = makeTransport('UNEXPECTED', {});
      const mod = new OperationsModule(transport, 5000, mockLogger);

      await expect(mod.requestConfirmation('op-1')).rejects.toThrow(AWOperationError);
    });

    it('не использует retry (ожидание пользователя)', async () => {
      const transport = makeTransport(ParentToIframeMessageType.OPERATION_APPROVED, {
        operationId: 'op-1',
        status: 'succeeded',
        txId: 'tx-1',
      });
      const mod = new OperationsModule(transport, 5000, mockLogger);

      await mod.requestConfirmation('op-1');

      // sendAndWait вызывается без retry config (4-й аргумент отсутствует)
      const call = (transport.sendAndWait as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call[3]).toBeUndefined();
    });
  });
});
