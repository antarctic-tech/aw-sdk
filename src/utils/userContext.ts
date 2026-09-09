import type { AWUserContext } from '../types/user';

const MAX_TOKEN_LENGTH = 16_384;
const MAX_DISPLAY_NAME_LENGTH = 256;
const MAX_AVATAR_URL_LENGTH = 2048;

/**
 * Собирает userContext из payload id_token.
 * sub → displayName
 * userImage → avatarUrl
 * Подпись не проверяется — только для UI, не для авторизации.
 */
export function userContextFromIdToken(idToken?: string | null): AWUserContext {
  const payload = decodeJwtPayload(idToken);
  if (!payload) return {};

  const displayName = readDisplayName(payload.sub);
  const avatarUrl = readAvatarUrl(payload.userImage);

  return {
    ...(displayName ? { displayName } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
  };
}

function decodeJwtPayload(token?: string | null): Record<string, unknown> | null {
  if (!token || token.length > MAX_TOKEN_LENGTH) return null;

  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return null;

  try {
    const json = decodeBase64Url(parts[1]);
    const payload: unknown = JSON.parse(json);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

function decodeBase64Url(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function readDisplayName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const displayName = value.trim();
  if (!displayName || displayName.length > MAX_DISPLAY_NAME_LENGTH) return undefined;
  return displayName;
}

function readAvatarUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const avatarUrl = value.trim();
  if (!avatarUrl || avatarUrl.length > MAX_AVATAR_URL_LENGTH) return undefined;

  try {
    const url = new URL(avatarUrl);
    if (url.protocol !== 'https:') return undefined;
    return avatarUrl;
  } catch {
    return undefined;
  }
}
