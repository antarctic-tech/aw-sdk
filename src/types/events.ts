import type { AWSession } from './session';

/**
 * Карта событий SDK
 */
export type AWSDKEventMap = {
  'sdk.ready': AWSession;
  'sdk.error': { code: string; message: string };
  'scopes.granted': { scopes: string[] };
  'session.refreshed': { sessionToken: string; idToken?: string | null; expiresAt: number };
  'session.expired': void;
  'operation.rejected': { operationId: string; reason: string };
};
