import type { AWSession } from '../types/session';
import type { Logger } from './logger';

const STORAGE_PREFIX = 'aw-sdk:session:';

interface StoredSession {
  session: AWSession;
  savedAt: number;
  supportedCommands?: Record<string, number>;
}

/**
 * Сохранить сессию в sessionStorage
 */
export function saveSession(
  appId: string,
  session: AWSession,
  logger?: Logger,
  supportedCommands?: Record<string, number>,
): void {
  try {
    const key = STORAGE_PREFIX + appId;
    // Refresh пересохраняет сессию без карты команд — не терять её, иначе после перезагрузки
    // isCommandAvailable вернёт false для всех необязательных команд
    const data: StoredSession = {
      session,
      savedAt: Date.now(),
      supportedCommands: supportedCommands ?? loadSupportedCommands(appId),
    };
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
 * Команды хоста, сохранённые вместе с сессией (пусто, если запись старого формата)
 */
export function loadSupportedCommands(appId: string): Record<string, number> {
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + appId);
    if (!raw) return {};
    const data: StoredSession = JSON.parse(raw);
    return data.supportedCommands ?? {};
  } catch {
    return {};
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
