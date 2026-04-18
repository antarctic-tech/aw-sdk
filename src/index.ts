// Основной класс
export { AWSDK } from './sdk';

// Типы конфигурации
export type { AWSDKConfig, AWRetryConfig } from './types/config';

// Типы сессии
export type { AWSession, AWSessionStatus, AWSessionStatusResponse } from './types/session';

// Типы пользователя
export type { AWUserContext } from './types/user';

// Типы операций
export type {
  AWOperationType,
  AWOperationStatus,
  AWOperationIntentParams,
  AWOperationIntent,
  AWOperationResult,
} from './types/operations';

// Скоупы
export { AWScope } from './types/scopes';

// Типы событий
export type { AWSDKEventMap } from './types/events';

// Протокол (публичные enum'ы и утилиты)
export {
  IframeToParentMessageType,
  ParentToIframeMessageType,
  PROTOCOL_VERSION,
  AWCommand,
  COMMAND_VERSIONS,
  validateSupportedCommands,
  isCommandAvailable,
} from './types/protocol';

// Typed Error Codes
export {
  InitErrorCodes,
  InitErrorMessage,
  SessionErrorCodes,
  SessionErrorMessage,
  OperationErrorCodes,
  OperationErrorMessage,
  ScopeErrorCodes,
  ScopeErrorMessage,
} from './types/errors';

// Классы ошибок
export {
  AWSDKError,
  AWTimeoutError,
  AWInitError,
  AWSessionError,
  AWOperationError,
  AWScopeError,
} from './utils/errors';

// Утилиты
export { SDK_VERSION } from './utils/version';
