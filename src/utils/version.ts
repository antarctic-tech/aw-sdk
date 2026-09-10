/**
 * Версия SDK. Подставляется из package.json на этапе сборки (vite `define`),
 * поэтому руками её править не нужно — см. vite.config.ts.
 */
declare const __SDK_VERSION__: string;

export const SDK_VERSION: string =
  typeof __SDK_VERSION__ === 'string' ? __SDK_VERSION__ : '0.0.0-dev';
