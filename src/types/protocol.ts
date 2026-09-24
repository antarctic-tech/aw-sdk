/**
 * Обёртка для всех postMessage сообщений
 */
export interface AWMessage<T = unknown> {
  type: string;
  requestId: string;
  payload: T;
  version: string;
  appId: string;
  timestamp: number;
}

/**
 * Сообщения из iframe SDK в родительский кошелёк
 */
export enum IframeToParentMessageType {
  SDK_INIT = 'SDK_INIT',
  SESSION_REFRESH = 'SESSION_REFRESH',
  REQUEST_OPERATION_CONFIRM = 'REQUEST_OPERATION_CONFIRM',
  GET_SESSION_STATUS = 'GET_SESSION_STATUS',
  GET_SCOPES = 'GET_SCOPES',
  GET_SCOPES_DATA = 'GET_SCOPES_DATA',
  WEB_APP_SETUP_BACK_BUTTON = 'web_app_setup_back_button',
  WEB_APP_REQUEST_THEME = 'web_app_request_theme',
  WEB_APP_REQUEST_LANGUAGE = 'web_app_request_language',
  WEB_APP_REQUEST_SAFE_AREA = 'web_app_request_safe_area',
  WEB_APP_OPEN_SCAN_QR = 'web_app_open_scan_qr',
  WEB_APP_TRIGGER_HAPTIC_FEEDBACK = 'web_app_trigger_haptic_feedback',
  WEB_APP_SET_BACKGROUND_COLOR = 'web_app_set_background_color',
}

/**
 * Сообщения из родительского кошелька в iframe SDK
 */
export enum ParentToIframeMessageType {
  SDK_INIT_OK = 'SDK_INIT_OK',
  SDK_INIT_FAIL = 'SDK_INIT_FAIL',
  SESSION_REFRESHED = 'SESSION_REFRESHED',
  SESSION_REFRESH_FAIL = 'SESSION_REFRESH_FAIL',
  OPERATION_APPROVED = 'OPERATION_APPROVED',
  OPERATION_REJECTED = 'OPERATION_REJECTED',
  SESSION_STATUS = 'SESSION_STATUS',
  SESSION_STATUS_FAIL = 'SESSION_STATUS_FAIL',
  SCOPES_RESULT = 'SCOPES_RESULT',
  SCOPES_DATA_RESULT = 'SCOPES_DATA_RESULT',
  SCOPES_FAIL = 'SCOPES_FAIL',
  BACK_BUTTON_PRESSED = 'back_button_pressed',
  THEME_CHANGED = 'theme_changed',
  LANGUAGE_CHANGED = 'language_changed',
  SAFE_AREA_CHANGED = 'safe_area_changed',
  VISIBILITY_CHANGED = 'visibility_changed',
  QR_TEXT_RECEIVED = 'qr_text_received',
  SCAN_QR_CLOSED = 'scan_qr_closed',
  ERROR = 'ERROR',
}

/**
 * Версия протокола
 */
export const PROTOCOL_VERSION = '1.0';

// ============================================================================
// Command Versioning (по аналогии с World MiniKit)
// ============================================================================

/**
 * Перечисление команд SDK
 */
export enum AWCommand {
  Init = 'init',
  SessionRefresh = 'session_refresh',
  RequestConfirm = 'request_confirm',
  GetSessionStatus = 'get_session_status',
  GetScopes = 'get_scopes',
  GetScopesData = 'get_scopes_data',
  RequestTheme = 'web_app_request_theme',
  RequestLanguage = 'web_app_request_language',
  RequestSafeArea = 'web_app_request_safe_area',
  OpenScanQr = 'web_app_open_scan_qr',
  TriggerHapticFeedback = 'web_app_trigger_haptic_feedback',
  SetBackgroundColor = 'web_app_set_background_color',
}

/**
 * Минимальные версии команд, требуемые этой версией SDK
 */
export const COMMAND_VERSIONS: Record<AWCommand, number> = {
  [AWCommand.Init]: 1,
  [AWCommand.SessionRefresh]: 1,
  [AWCommand.RequestConfirm]: 1,
  [AWCommand.GetSessionStatus]: 1,
  [AWCommand.GetScopes]: 1,
  [AWCommand.GetScopesData]: 1,
  [AWCommand.RequestTheme]: 1,
  [AWCommand.RequestLanguage]: 1,
  [AWCommand.RequestSafeArea]: 1,
  [AWCommand.OpenScanQr]: 1,
  [AWCommand.TriggerHapticFeedback]: 1,
  [AWCommand.SetBackgroundColor]: 1,
};

/**
 * Команды окружения: хост их поддерживает, если прислал хоть один снимок *_changed
 */
export const ENVIRONMENT_COMMANDS: ReadonlySet<AWCommand> = new Set([
  AWCommand.RequestTheme,
  AWCommand.RequestLanguage,
  AWCommand.RequestSafeArea,
]);

/**
 * Необязательные команды: старый кошелёк их не знает, init не блокируется
 */
export const OPTIONAL_COMMANDS: ReadonlySet<AWCommand> = new Set([
  ...ENVIRONMENT_COMMANDS,
  AWCommand.OpenScanQr,
  AWCommand.TriggerHapticFeedback,
  AWCommand.SetBackgroundColor,
]);

/**
 * Проверяет, поддерживает ли хост все необходимые команды
 */
export function validateSupportedCommands(
  supported: Record<string, number> | undefined,
): boolean {
  if (!supported) return true; // если хост не отдаёт — считаем всё поддерживается

  for (const [command, requiredVersion] of Object.entries(COMMAND_VERSIONS)) {
    if (OPTIONAL_COMMANDS.has(command as AWCommand)) continue;
    const hostVersion = supported[command] ?? 0;
    if (hostVersion < requiredVersion) return false;
  }
  return true;
}

/**
 * Проверяет доступность конкретной команды
 */
export function isCommandAvailable(
  command: AWCommand,
  supported: Record<string, number>,
): boolean {
  const requiredVersion = COMMAND_VERSIONS[command];
  const hostVersion = supported[command] ?? 0;
  return hostVersion >= requiredVersion;
}

// ============================================================================
// Payload types
// ============================================================================

/**
 * Payload SDK_INIT
 */
export interface SdkInitPayload {
  appId: string;
  origin: string;
  sdkVersion: string;
  requestedScopes: string[];
}

/**
 * Payload SDK_INIT_OK
 */
export interface SdkInitOkPayload {
  sessionToken: string;
  /**
   * Подписанный OIDC id_token (JWT): sub = доверенный user_id. Мини-апа форвардит
   * его на свой бэкенд, тот верифицирует подпись через JWKS хоста. null пока
   * сессия pending. Единственный доверенный идентификатор юзера на бэкенде.
   */
  idToken?: string | null;
  grantedScopes: string[];
  expiresAt: number;
  /** Поддерживаемые команды хоста с версиями */
  supportedCommands?: Record<string, number>;
}

/**
 * Payload SDK_INIT_FAIL
 */
export interface SdkInitFailPayload {
  code: string;
  message: string;
}

/**
 * Payload SESSION_REFRESHED
 */
export interface SessionRefreshedPayload {
  sessionToken: string;
  /** Свежий id_token (TTL ~600с) — обновляется вместе с сессией. */
  idToken?: string | null;
  grantedScopes: string[];
  expiresAt: number;
}

/**
 * Payload SESSION_REFRESH_FAIL
 */
export interface SessionRefreshFailPayload {
  code: string;
  message: string;
}

/**
 * Payload REQUEST_OPERATION_CONFIRM
 */
export interface RequestOperationConfirmPayload {
  operationId: string;
}

/**
 * Payload OPERATION_APPROVED (родитель уже сделал commit)
 */
export interface OperationApprovedPayload {
  operationId: string;
  status: string;
  txId?: string;
}

/**
 * Payload OPERATION_REJECTED
 */
export interface OperationRejectedPayload {
  operationId: string;
  reason: string;
}

/**
 * Payload SESSION_STATUS
 */
export interface SessionStatusPayload {
  status: string;
  /** Свежий id_token для активной сессии (null если pending/expired). */
  idToken?: string | null;
  grantedScopes: string[];
  expiresAt: number;
}

/**
 * Payload SCOPES_RESULT
 */
export interface ScopesResultPayload {
  grantedScopes: string[];
}

/**
 * Payload SCOPES_DATA_RESULT
 */
export interface ScopesDataResultPayload {
  data: unknown;
}

/**
 * Payload web_app_setup_back_button
 */
export interface SetupBackButtonPayload {
  is_visible: boolean;
}

/** Payload theme_changed */
export interface ThemeChangedPayload {
  color_scheme: 'light' | 'dark';
}

/** Payload language_changed */
export interface LanguageChangedPayload {
  language_code: string;
}

/** Payload safe_area_changed */
export interface SafeAreaChangedPayload {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Payload visibility_changed */
export interface VisibilityChangedPayload {
  is_visible: boolean;
}

/** Payload web_app_open_scan_qr: пустой — подпись в сканере рисует кошелёк, приложению её не доверяем */
export type OpenScanQrPayload = Record<string, never>;

/** Payload qr_text_received: распознанная строка, сканер уже закрыт */
export interface QrTextReceivedPayload {
  data: string;
}

export type HapticImpactStyle = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';
export type HapticNotificationType = 'error' | 'success' | 'warning';

/** Payload web_app_trigger_haptic_feedback — как у Telegram, ответа нет */
export type TriggerHapticFeedbackPayload =
  | { type: 'impact'; impact_style: HapticImpactStyle }
  | { type: 'notification'; notification_type: HapticNotificationType }
  | { type: 'selection_change' };

/** Payload web_app_set_background_color — #rrggbb, ответа нет */
export interface SetBackgroundColorPayload {
  color: string;
}

/**
 * Payload для ошибок (общий)
 */
export interface ErrorPayload {
  code: string;
  message: string;
}
