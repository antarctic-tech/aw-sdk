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
 * Коды ошибок операций (transfer, payment)
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

export const ScopeErrorMessage: Record<ScopeErrorCodes, string> = {
  [ScopeErrorCodes.Rejected]: 'User rejected the scope request.',
  [ScopeErrorCodes.InvalidScope]: 'One or more requested scopes are invalid.',
  [ScopeErrorCodes.NotGranted]: 'The required scope has not been granted.',
  [ScopeErrorCodes.GenericError]: 'Something unexpected went wrong with scope management.',
};
