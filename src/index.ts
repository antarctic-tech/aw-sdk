// Основной класс
export { AWSDK } from './sdk';
export { BackButtonModule } from './modules/backButton';
export { HapticFeedbackModule } from './modules/hapticFeedback';
export { BackgroundModule } from './modules/background';
export type {
  HapticImpactStyle,
  HapticNotificationType,
  TriggerHapticFeedbackPayload,
  SetBackgroundColorPayload,
} from './types/protocol';

// Окружение хоста: тема, язык, платформа, safe-area, видимость
export type { AWColorScheme, AWEnvironment, AWInsets, AWPlatform } from './types/environment';

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
  OPTIONAL_COMMANDS,
  ENVIRONMENT_COMMANDS,
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
  ScanQrErrorCodes,
  ScanQrErrorMessage,
} from './types/errors';

// Классы ошибок
export {
  AWSDKError,
  AWTimeoutError,
  AWInitError,
  AWSessionError,
  AWOperationError,
  AWScopeError,
  AWScanQrError,
} from './utils/errors';

// Утилиты
export { SDK_VERSION } from './utils/version';
