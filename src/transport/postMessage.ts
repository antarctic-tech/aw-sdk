import type { AWMessage } from '../types/protocol';
import { isValidAWMessage, createMessage } from './serializer';
import { PROTOCOL_VERSION } from '../types/protocol';
import { generateRequestId } from '../utils/id';
import { AWSDKError, AWTimeoutError } from '../utils/errors';
import { InitErrorCodes } from '../types/errors';
import { withRetry, type RetryConfig, DEFAULT_RETRY } from '../utils/retry';
import type { Logger } from '../utils/logger';

/** isReply — сообщение отвечает на запрос, который сейчас ждёт sendAndWait */
export type MessageMeta = { isReply: boolean };
type MessageHandler = (message: AWMessage, meta: MessageMeta) => void;

declare global {
  interface Window {
    ReactNativeWebView?: {
      postMessage(msg: string): void;
    };
  }
}

/**
 * Транспортный слой PostMessage
 */
export class PostMessageTransport {
  private parentOrigin: string;
  private appId: string;
  private logger: Logger;
  private handlers: Set<MessageHandler> = new Set();
  // Ожидающие ответа запросы: таймер и reject, чтобы destroy() не оставлял висящих промисов
  private pendingRequests: Map<string, { timer: ReturnType<typeof setTimeout>; reject: (error: Error) => void }> = new Map();
  private boundListener: ((event: MessageEvent) => void) | null = null;

  constructor(parentOrigin: string, appId: string, logger: Logger) {
    this.parentOrigin = parentOrigin;
    this.appId = appId;
    this.logger = logger;
  }

  /**
   * Начать слушать входящие сообщения
   */
  init(): void {
    this.boundListener = this.handleEvent.bind(this);
    window.addEventListener('message', this.boundListener);
    this.logger.log('Транспорт инициализирован, слушаем сообщения от', this.parentOrigin);
  }

  /**
   * Отправить сообщение в родительское окно
   */
  private send<T>(type: string, payload: T, requestId?: string): string {
    const id = requestId ?? generateRequestId();
    const message = createMessage(type, payload, this.appId, id, PROTOCOL_VERSION);

    this.logger.log('Отправка сообщения:', type, id);

    // Мост React Native WebView
    if (window.ReactNativeWebView?.postMessage) {
      window.ReactNativeWebView.postMessage(JSON.stringify(message));
      return id;
    }

    // Стандартный iframe postMessage
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(message, this.parentOrigin);
    }

    return id;
  }

  /**
   * Отправить fire-and-forget сообщение без ожидания ответа (например, setup BackButton)
   */
  post<T>(type: string, payload: T): void {
    this.send(type, payload);
  }

  /**
   * Ожидание ответа по ID запроса
   */
  private waitForResponse<T>(requestId: string, timeout: number = 30000): Promise<AWMessage<T>> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.off(handler);
        this.pendingRequests.delete(requestId);
        reject(new AWTimeoutError(requestId));
      }, timeout);

      const handler: MessageHandler = (message) => {
        if (message.requestId === requestId) {
          clearTimeout(timer);
          this.off(handler);
          this.pendingRequests.delete(requestId);
          resolve(message as AWMessage<T>);
        }
      };

      this.pendingRequests.set(requestId, { timer, reject });
      this.on(handler);
    });
  }

  /**
   * Отправить сообщение и ждать ответ с retry при таймауте.
   * Каждая попытка — новый requestId + новый send + новый waitForResponse.
   */
  sendAndWait<TPayload, TResponse>(
    type: string,
    payload: TPayload,
    timeout: number,
    retry: RetryConfig = DEFAULT_RETRY,
  ): Promise<AWMessage<TResponse>> {
    return withRetry(
      () => {
        const requestId = this.send(type, payload);
        return this.waitForResponse<TResponse>(requestId, timeout);
      },
      retry,
      this.logger,
    );
  }

  /**
   * Регистрация обработчика сообщений
   */
  on(handler: MessageHandler): void {
    this.handlers.add(handler);
  }

  /**
   * Удаление обработчика сообщений
   */
  off(handler: MessageHandler): void {
    this.handlers.delete(handler);
  }

  /**
   * Очистка всех слушателей
   */
  destroy(): void {
    if (this.boundListener) {
      window.removeEventListener('message', this.boundListener);
      this.boundListener = null;
    }
    this.handlers.clear();
    // Ожидающие запросы отклоняем сразу: иначе промис (например, сканер с таймаутом 10 мин)
    // и его таймер пережили бы SDK
    for (const { timer, reject } of this.pendingRequests.values()) {
      clearTimeout(timer);
      reject(new AWSDKError(InitErrorCodes.GenericError, 'Transport destroyed'));
    }
    this.pendingRequests.clear();
    this.logger.log('Транспорт уничтожен');
  }

  private handleEvent(event: MessageEvent): void {
    // Проверка origin
    if (event.origin !== this.parentOrigin) {
      return;
    }

    if (!isValidAWMessage(event.data)) {
      return;
    }

    const message = event.data;
    this.logger.log('Получено сообщение:', message.type, message.requestId);

    // Снимок до обхода: обработчик ожидания снимает requestId из pending прямо в цикле
    const meta: MessageMeta = { isReply: this.pendingRequests.has(message.requestId) };
    for (const handler of this.handlers) {
      handler(message, meta);
    }
  }
}
