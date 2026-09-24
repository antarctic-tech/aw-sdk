import { TypedEmitter } from './events/emitter';
import { BackButtonModule } from './modules/backButton';
import { BackgroundModule } from './modules/background';
import { EnvironmentModule } from './modules/environment';
import { performHandshake } from './modules/handshake';
import { HapticFeedbackModule } from './modules/hapticFeedback';
import { OperationsModule } from './modules/operations';
import { ScanQrModule } from './modules/scanQr';
import { ScopesModule } from './modules/scopes';
import { SessionModule } from './modules/session';
import { PostMessageTransport } from './transport/postMessage';
import type { AWSDKConfig } from './types/config';
import type { AWColorScheme, AWInsets, AWPlatform } from './types/environment';
import { InitErrorCodes } from './types/errors';
import type { AWSDKEventMap } from './types/events';
import {
  AWCommand,
  ENVIRONMENT_COMMANDS,
  isCommandAvailable,
  OPTIONAL_COMMANDS,
  ParentToIframeMessageType,
  type AWMessage,
  type ErrorPayload,
} from './types/protocol';
import type { AWSession, AWSessionStatusResponse } from './types/session';
import type { AWUserContext } from './types/user';
import { AWInitError } from './utils/errors';
import { Logger } from './utils/logger';
import { type RetryConfig } from './utils/retry';
import { clearSession, loadSession, loadSupportedCommands, saveSession } from './utils/storage';
import { userContextFromIdToken } from './utils/userContext';

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
  public readonly backButton: BackButtonModule;
  public readonly hapticFeedback: HapticFeedbackModule;

  private sessionModule: SessionModule;
  private environmentModule: EnvironmentModule;
  private scanQrModule: ScanQrModule;
  private backgroundModule: BackgroundModule;

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

    this.operations = new OperationsModule(this.transport, timeout, this.logger);

    this.sessionModule = new SessionModule(
      this.transport,
      timeout,
      this.logger,
      this.retryConfig,
    );

    this.scopes = new ScopesModule(this.transport, timeout, this.logger, this.retryConfig);
    this.backButton = new BackButtonModule(this.transport, this.logger);
    this.hapticFeedback = new HapticFeedbackModule(this.transport, this.logger);
    this.environmentModule = new EnvironmentModule(this.transport, this.events, config.appId);
    this.scanQrModule = new ScanQrModule(this.transport, this.logger, () => this.isCommandAvailable(AWCommand.OpenScanQr));
    this.backgroundModule = new BackgroundModule(this.transport, this.logger);
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
   * Контекст текущего пользователя (доступен после init).
   * displayName — это `sub` (per-app login), его и показываем как имя.
   */
  get user(): AWUserContext | null {
    return this.session?.userContext ?? null;
  }

  // ============================================================================
  // Host Environment
  // ============================================================================

  /** Платформа хоста: web | tma | ios | android (из launch URL) */
  get platform(): AWPlatform | undefined {
    return this.environmentModule.platform;
  }

  /** Применённая тема хоста */
  get colorScheme(): AWColorScheme | undefined {
    return this.environmentModule.colorScheme;
  }

  /** Язык интерфейса кошелька, BCP 47 (расширение AW) */
  get languageCode(): string | undefined {
    return this.environmentModule.languageCode;
  }

  /** Безопасные отступы внутри контейнера */
  get safeAreaInset(): AWInsets | undefined {
    return this.environmentModule.safeAreaInset;
  }

  /** Приложение на экране: не свёрнуто, кошелёк на переднем плане */
  get isActive(): boolean {
    return this.environmentModule.isActive;
  }

  /**
   * Запросить у хоста свежий снимок окружения (тема, язык, safe-area).
   * Обычно не нужен: хост сам шлёт снимок перед завершением init() и при каждом изменении.
   */
  refreshEnvironment(): void {
    this.environmentModule.refresh();
  }

  // ============================================================================
  // Background color
  // ============================================================================

  /**
   * Цвет фона под страницей приложения (#rgb | #rrggbb). Кошелёк красит им контейнер
   * webview, чтобы при оверскролле не был виден его собственный тон.
   * Без ответа; старый кошелёк игнорирует. Возвращает false для невалидного цвета.
   */
  setBackgroundColor(color: string): boolean {
    return this.backgroundModule.setBackgroundColor(color);
  }

  /** Последний принятый цвет фона (#rrggbb) */
  get backgroundColor(): string | undefined {
    return this.backgroundModule.backgroundColor;
  }

  // ============================================================================
  // QR Scanner
  // ============================================================================

  /**
   * Открыть QR-сканер кошелька и получить распознанную строку.
   * Камера остаётся у кошелька; сканер закрывается после первого результата.
   * Отклоняется AWScanQrError: closed (пользователь закрыл), not_active, already_open,
   * camera_denied, unsupported (старый кошелёк).
   */
  scanQr(): Promise<string> {
    return this.scanQrModule.open();
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
    if (ENVIRONMENT_COMMANDS.has(command)) {
      return this.environmentModule.isSupported || isCommandAvailable(command, this.supportedCommands);
    }
    // Прочие необязательные команды (сканер) требуют явного подтверждения хоста: без него
    // запрос ушёл бы в пустоту, а ждать ответа сканера можно долго
    if (OPTIONAL_COMMANDS.has(command)) return isCommandAvailable(command, this.supportedCommands);
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
    this.environmentModule.start();

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

        const idToken = status.idToken ?? stored.idToken ?? null;
        this.session = {
          ...stored,
          idToken,
          grantedScopes: status.grantedScopes,
          expiresAt: status.expiresAt,
          userContext: userContextFromIdToken(idToken),
        };
        this.sessionToken = stored.sessionToken;
        this.supportedCommands = loadSupportedCommands(this.config.appId);
        this.initialized = true;
        // Без SDK_INIT хост стрелку не сбрасывает — просто открываем канал
        this.backButton.activate();

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
      const handshake = performHandshake(
        this.transport,
        this.config.appId,
        this.config.scopes,
        this.config.timeout ?? DEFAULT_TIMEOUT,
        this.logger,
        this.retryConfig,
      );
      // SDK_INIT уже отправлен синхронно выше — теперь состояние стрелки уйдёт после него
      this.backButton.activate();
      const result = await handshake;

      this.session = result.session;
      this.sessionToken = result.session.sessionToken;
      this.supportedCommands = result.supportedCommands ?? {};
      this.initialized = true;
      this.backButton.resync();

      // Сохраняем сессию
      if (this.persistEnabled) {
        saveSession(this.config.appId, result.session, this.logger, this.supportedCommands);
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
          const idToken = refreshed.idToken ?? this.session.idToken ?? null;
          this.session = {
            ...this.session,
            sessionToken: refreshed.sessionToken,
            idToken,
            grantedScopes: refreshed.grantedScopes,
            expiresAt: refreshed.expiresAt,
            userContext: userContextFromIdToken(idToken),
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
      const idToken = result.idToken ?? this.session.idToken ?? null;
      this.session = {
        ...this.session,
        sessionToken: result.sessionToken,
        idToken,
        grantedScopes: result.grantedScopes,
        expiresAt: result.expiresAt,
        userContext: userContextFromIdToken(idToken),
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
    this.backButton.reset();
    this.backgroundModule.reset();
    this.environmentModule.destroy();
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
    this.transport.on((message: AWMessage, meta) => {
      if (message.type === ParentToIframeMessageType.ERROR && !meta.isReply) {
        const payload = message.payload as ErrorPayload;
        this.logger.error('Ошибка от родителя:', payload);
        this.events.emit('sdk.error', { code: payload.code, message: payload.message });
      }

      if (message.type === ParentToIframeMessageType.OPERATION_REJECTED) {
        const payload = message.payload as { operationId: string; reason: string };
        this.events.emit('operation.rejected', payload);
      }

      if (message.type === ParentToIframeMessageType.BACK_BUTTON_PRESSED) {
        this.backButton.handlePressed();
        this.events.emit('backButton');
      }
    });
  }
}
