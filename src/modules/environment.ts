import type { TypedEmitter } from '../events/emitter';
import type { PostMessageTransport } from '../transport/postMessage';
import type { AWEnvironment } from '../types/environment';
import type { AWSDKEventMap } from '../types/events';
import { type AWMessage, IframeToParentMessageType, ParentToIframeMessageType } from '../types/protocol';
import {
  applyEnvironmentCssVars,
  parseBoolean,
  parseColorScheme,
  parseInsets,
  parseLanguageCode,
  readLaunchEnvironment,
} from '../utils/environment';

const REQUESTS = [
  IframeToParentMessageType.WEB_APP_REQUEST_THEME,
  IframeToParentMessageType.WEB_APP_REQUEST_LANGUAGE,
  IframeToParentMessageType.WEB_APP_REQUEST_SAFE_AREA,
];

/**
 * стартовый снимок из launch URL, полный снимок
 * *_changed хост шлёт сам перед SDK_INIT_OK / SESSION_STATUS, дальше — при каждом изменении.
 * web_app_request_* — ручной refresh (видимость запросом не отдаётся).
 */
export class EnvironmentModule {
  private state: AWEnvironment = readLaunchEnvironment();
  private listening = false;
  private received = false;

  constructor(
    private transport: PostMessageTransport,
    private events: TypedEmitter<AWSDKEventMap>,
    private appId: string,
  ) {
    applyEnvironmentCssVars(this.state);
  }

  get platform() { return this.state.platform; }
  get colorScheme() { return this.state.colorScheme; }
  get languageCode() { return this.state.languageCode; }
  get safeAreaInset() { return this.state.safeAreaInset; }
  get isActive() { return this.state.isActive; }
  /** Хост ответил хотя бы на один запрос — команды окружения поддерживаются */
  get isSupported() { return this.received; }

  start(): void {
    if (this.listening) return;
    this.transport.on(this.handleMessage);
    this.listening = true;
  }

  /** Запросить у хоста свежий снимок; старый хост запросы игнорирует, ответа не ждём */
  refresh(): void {
    for (const type of REQUESTS) this.transport.post(type, {});
  }

  destroy(): void {
    this.transport.off(this.handleMessage);
    this.listening = false;
    this.received = false;
    this.state = { isActive: true };
    applyEnvironmentCssVars(this.state);
  }

  private handleMessage = (message: AWMessage): void => {
    if (message.appId !== this.appId) return;
    const data = message.payload && typeof message.payload === 'object' ? (message.payload as Record<string, unknown>) : null;
    if (!data) return;

    switch (message.type) {
      case ParentToIframeMessageType.THEME_CHANGED:
        return this.apply({ colorScheme: parseColorScheme(data.color_scheme) }, 'themeChanged');
      case ParentToIframeMessageType.LANGUAGE_CHANGED:
        return this.apply({ languageCode: parseLanguageCode(data.language_code) }, 'languageChanged');
      case ParentToIframeMessageType.SAFE_AREA_CHANGED:
        return this.apply({ safeAreaInset: parseInsets(data) }, 'safeAreaChanged');
      case ParentToIframeMessageType.VISIBILITY_CHANGED: {
        const isActive = parseBoolean(data.is_visible);
        if (isActive === undefined) return;
        const changed = this.state.isActive !== isActive;
        this.state = { ...this.state, isActive };
        this.received = true;
        if (changed) this.events.emit(isActive ? 'activated' : 'deactivated');
        return;
      }
    }
  };

  private apply(patch: Partial<AWEnvironment>, event: 'themeChanged' | 'languageChanged' | 'safeAreaChanged'): void {
    const entries = Object.entries(patch).filter(([, value]) => value !== undefined) as [keyof AWEnvironment, unknown][];
    if (entries.length === 0) return;
    this.received = true;
    const changed = entries.some(([key, value]) => JSON.stringify(this.state[key]) !== JSON.stringify(value));
    if (!changed) return;
    this.state = { ...this.state, ...Object.fromEntries(entries) };
    applyEnvironmentCssVars(this.state);
    this.events.emit(event);
  }
}
