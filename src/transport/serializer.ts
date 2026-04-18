import type { AWMessage } from '../types/protocol';

/**
 * Проверка что входящие данные — валидная обёртка AWMessage
 */
export function isValidAWMessage(data: unknown): data is AWMessage {
  if (!data || typeof data !== 'object') return false;

  const msg = data as Record<string, unknown>;
  return (
    typeof msg.type === 'string' &&
    typeof msg.requestId === 'string' &&
    typeof msg.version === 'string' &&
    typeof msg.appId === 'string' &&
    typeof msg.timestamp === 'number' &&
    'payload' in msg
  );
}

/**
 * Создание обёртки AWMessage
 */
export function createMessage<T>(
  type: string,
  payload: T,
  appId: string,
  requestId: string,
  version: string,
): AWMessage<T> {
  return {
    type,
    requestId,
    payload,
    version,
    appId,
    timestamp: Date.now(),
  };
}
