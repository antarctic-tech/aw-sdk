import { describe, it, expect } from 'vitest';
import {
  AWSDKError,
  AWTimeoutError,
  AWInitError,
  AWSessionError,
  AWOperationError,
  AWScopeError,
} from '../../src/utils/errors';
import { InitErrorCodes, SessionErrorCodes, OperationErrorCodes, ScopeErrorCodes } from '../../src/types/errors';

describe('AWSDKError', () => {
  it('хранит code и message', () => {
    const err = new AWSDKError('TEST_CODE', 'Something broke');
    expect(err.code).toBe('TEST_CODE');
    expect(err.message).toBe('Something broke');
    expect(err.name).toBe('AWSDKError');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('AWTimeoutError', () => {
  it('создаётся с requestId', () => {
    const err = new AWTimeoutError('req-42');
    expect(err.code).toBe(InitErrorCodes.Timeout);
    expect(err.message).toContain('req-42');
    expect(err.name).toBe('AWTimeoutError');
    expect(err).toBeInstanceOf(AWSDKError);
  });
});

describe('AWInitError', () => {
  it('использует дефолтное сообщение по коду', () => {
    const err = new AWInitError(InitErrorCodes.ScopesRejected);
    expect(err.errorCode).toBe(InitErrorCodes.ScopesRejected);
    expect(err.message).toContain('rejected');
    expect(err.name).toBe('AWInitError');
  });

  it('использует кастомное сообщение', () => {
    const err = new AWInitError(InitErrorCodes.GenericError, 'Custom msg');
    expect(err.message).toBe('Custom msg');
  });
});

describe('AWSessionError', () => {
  it('создаётся с дефолтным сообщением', () => {
    const err = new AWSessionError(SessionErrorCodes.Expired);
    expect(err.errorCode).toBe(SessionErrorCodes.Expired);
    expect(err.message).toContain('expired');
    expect(err.name).toBe('AWSessionError');
  });
});

describe('AWOperationError', () => {
  it('хранит operationId', () => {
    const err = new AWOperationError('op-1', OperationErrorCodes.UserRejected);
    expect(err.operationId).toBe('op-1');
    expect(err.errorCode).toBe(OperationErrorCodes.UserRejected);
    expect(err.message).toContain('rejected');
    expect(err.name).toBe('AWOperationError');
  });
});

describe('AWScopeError', () => {
  it('создаётся с кодом ошибки', () => {
    const err = new AWScopeError(ScopeErrorCodes.NotGranted);
    expect(err.errorCode).toBe(ScopeErrorCodes.NotGranted);
    expect(err.message).toContain('not been granted');
    expect(err.name).toBe('AWScopeError');
  });
});
