import type { AWSDKConfig } from './types/config';
import type { AWSession, AWSessionStatusResponse } from './types/session';
import type { AWUserContext } from './types/user';
import type { AWSDKEventMap } from './types/events';
import { PostMessageTransport } from './transport/postMessage';
import { TypedEmitter } from './events/emitter';
import { performHandshake } from './modules/handshake';
import { OperationsModule } from './modules/operations';
import { SessionModule } from './modules/session';
import { ScopesModule } from './modules/scopes';
import { Logger } from './utils/logger';
import { type RetryConfig } from './utils/retry';
import { saveSession, loadSession, clearSession } from './utils/storage';
import {
  AWCommand,
  isCommandAvailable,
  ParentToIframeMessageType,
  type AWMessage,
  type ErrorPayload,
} from './types/protocol';
import { InitErrorCodes } from './types/errors';
import { AWInitError } from './utils/errors';

const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_RETRY: RetryConfig = { maxAttempts: 3, baseDelay: 1000 };

/**
 * Основной класс SDK для встроенных мини-приложений Antarctic Wallet
 */
export class AWSDK {
  private config: AWSDKConfig;
  private transport: PostMessageTransport;
  private logger: Logger;
  private retryConfig: RetryConfig;
  private sessionToken: string | null = null;
  private session: AWSession | null = null;
  private initialized = false;
  private supportedCommands: Record<string, number> = {};
  private persistEnabled: boolean;

  public readonly events = new TypedEmitter<AWSDKEventMap>();
  public readonly operations: OperationsModule;
  public readonly scopes: ScopesModule;

  private sessionModule: SessionModule;

  constructor(config: AWSDKConfig) {
    this.config = config;
    this.logger = new Logger('AW-SDK', config.debug ?? false);
    this.transport = new PostMessageTransport(config.parentOrigin, config.appId, this.logger);
    this.persistEnabled = config.persistSession ?? true;

    const timeout = config.timeout ?? DEFAULT_TIMEOUT;
    this.retryConfig = {
      maxAttempts: config.retry?.maxAttempts ?? DEFAULT_RETRY.maxAttempts,
      baseDelay: config.retry?.baseDelay ?? DEFAULT_RETRY.baseDelay,
    };

    this.operations = new OperationsModule(
      this.transport,
      timeout,
      this.logger,
      this.retryConfig,
    );

    this.sessionModule = new SessionModule(
      this.transport,
      timeout,
      this.logger,
      this.retryConfig,
    );

    this.scopes = new ScopesModule(this.transport, timeout, this.logger, this.retryConfig);
  }

  // ============================================================================
  // Static Methods
  // ============================================================================

  /**
   * Проверяет, запущено ли приложение внутри Antarctic Wallet (iframe или WebView)
   */
  static isInsideWallet(): boolean {
    if (typeof window === 'undefined') return false;

    // Внутри iframe
    if (window.parent !== window) return true;

    // React Native WebView
    if (window.ReactNativeWebView) return true;

    return false;
  }

  // ============================================================================
  // User State
  // ============================================================================

  /**
   * Контекст текущего пользователя (доступен после init)
   */
  get user(): AWUserContext | null {
    return this.session?.userContext ?? null;
  }

  /**
   * Подписанный OIDC id_token текущей сессии (доступен после init).
   * Форвардь его на свой бэкенд: тот проверит подпись через JWKS хоста и достанет
   * доверенный user_id из sub. Для авторизации используй ТОЛЬКО его, не userContext.
   */
  get idToken(): string | null {
    return this.session?.idToken ?? null;
  }

  // ============================================================================
  // Command Versioning
  // ============================================================================

  /**
   * Проверить, доступна ли конкретная команда на хосте
   */
  isCommandAvailable(command: AWCommand): boolean {
    if (Object.keys(this.supportedCommands).length === 0) return true;
    return isCommandAvailable(command, this.supportedCommands);
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  /**
   * Инициализация SDK: запуск транспорта, хэндшейк, авто-рефреш.
   * При наличии сохранённой сессии — восстанавливает её без полного хэндшейка.
   */
  async init(): Promise<AWSession> {
    if (this.initialized) {
      this.logger.warn('SDK уже инициализирован');
      return this.session!;
    }

    this.transport.init();
    this.setupGlobalErrorHandler();

    // Попытка восстановить сессию из sessionStorage
    const restored = await this.tryRestoreSession();
    if (restored) {
      return restored;
    }

    // Полный хэндшейк
    return this.performFullInit();
  }

  /**
   * Попытка восстановить сессию из sessionStorage.
   * Если сессия есть и валидна — возвращает AWSession, иначе null.
   */
  private async tryRestoreSession(): Promise<AWSession | null> {
    if (!this.persistEnabled) return null;

    const stored = loadSession(this.config.appId, this.logger);
    if (!stored) return null;

    try {
      // Валидируем сессию через родителя
      const status = await this.sessionModule.getStatus();

      if (status.status === 'active') {
        this.logger.log('Сессия восстановлена из sessionStorage');

        this.session = {
          ...stored,
          idToken: status.idToken ?? stored.idToken ?? null,
          grantedScopes: status.grantedScopes,
          expiresAt: status.expiresAt,
        };
        this.sessionToken = stored.sessionToken;
        this.initialized = true;

        this.startAutoRefreshAndEmit(this.session);
        return this.session;
      }

      // Сессия неактивна — очищаем
      this.logger.log('Сохранённая сессия неактивна:', status.status);
      clearSession(this.config.appId, this.logger);
      return null;
    } catch {
      // Не удалось валидировать — идём по полному хэндшейку
      this.logger.warn('Не удалось валидировать сохранённую сессию, полный хэндшейк');
      clearSession(this.config.appId, this.logger);
      return null;
    }
  }

  /**
   * Полный хэндшейк с retry
   */
  private async performFullInit(): Promise<AWSession> {
    try {
      const result = await performHandshake(
        this.transport,
        this.config.appId,
        this.config.scopes,
        this.config.timeout ?? DEFAULT_TIMEOUT,
        this.logger,
        this.retryConfig,
      );

      this.session = result.session;
      this.sessionToken = result.session.sessionToken;
      this.supportedCommands = result.supportedCommands ?? {};
      this.initialized = true;

      // Сохраняем сессию
      if (this.persistEnabled) {
        saveSession(this.config.appId, result.session, this.logger);
      }

      this.startAutoRefreshAndEmit(result.session);
      return result.session;
    } catch (error) {
      if (error instanceof AWInitError) {
        this.events.emit('sdk.error', {
          code: error.errorCode,
          message: error.message,
        });
        throw error;
      }

      const err = error instanceof Error ? error : new Error(String(error));
      this.events.emit('sdk.error', {
        code: InitErrorCodes.GenericError,
        message: err.message,
      });
      throw new AWInitError(InitErrorCodes.GenericError, err.message);
    }
  }

  /**
   * Запуск авто-рефреша и эмит событий
   */
  private startAutoRefreshAndEmit(session: AWSession): void {
    this.sessionModule.startAutoRefresh(
      session.expiresAt,
      (refreshed) => {
        this.sessionToken = refreshed.sessionToken;

        // Обновляем сессию в памяти всегда (иначе idToken протухнет без persist),
        // сохраняем в storage — только если persist включён.
        if (this.session) {
          this.session = {
            ...this.session,
            sessionToken: refreshed.sessionToken,
            idToken: refreshed.idToken ?? this.session.idToken ?? null,
            grantedScopes: refreshed.grantedScopes,
            expiresAt: refreshed.expiresAt,
          };
          if (this.persistEnabled) {
            saveSession(this.config.appId, this.session, this.logger);
          }
        }

        this.events.emit('session.refreshed', {
          sessionToken: refreshed.sessionToken,
          idToken: refreshed.idToken ?? null,
          expiresAt: refreshed.expiresAt,
        });
      },
      () => {
        // Авто-рефреш провалился — сессия истекла
        this.session = null;
        this.sessionToken = null;
        this.initialized = false;

        if (this.persistEnabled) {
          clearSession(this.config.appId, this.logger);
        }

        this.events.emit('session.expired');
      },
    );

    this.events.emit('sdk.ready', session);
    this.events.emit('scopes.granted', { scopes: session.grantedScopes });
  }

  /**
   * Получить статус сессии с бэкенда
   */
  async status(): Promise<AWSessionStatusResponse> {
    return this.sessionModule.getStatus();
  }

  /**
   * Ручное обновление сессии
   */
  async refreshSession(): Promise<void> {
    const result = await this.sessionModule.refresh();
    this.sessionToken = result.sessionToken;

    if (this.session) {
      this.session = {
        ...this.session,
        sessionToken: result.sessionToken,
        idToken: result.idToken ?? this.session.idToken ?? null,
        grantedScopes: result.grantedScopes,
        expiresAt: result.expiresAt,
      };
      if (this.persistEnabled) {
        saveSession(this.config.appId, this.session, this.logger);
      }
    }

    this.events.emit('session.refreshed', {
      sessionToken: result.sessionToken,
      idToken: result.idToken ?? null,
      expiresAt: result.expiresAt,
    });
  }

  /**
   * Получить текущую сессию
   */
  getSession(): AWSession | null {
    return this.session;
  }

  /**
   * Очистка всех ресурсов
   */
  destroy(): void {
    this.sessionModule.destroy();
    this.transport.destroy();
    this.events.removeAllListeners();
    this.initialized = false;
    this.session = null;
    this.sessionToken = null;
    this.supportedCommands = {};

    if (this.persistEnabled) {
      clearSession(this.config.appId, this.logger);
    }

    this.logger.log('SDK уничтожен');
  }

  private setupGlobalErrorHandler(): void {
    this.transport.on((message: AWMessage) => {
      if (message.type === ParentToIframeMessageType.ERROR) {
        const payload = message.payload as ErrorPayload;
        this.logger.error('Ошибка от родителя:', payload);
        this.events.emit('sdk.error', { code: payload.code, message: payload.message });
      }

      if (message.type === ParentToIframeMessageType.OPERATION_REJECTED) {
        const payload = message.payload as { operationId: string; reason: string };
        this.events.emit('operation.rejected', payload);
      }
    });
  }
}
