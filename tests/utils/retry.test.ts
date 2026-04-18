import { describe, it, expect, vi } from 'vitest';
import { withRetry, type RetryConfig } from '../../src/utils/retry';
import { AWTimeoutError, AWInitError } from '../../src/utils/errors';
import { InitErrorCodes } from '../../src/types/errors';

describe('withRetry', () => {
  const config: RetryConfig = { maxAttempts: 3, baseDelay: 10 };

  it('возвращает результат при первом успехе', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, config);

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledOnce();
  });

  it('повторяет при AWTimeoutError и возвращает результат', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new AWTimeoutError('r1'))
      .mockResolvedValue('retry-ok');

    const result = await withRetry(fn, config);

    expect(result).toBe('retry-ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('выбрасывает AWTimeoutError после исчерпания попыток', async () => {
    const fn = vi.fn()
      .mockRejectedValue(new AWTimeoutError('r1'));

    await expect(withRetry(fn, config)).rejects.toThrow(AWTimeoutError);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('не повторяет при не-timeout ошибках', async () => {
    const fn = vi.fn()
      .mockRejectedValue(new AWInitError(InitErrorCodes.ScopesRejected));

    await expect(withRetry(fn, config)).rejects.toThrow(AWInitError);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('задержка растёт экспоненциально', async () => {
    vi.useFakeTimers();

    const fn = vi.fn()
      .mockRejectedValueOnce(new AWTimeoutError('r1'))
      .mockRejectedValueOnce(new AWTimeoutError('r2'))
      .mockResolvedValue('done');

    const cfg: RetryConfig = { maxAttempts: 3, baseDelay: 100 };
    const promise = withRetry(fn, cfg);

    // Первый retry: 100ms * 2^0 = 100ms
    await vi.advanceTimersByTimeAsync(100);
    // Второй retry: 100ms * 2^1 = 200ms
    await vi.advanceTimersByTimeAsync(200);

    const result = await promise;
    expect(result).toBe('done');
    expect(fn).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  });

  it('работает с maxAttempts=1 (без retry)', async () => {
    const fn = vi.fn().mockRejectedValue(new AWTimeoutError('r1'));
    const cfg: RetryConfig = { maxAttempts: 1, baseDelay: 100 };

    await expect(withRetry(fn, cfg)).rejects.toThrow(AWTimeoutError);
    expect(fn).toHaveBeenCalledOnce();
  });
});
