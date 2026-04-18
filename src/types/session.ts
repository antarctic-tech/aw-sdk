import type { AWUserContext } from './user';

/**
 * Статус сессии
 */
export type AWSessionStatus = 'active' | 'expired' | 'revoked';

/**
 * Информация о сессии после инициализации
 */
export interface AWSession {
  sessionToken: string;
  grantedScopes: string[];
  userContext: AWUserContext;
  expiresAt: number;
}

/**
 * Ответ бэкенда со статусом сессии
 */
export interface AWSessionStatusResponse {
  status: AWSessionStatus;
  grantedScopes: string[];
  expiresAt: number;
}
