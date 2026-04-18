import type { PostMessageTransport } from '../transport/postMessage';
import type { AWSessionStatusResponse } from '../types/session';
import {
  IframeToParentMessageType,
  ParentToIframeMessageType,
  type SessionRefreshedPayload,
  type SessionRefreshFailPayload,
  type SessionStatusPayload,
  type ErrorPayload,
} from '../types/protocol';
import { SessionErrorCodes } from '../types/errors';
import { AWSessionError } from '../utils/errors';
import type { RetryConfig } from '../utils/retry';
import type { Logger } from '../utils/logger';

/**
 * Модуль сессии — refresh и status через postMessage родителю
 */
export class SessionModule {
  private transport: PostMessageTransport;
  private timeout: number;
  private logger: Logger;
  private retry?: RetryConfig;
  private autoRefreshTimer: ReturnType<typeof setTimeout> | null = null;

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
   * Запросить обновление сессии у родителя
   */
  async refresh(): Promise<SessionRefreshedPayload> {
    this.logger.log('Запрос обновления сессии...');

    const response = await this.transport.sendAndWait<
      Record<string, never>,
      SessionRefreshedPayload | SessionRefreshFailPayload
    >(IframeToParentMessageType.SESSION_REFRESH, {}, this.timeout, this.retry);

    if (response.type === ParentToIframeMessageType.SESSION_REFRESHED) {
      const payload = response.payload as SessionRefreshedPayload;
      this.logger.log('Сессия обновлена, истекает:', new Date(payload.expiresAt).toISOString());
      return payload;
    }

    if (response.type === ParentToIframeMessageType.SESSION_REFRESH_FAIL) {
      const fail = response.payload as SessionRefreshFailPayload;
      throw new AWSessionError(
        (fail.code as SessionErrorCodes) || SessionErrorCodes.RefreshFailed,
        fail.message,
      );
    }

    throw new AWSessionError(SessionErrorCodes.GenericError, `Unexpected response: ${response.type}`);
  }

  /**
   * Получить статус сессии через родителя
   */
  async getStatus(): Promise<AWSessionStatusResponse> {
    this.logger.log('Запрос статуса сессии...');

    const response = await this.transport.sendAndWait<
      Record<string, never>,
      SessionStatusPayload | ErrorPayload
    >(IframeToParentMessageType.GET_SESSION_STATUS, {}, this.timeout, this.retry);

    if (response.type === ParentToIframeMessageType.SESSION_STATUS) {
      return response.payload as AWSessionStatusResponse;
    }

    if (response.type === ParentToIframeMessageType.SESSION_STATUS_FAIL) {
      const fail = response.payload as ErrorPayload;
      throw new AWSessionError(
        (fail.code as SessionErrorCodes) || SessionErrorCodes.GenericError,
        fail.message,
      );
    }

    throw new AWSessionError(SessionErrorCodes.GenericError, `Unexpected response: ${response.type}`);
  }

  /**
   * Запуск таймера авто-рефреша (обновление за 60с до истечения)
   */
  startAutoRefresh(
    expiresAt: number,
    onRefreshed: (data: SessionRefreshedPayload) => void,
    onFailed?: () => void,
  ): void {
    this.stopAutoRefresh();

    const msUntilExpiry = expiresAt - Date.now();
    const refreshIn = Math.max(msUntilExpiry - 60_000, 0);

    this.logger.log('Авто-рефреш запланирован через', Math.round(refreshIn / 1000), 'секунд');

    this.autoRefreshTimer = setTimeout(async () => {
      try {
        const result = await this.refresh();
        onRefreshed(result);
        this.startAutoRefresh(result.expiresAt, onRefreshed, onFailed);
      } catch (error) {
        this.logger.error('Авто-рефреш не удался:', error);
        onFailed?.();
      }
    }, refreshIn);
  }

  /**
   * Остановить таймер авто-рефреша
   */
  stopAutoRefresh(): void {
    if (this.autoRefreshTimer) {
      clearTimeout(this.autoRefreshTimer);
      this.autoRefreshTimer = null;
    }
  }

  destroy(): void {
    this.stopAutoRefresh();
  }
}
