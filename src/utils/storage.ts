import type { AWSession } from '../types/session';
import type { Logger } from './logger';

const STORAGE_PREFIX = 'aw-sdk:session:';

interface StoredSession {
  session: AWSession;
  savedAt: number;
}

/**
 * Сохранить сессию в sessionStorage
 */
export function saveSession(appId: string, session: AWSession, logger?: Logger): void {
  try {
    const key = STORAGE_PREFIX + appId;
    const data: StoredSession = { session, savedAt: Date.now() };
    sessionStorage.setItem(key, JSON.stringify(data));
    logger?.log('Сессия сохранена в sessionStorage');
  } catch {
    logger?.warn('Не удалось сохранить сессию в sessionStorage');
  }
}

/**
 * Загрузить сессию из sessionStorage.
 * Возвращает null если сессия не найдена или истекла.
 */
export function loadSession(appId: string, logger?: Logger): AWSession | null {
  try {
    const key = STORAGE_PREFIX + appId;
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;

    const data: StoredSession = JSON.parse(raw);

    // Проверяем, не истекла ли сессия
    if (data.session.expiresAt <= Date.now()) {
      logger?.log('Сохранённая сессия истекла, удаляем');
      sessionStorage.removeItem(key);
      return null;
    }

    logger?.log('Сессия загружена из sessionStorage');
    return data.session;
  } catch {
    logger?.warn('Не удалось загрузить сессию из sessionStorage');
    return null;
  }
}

/**
 * Удалить сохранённую сессию
 */
export function clearSession(appId: string, logger?: Logger): void {
  try {
    sessionStorage.removeItem(STORAGE_PREFIX + appId);
    logger?.log('Сессия удалена из sessionStorage');
  } catch {
    logger?.warn('Не удалось удалить сессию из sessionStorage');
  }
}
