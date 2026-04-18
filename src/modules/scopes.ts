import type { PostMessageTransport } from '../transport/postMessage';
import {
  IframeToParentMessageType,
  ParentToIframeMessageType,
  type ScopesResultPayload,
  type ScopesDataResultPayload,
  type ErrorPayload,
} from '../types/protocol';
import { ScopeErrorCodes } from '../types/errors';
import { AWScopeError } from '../utils/errors';
import type { RetryConfig } from '../utils/retry';
import type { Logger } from '../utils/logger';

/**
 * Модуль скоупов — получение скоупов через postMessage родителю
 */
export class ScopesModule {
  private transport: PostMessageTransport;
  private timeout: number;
  private logger: Logger;
  private retry?: RetryConfig;

  constructor(transport: PostMessageTransport, timeout: number, logger: Logger, retry?: RetryConfig) {
    this.transport = transport;
    this.timeout = timeout;
    this.logger = logger;
    this.retry = retry;
  }

  /**
   * Получить текущие скоупы
   */
  async getScopes(): Promise<string[]> {
    this.logger.log('Запрос скоупов...');

    const response = await this.transport.sendAndWait<
      Record<string, never>,
      ScopesResultPayload | ErrorPayload
    >(IframeToParentMessageType.GET_SCOPES, {}, this.timeout, this.retry);

    if (response.type === ParentToIframeMessageType.SCOPES_RESULT) {
      const payload = response.payload as ScopesResultPayload;
      return payload.grantedScopes;
    }

    if (response.type === ParentToIframeMessageType.SCOPES_FAIL) {
      const fail = response.payload as ErrorPayload;
      throw new AWScopeError(
        (fail.code as ScopeErrorCodes) || ScopeErrorCodes.GenericError,
        fail.message,
      );
    }

    throw new AWScopeError(ScopeErrorCodes.GenericError, `Unexpected response: ${response.type}`);
  }

  /**
   * Получить данные по скоупам
   */
  async getData<T = unknown>(): Promise<T> {
    this.logger.log('Запрос данных скоупов...');

    const response = await this.transport.sendAndWait<
      Record<string, never>,
      ScopesDataResultPayload | ErrorPayload
    >(IframeToParentMessageType.GET_SCOPES_DATA, {}, this.timeout, this.retry);

    if (response.type === ParentToIframeMessageType.SCOPES_DATA_RESULT) {
      const payload = response.payload as ScopesDataResultPayload;
      return payload.data as T;
    }

    if (response.type === ParentToIframeMessageType.SCOPES_FAIL) {
      const fail = response.payload as ErrorPayload;
      throw new AWScopeError(
        (fail.code as ScopeErrorCodes) || ScopeErrorCodes.GenericError,
        fail.message,
      );
    }

    throw new AWScopeError(ScopeErrorCodes.GenericError, `Unexpected response: ${response.type}`);
  }
}
