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
  /**
   * Подписанный OIDC id_token (sub = доверенный user_id). Форвардь на свой
   * бэкенд для верификации через JWKS — не доверяй userContext для авторизации.
   */
  idToken?: string | null;
  grantedScopes: string[];
  userContext: AWUserContext;
  expiresAt: number;
}

/**
 * Ответ бэкенда со статусом сессии
 */
export interface AWSessionStatusResponse {
  status: AWSessionStatus;
  /** Свежий id_token для активной сессии. */
  idToken?: string | null;
  grantedScopes: string[];
  expiresAt: number;
}
