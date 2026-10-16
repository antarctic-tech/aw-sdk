/**
 * Коды ошибок инициализации SDK
 */
export enum InitErrorCodes {
  ScopesRejected = 'scopes_rejected',
  InvalidAppId = 'invalid_app_id',
  InvalidOrigin = 'invalid_origin',
  Timeout = 'timeout',
  AlreadyInitialized = 'already_initialized',
  GenericError = 'generic_error',
}

export const InitErrorMessage: Record<InitErrorCodes, string> = {
  [InitErrorCodes.ScopesRejected]: 'User rejected the requested scopes.',
  [InitErrorCodes.InvalidAppId]: 'The app ID is not registered or invalid.',
  [InitErrorCodes.InvalidOrigin]: 'The origin is not allowed for this app.',
  [InitErrorCodes.Timeout]: 'Initialization timed out. Make sure the app is running inside Antarctic Wallet.',
  [InitErrorCodes.AlreadyInitialized]: 'SDK is already initialized.',
  [InitErrorCodes.GenericError]: 'Something unexpected went wrong during initialization.',
};

/**
 * Коды ошибок сессии
 */
export enum SessionErrorCodes {
  Expired = 'session_expired',
  Revoked = 'session_revoked',
  RefreshFailed = 'refresh_failed',
  InvalidToken = 'invalid_token',
  GenericError = 'generic_error',
}

export const SessionErrorMessage: Record<SessionErrorCodes, string> = {
  [SessionErrorCodes.Expired]: 'Session has expired. Please re-initialize the SDK.',
  [SessionErrorCodes.Revoked]: 'Session has been revoked by the user or wallet.',
  [SessionErrorCodes.RefreshFailed]: 'Failed to refresh the session token.',
  [SessionErrorCodes.InvalidToken]: 'The session token is invalid.',
  [SessionErrorCodes.GenericError]: 'Something unexpected went wrong with the session.',
};

/**
 * Коды ошибок операций (pay, receive, scopes)
 */
export enum OperationErrorCodes {
  UserRejected = 'user_rejected',
  InsufficientBalance = 'insufficient_balance',
  InvalidRecipient = 'invalid_recipient',
  InvalidAmount = 'invalid_amount',
  TransactionFailed = 'transaction_failed',
  PreparationFailed = 'preparation_failed',
  ConfirmationTimeout = 'confirmation_timeout',
  GenericError = 'generic_error',
}

export const OperationErrorMessage: Record<OperationErrorCodes, string> = {
  [OperationErrorCodes.UserRejected]: 'User rejected the operation.',
  [OperationErrorCodes.InsufficientBalance]: 'Insufficient balance to complete this operation.',
  [OperationErrorCodes.InvalidRecipient]: 'The recipient address is invalid.',
  [OperationErrorCodes.InvalidAmount]: 'The amount is invalid or below minimum.',
  [OperationErrorCodes.TransactionFailed]: 'The transaction failed. Please try again.',
  [OperationErrorCodes.PreparationFailed]: 'Failed to prepare the operation.',
  [OperationErrorCodes.ConfirmationTimeout]: 'Operation confirmation timed out.',
  [OperationErrorCodes.GenericError]: 'Something unexpected went wrong with the operation.',
};

/**
 * Коды ошибок скоупов
 */
export enum ScopeErrorCodes {
  Rejected = 'scopes_rejected',
  InvalidScope = 'invalid_scope',
  NotGranted = 'scope_not_granted',
  GenericError = 'generic_error',
}

/**
 * Коды ошибок QR-сканера хоста
 */
export enum ScanQrErrorCodes {
  /** Хост не поддерживает сканер (старый кошелёк) */
  Unsupported = 'unsupported',
  /** Пользователь закрыл сканер, ничего не отсканировав */
  Closed = 'closed',
  /** Приложение не на экране — сканер открывает только активное приложение */
  NotActive = 'not_active',
  /** Сканер уже открыт */
  AlreadyOpen = 'already_open',
  /** Нет доступа к камере */
  CameraDenied = 'camera_denied',
  GenericError = 'generic_error',
}

export const ScanQrErrorMessage: Record<ScanQrErrorCodes, string> = {
  [ScanQrErrorCodes.Unsupported]: 'The host does not support the QR scanner.',
  [ScanQrErrorCodes.Closed]: 'The user closed the scanner.',
  [ScanQrErrorCodes.NotActive]: 'The app must be on screen to open the scanner.',
  [ScanQrErrorCodes.AlreadyOpen]: 'The scanner is already open.',
  [ScanQrErrorCodes.CameraDenied]: 'Camera access was denied.',
  [ScanQrErrorCodes.GenericError]: 'Something unexpected went wrong with the scanner.',
};

/**
 * Коды ошибок открытия другой мини-апки
 */
export enum OpenAppErrorCodes {
  /** Апки нет в реестре */
  NotFound = 'not_found',
  /** Апка заблокирована */
  Blocked = 'blocked',
  /** Апка приостановлена */
  Suspended = 'suspended',
  /** Стек контейнеров уже глубиной 5 */
  StackLimit = 'stack_limit',
  /** Чаще одного вызова в 500 мс или больше 10 успешных переходов в минуту */
  RateLimited = 'rate_limited',
  /** appId не строка или пустой после trim — на хост не уходит */
  InvalidAppId = 'invalid_app_id',
  /** Вызов со своим appId — на хост не уходит */
  SameApp = 'same_app',
  /** startParam не из алфавита или длиннее 512 — на хост не уходит */
  InvalidStartParam = 'invalid_start_param',
  /** fullscreen передан и это не boolean — на хост не уходит */
  InvalidFullscreen = 'invalid_fullscreen',
  /** Хост не заявил open_app */
  Unsupported = 'unsupported',
  GenericError = 'generic_error',
}

export const OpenAppErrorMessage: Record<OpenAppErrorCodes, string> = {
  [OpenAppErrorCodes.NotFound]: 'The app was not found.',
  [OpenAppErrorCodes.Blocked]: 'The app is blocked.',
  [OpenAppErrorCodes.Suspended]: 'The app is suspended.',
  [OpenAppErrorCodes.StackLimit]: 'The app stack is full.',
  [OpenAppErrorCodes.RateLimited]: 'Too many app opens. Try again later.',
  [OpenAppErrorCodes.InvalidAppId]: 'appId must be a non-empty string after trimming.',
  [OpenAppErrorCodes.SameApp]: 'Cannot open the current app.',
  [OpenAppErrorCodes.InvalidStartParam]: 'startParam must be 1–512 characters from A-Za-z0-9_-.',
  [OpenAppErrorCodes.InvalidFullscreen]: 'fullscreen must be a boolean.',
  [OpenAppErrorCodes.Unsupported]: 'The host does not support opening another app.',
  [OpenAppErrorCodes.GenericError]: 'Something unexpected went wrong while opening the app.',
};

export const ScopeErrorMessage: Record<ScopeErrorCodes, string> = {
  [ScopeErrorCodes.Rejected]: 'User rejected the scope request.',
  [ScopeErrorCodes.InvalidScope]: 'One or more requested scopes are invalid.',
  [ScopeErrorCodes.NotGranted]: 'The required scope has not been granted.',
  [ScopeErrorCodes.GenericError]: 'Something unexpected went wrong with scope management.',
};
