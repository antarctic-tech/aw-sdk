import type { PostMessageTransport } from '../transport/postMessage';
import type { AWOperationResult } from '../types/operations';
import {
  IframeToParentMessageType,
  ParentToIframeMessageType,
  type OperationApprovedPayload,
  type OperationRejectedPayload,
} from '../types/protocol';
import { OperationErrorCodes } from '../types/errors';
import { AWOperationError } from '../utils/errors';
import type { Logger } from '../utils/logger';

/**
 * Модуль операций.
 *
 * Интент (`pay` / `receive` / `scopes`) создаёт бэкенд партнёра через
 * `POST {AW_API_BASE}/api/apps/v1/intents` — секрет приложения в браузер не попадает.
 * Мини-апе остаётся один шаг: попросить кошелёк показать нативный лист подтверждения
 * для уже созданного `operationId`.
 */
export class OperationsModule {
  private transport: PostMessageTransport;
  private timeout: number;
  private logger: Logger;

  constructor(transport: PostMessageTransport, timeout: number, logger: Logger) {
    this.transport = transport;
    this.timeout = timeout;
    this.logger = logger;
  }

  /**
   * Запрос подтверждения операции: хост показывает нативный лист, approve + commit.
   * Retry не применяется — идёт ожидание действия пользователя.
   *
   * @param operationId id операции, полученный от вашего бэкенда
   */
  async requestConfirmation(operationId: string): Promise<AWOperationResult> {
    this.logger.log('Запрос подтверждения для:', operationId);

    try {
      const response = await this.transport.sendAndWait<
        { operationId: string },
        OperationApprovedPayload | OperationRejectedPayload
      >(IframeToParentMessageType.REQUEST_OPERATION_CONFIRM, { operationId }, this.timeout);

      if (response.type === ParentToIframeMessageType.OPERATION_REJECTED) {
        const rejected = response.payload as OperationRejectedPayload;
        throw new AWOperationError(operationId, OperationErrorCodes.UserRejected, rejected.reason);
      }

      if (response.type === ParentToIframeMessageType.OPERATION_APPROVED) {
        const approved = response.payload as OperationApprovedPayload;
        this.logger.log('Операция подтверждена:', approved.operationId);
        return {
          operationId: approved.operationId,
          status: approved.status as AWOperationResult['status'],
          txId: approved.txId,
        };
      }

      throw new AWOperationError(
        operationId,
        OperationErrorCodes.GenericError,
        `Unexpected response: ${response.type}`,
      );
    } catch (error) {
      if (error instanceof AWOperationError) throw error;
      throw new AWOperationError(
        operationId,
        OperationErrorCodes.GenericError,
        (error as Error).message,
      );
    }
  }
}
