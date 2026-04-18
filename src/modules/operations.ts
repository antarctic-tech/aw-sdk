import type { PostMessageTransport } from '../transport/postMessage';
import type { AWOperationIntentParams, AWOperationIntent, AWOperationResult } from '../types/operations';
import {
  IframeToParentMessageType,
  ParentToIframeMessageType,
  type OperationPreparedPayload,
  type OperationPrepareFailPayload,
  type OperationApprovedPayload,
  type OperationRejectedPayload,
} from '../types/protocol';
import { OperationErrorCodes } from '../types/errors';
import { AWOperationError } from '../utils/errors';
import type { RetryConfig } from '../utils/retry';
import type { Logger } from '../utils/logger';

/**
 * Модуль операций — prepare и confirm через postMessage родителю
 */
export class OperationsModule {
  private transport: PostMessageTransport;
  private timeout: number;
  private logger: Logger;
  private retry?: RetryConfig;

  constructor(
    transport: PostMessageTransport,
    timeout: number,
    logger: Logger,
    retry?: RetryConfig,
  ) {
    this.transport = transport;
    this.timeout = timeout;
    this.logger = logger;
    this.retry = retry;
  }

  /**
   * Шаг 1: Подготовка операции (SDK → родитель → бэкенд)
   */
  async prepare(params: AWOperationIntentParams): Promise<AWOperationIntent> {
    this.logger.log('Подготовка операции:', params.type);

    try {
      const response = await this.transport.sendAndWait<
        AWOperationIntentParams,
        OperationPreparedPayload | OperationPrepareFailPayload
      >(IframeToParentMessageType.PREPARE_OPERATION, params, this.timeout, this.retry);

      if (response.type === ParentToIframeMessageType.OPERATION_PREPARED) {
        const payload = response.payload as OperationPreparedPayload;
        this.logger.log('Операция подготовлена, id:', payload.operationId);
        return payload as AWOperationIntent;
      }

      if (response.type === ParentToIframeMessageType.OPERATION_PREPARE_FAIL) {
        const fail = response.payload as OperationPrepareFailPayload;
        throw new AWOperationError(
          '',
          (fail.code as OperationErrorCodes) || OperationErrorCodes.PreparationFailed,
          fail.message,
        );
      }

      throw new AWOperationError('', OperationErrorCodes.GenericError, `Unexpected response: ${response.type}`);
    } catch (error) {
      if (error instanceof AWOperationError) throw error;
      throw new AWOperationError('', OperationErrorCodes.GenericError, (error as Error).message);
    }
  }

  /**
   * Шаг 2: Запрос подтверждения (родитель показывает UI, approve + commit)
   * Retry не применяется — ожидание действия пользователя.
   */
  async requestConfirmation(operationId: string): Promise<AWOperationResult> {
    this.logger.log('Запрос подтверждения для:', operationId);

    try {
      // Confirm не retry это ожидание действия пользователя
      const response = await this.transport.sendAndWait<
        { operationId: string },
        OperationApprovedPayload | OperationRejectedPayload
      >(IframeToParentMessageType.REQUEST_OPERATION_CONFIRM, { operationId }, this.timeout);

      if (response.type === ParentToIframeMessageType.OPERATION_REJECTED) {
        const rejected = response.payload as OperationRejectedPayload;
        throw new AWOperationError(
          operationId,
          OperationErrorCodes.UserRejected,
          rejected.reason,
        );
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

      throw new AWOperationError(operationId, OperationErrorCodes.GenericError, `Unexpected response: ${response.type}`);
    } catch (error) {
      if (error instanceof AWOperationError) throw error;
      throw new AWOperationError(operationId, OperationErrorCodes.GenericError, (error as Error).message);
    }
  }
}
