import { AWTimeoutError } from './errors';
import type { Logger } from './logger';

export interface RetryConfig {
  /** Максимальное количество попыток (включая первую). По умолчанию 1 (без retry) */
  maxAttempts: number;
  /** Базовая задержка перед retry в мс. По умолчанию 1000 */
  baseDelay: number;
}

export const DEFAULT_RETRY: RetryConfig = {
  maxAttempts: 1,
  baseDelay: 1000,
};

/**
 * Выполняет fn с retry и экспоненциальным backoff.
 * Retry только при AWTimeoutError — явные ошибки (reject, fail) не повторяются.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig,
  logger?: Logger,
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      // Retry только при таймауте — остальные ошибки пробрасываем сразу
      if (!(error instanceof AWTimeoutError)) {
        throw error;
      }

      lastError = error;

      if (attempt < config.maxAttempts) {
        const delay = config.baseDelay * Math.pow(2, attempt - 1);
        logger?.warn(`Таймаут, retry ${attempt}/${config.maxAttempts} через ${delay}мс...`);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
