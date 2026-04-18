import {
  InitErrorCodes,
  InitErrorMessage,
  SessionErrorCodes,
  SessionErrorMessage,
  OperationErrorCodes,
  OperationErrorMessage,
  ScopeErrorCodes,
  ScopeErrorMessage,
} from '../types/errors';

/**
 * Базовая ошибка SDK
 */
export class AWSDKError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'AWSDKError';
    this.code = code;
  }
}

/**
 * Таймаут ожидания ответа postMessage
 */
export class AWTimeoutError extends AWSDKError {
  constructor(requestId: string) {
    super(InitErrorCodes.Timeout, `Request ${requestId} timed out`);
    this.name = 'AWTimeoutError';
  }
}

/**
 * Ошибка инициализации (скоупы отклонены и т.д.)
 */
export class AWInitError extends AWSDKError {
  public readonly errorCode: InitErrorCodes;

  constructor(code: InitErrorCodes, message?: string) {
    super(code, message ?? InitErrorMessage[code] ?? 'Initialization failed.');
    this.name = 'AWInitError';
    this.errorCode = code;
  }
}

/**
 * Сессия истекла или отозвана
 */
export class AWSessionError extends AWSDKError {
  public readonly errorCode: SessionErrorCodes;

  constructor(code: SessionErrorCodes, message?: string) {
    super(code, message ?? SessionErrorMessage[code] ?? 'Session error.');
    this.name = 'AWSessionError';
    this.errorCode = code;
  }
}

/**
 * Ошибка операции
 */
export class AWOperationError extends AWSDKError {
  public readonly operationId: string;
  public readonly errorCode: OperationErrorCodes;

  constructor(operationId: string, code: OperationErrorCodes, message?: string) {
    super(code, message ?? OperationErrorMessage[code] ?? 'Operation failed.');
    this.name = 'AWOperationError';
    this.operationId = operationId;
    this.errorCode = code;
  }
}

/**
 * Ошибка скоупов
 */
export class AWScopeError extends AWSDKError {
  public readonly errorCode: ScopeErrorCodes;

  constructor(code: ScopeErrorCodes, message?: string) {
    super(code, message ?? ScopeErrorMessage[code] ?? 'Scope error.');
    this.name = 'AWScopeError';
    this.errorCode = code;
  }
}
