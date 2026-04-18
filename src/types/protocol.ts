import type { AWUserContext } from './user';

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
  PREPARE_OPERATION = 'PREPARE_OPERATION',
  REQUEST_OPERATION_CONFIRM = 'REQUEST_OPERATION_CONFIRM',
  GET_SESSION_STATUS = 'GET_SESSION_STATUS',
  GET_SCOPES = 'GET_SCOPES',
  GET_SCOPES_DATA = 'GET_SCOPES_DATA',
}

/**
 * Сообщения из родительского кошелька в iframe SDK
 */
export enum ParentToIframeMessageType {
  SDK_INIT_OK = 'SDK_INIT_OK',
  SDK_INIT_FAIL = 'SDK_INIT_FAIL',
  SESSION_REFRESHED = 'SESSION_REFRESHED',
  SESSION_REFRESH_FAIL = 'SESSION_REFRESH_FAIL',
  OPERATION_PREPARED = 'OPERATION_PREPARED',
  OPERATION_PREPARE_FAIL = 'OPERATION_PREPARE_FAIL',
  OPERATION_APPROVED = 'OPERATION_APPROVED',
  OPERATION_REJECTED = 'OPERATION_REJECTED',
  SESSION_STATUS = 'SESSION_STATUS',
  SESSION_STATUS_FAIL = 'SESSION_STATUS_FAIL',
  SCOPES_RESULT = 'SCOPES_RESULT',
  SCOPES_DATA_RESULT = 'SCOPES_DATA_RESULT',
  SCOPES_FAIL = 'SCOPES_FAIL',
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
  PrepareOperation = 'prepare_operation',
  RequestConfirm = 'request_confirm',
  GetSessionStatus = 'get_session_status',
  GetScopes = 'get_scopes',
  GetScopesData = 'get_scopes_data',
}

/**
 * Минимальные версии команд, требуемые этой версией SDK
 */
export const COMMAND_VERSIONS: Record<AWCommand, number> = {
  [AWCommand.Init]: 1,
  [AWCommand.SessionRefresh]: 1,
  [AWCommand.PrepareOperation]: 1,
  [AWCommand.RequestConfirm]: 1,
  [AWCommand.GetSessionStatus]: 1,
  [AWCommand.GetScopes]: 1,
  [AWCommand.GetScopesData]: 1,
};

/**
 * Проверяет, поддерживает ли хост все необходимые команды
 */
export function validateSupportedCommands(
  supported: Record<string, number> | undefined,
): boolean {
  if (!supported) return true; // если хост не отдаёт — считаем всё поддерживается

  for (const [command, requiredVersion] of Object.entries(COMMAND_VERSIONS)) {
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
  grantedScopes: string[];
  userContext: AWUserContext;
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
 * Payload PREPARE_OPERATION
 */
export interface PrepareOperationPayload {
  type: string;
  amount: string;
  currency: string;
  to: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Payload OPERATION_PREPARED
 */
export interface OperationPreparedPayload {
  operationId: string;
  type: string;
  status: string;
  amount: string;
  currency: string;
  to: string;
  description?: string;
}

/**
 * Payload OPERATION_PREPARE_FAIL
 */
export interface OperationPrepareFailPayload {
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
 * Payload для ошибок (общий)
 */
export interface ErrorPayload {
  code: string;
  message: string;
}
