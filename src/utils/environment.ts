import type { AWColorScheme, AWEnvironment, AWInsets, AWPlatform } from '../types/environment';

const CSS_VAR_PREFIX = '--aw-';

export function parsePlatform(value: unknown): AWPlatform | undefined {
  return value === 'web' || value === 'tma' || value === 'ios' || value === 'android' ? value : undefined;
}

export function parseColorScheme(value: unknown): AWColorScheme | undefined {
  return value === 'light' || value === 'dark' ? value : undefined;
}

export function parseLanguageCode(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 64) return undefined;
  try {
    return Intl.getCanonicalLocales(value)[0];
  } catch {
    return undefined;
  }
}

export function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  return value === 'true' ? true : value === 'false' ? false : undefined;
}

function isSize(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function parseInsets(value: unknown): AWInsets | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const { top, right, bottom, left } = value as Record<string, unknown>;
  if (!isSize(top) || !isSize(right) || !isSize(bottom) || !isSize(left)) return undefined;
  return Object.freeze({ top, right, bottom, left });
}

/** Стартовый снимок из query launch URL (аналог tgWebApp* у TMA): awPlatform, awColorScheme, awLanguageCode */
export function readLaunchEnvironment(): AWEnvironment {
  if (typeof window === 'undefined') return { isActive: true };
  const params = new URLSearchParams(window.location.search);
  return {
    platform: parsePlatform(params.get('awPlatform')),
    colorScheme: parseColorScheme(params.get('awColorScheme')),
    languageCode: parseLanguageCode(params.get('awLanguageCode')),
    isActive: true,
  };
}

/** CSS-переменные на :root: --aw-safe-area-inset-{top,right,bottom,left}, --aw-color-scheme */
export function applyEnvironmentCssVars(env: AWEnvironment): void {
  if (typeof document === 'undefined') return;
  const style = document.documentElement.style;
  const set = (name: string, value: string | number | undefined) => {
    if (value === undefined) style.removeProperty(CSS_VAR_PREFIX + name);
    else style.setProperty(CSS_VAR_PREFIX + name, typeof value === 'number' ? `${value}px` : value);
  };
  set('safe-area-inset-top', env.safeAreaInset?.top);
  set('safe-area-inset-right', env.safeAreaInset?.right);
  set('safe-area-inset-bottom', env.safeAreaInset?.bottom);
  set('safe-area-inset-left', env.safeAreaInset?.left);
  set('color-scheme', env.colorScheme);
}
