import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EnvironmentModule } from '../../src/modules/environment';
import { TypedEmitter } from '../../src/events/emitter';
import type { AWSDKEventMap } from '../../src/types/events';
import type { PostMessageTransport } from '../../src/transport/postMessage';
import { type AWMessage, IframeToParentMessageType, ParentToIframeMessageType } from '../../src/types/protocol';
import { parseInsets, readLaunchEnvironment } from '../../src/utils/environment';

const REQUESTS = [
  IframeToParentMessageType.WEB_APP_REQUEST_THEME,
  IframeToParentMessageType.WEB_APP_REQUEST_LANGUAGE,
  IframeToParentMessageType.WEB_APP_REQUEST_SAFE_AREA,
];

const insets = { top: 0, right: 0, bottom: 34, left: 0 };

let cssVars: Map<string, string>;

function setup() {
  const handlers = new Set<(message: AWMessage) => void>();
  const post = vi.fn();
  const transport = {
    on: (handler: (message: AWMessage) => void) => handlers.add(handler),
    off: (handler: (message: AWMessage) => void) => handlers.delete(handler),
    post,
  } as unknown as PostMessageTransport;
  const events = new TypedEmitter<AWSDKEventMap>();
  const module = new EnvironmentModule(transport, events, 'app-1');
  const send = (type: ParentToIframeMessageType, payload: unknown, appId = 'app-1') => {
    const message: AWMessage = { type, appId, payload, requestId: 'env-1', version: '1.0', timestamp: Date.now() };
    handlers.forEach(handler => handler(message));
  };
  return { module, events, send, post, handlers };
}

beforeEach(() => {
  cssVars = new Map();
  vi.stubGlobal('document', {
    documentElement: {
      style: {
        setProperty: (name: string, value: string) => cssVars.set(name, value),
        removeProperty: (name: string) => cssVars.delete(name),
      },
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('EnvironmentModule', () => {
  it('читает launch-параметры до start и не шлёт запросов', () => {
    vi.stubGlobal('window', { location: { search: '?awPlatform=tma&awColorScheme=dark&awLanguageCode=pt-br' } });
    const { module, post } = setup();
    expect(module.platform).toBe('tma');
    expect(module.colorScheme).toBe('dark');
    expect(module.languageCode).toBe('pt-BR');
    expect(module.isActive).toBe(true);
    expect(module.safeAreaInset).toBeUndefined();
    expect(post).not.toHaveBeenCalled();
    expect(cssVars.get('--aw-color-scheme')).toBe('dark');
  });

  it('SSR и некорректные параметры дают undefined, isActive по умолчанию true', () => {
    expect(readLaunchEnvironment()).toEqual({ isActive: true });
    vi.stubGlobal('window', { location: { search: '?awPlatform=macos&awColorScheme=system&awLanguageCode=%' } });
    expect(readLaunchEnvironment()).toEqual({
      platform: undefined, colorScheme: undefined, languageCode: undefined, isActive: true,
    });
  });

  it('start ничего не шлёт и идемпотентен: подписка одна', () => {
    const { module, post, handlers } = setup();
    module.start();
    module.start();
    expect(post).not.toHaveBeenCalled();
    expect(handlers.size).toBe(1);
    expect(module.isSupported).toBe(false);
  });

  it('refresh шлёт три web_app_request_*', () => {
    const { module, post } = setup();
    module.refresh();
    expect(post.mock.calls.map(([type]) => type)).toEqual(REQUESTS);
  });

  it('theme_changed и language_changed обновляют свойства до событий и не повторяют их', () => {
    const { module, events, send } = setup();
    module.start();
    const theme = vi.fn(() => expect(module.colorScheme).toBe('light'));
    const language = vi.fn(() => expect(module.languageCode).toBe('kk'));
    events.on('themeChanged', theme);
    events.on('languageChanged', language);
    send(ParentToIframeMessageType.THEME_CHANGED, { color_scheme: 'light' });
    send(ParentToIframeMessageType.THEME_CHANGED, { color_scheme: 'light' });
    send(ParentToIframeMessageType.LANGUAGE_CHANGED, { language_code: 'kk' });
    expect(theme).toHaveBeenCalledOnce();
    expect(language).toHaveBeenCalledOnce();
    expect(module.isSupported).toBe(true);
    expect(cssVars.get('--aw-color-scheme')).toBe('light');
  });

  it('safe_area_changed отдаёт инсеты, не повторяет событие и ставит CSS-переменные', () => {
    const { module, events, send } = setup();
    module.start();
    const onSafeArea = vi.fn();
    events.on('safeAreaChanged', onSafeArea);
    send(ParentToIframeMessageType.SAFE_AREA_CHANGED, insets);
    send(ParentToIframeMessageType.SAFE_AREA_CHANGED, insets);
    expect(module.safeAreaInset).toEqual(insets);
    expect(Object.isFrozen(module.safeAreaInset)).toBe(true);
    expect(onSafeArea).toHaveBeenCalledOnce();
    expect(cssVars.get('--aw-safe-area-inset-bottom')).toBe('34px');
  });

  it('visibility_changed даёт activated/deactivated только на переходах', () => {
    const { module, events, send } = setup();
    module.start();
    const activated = vi.fn();
    const deactivated = vi.fn();
    events.on('activated', activated);
    events.on('deactivated', deactivated);
    send(ParentToIframeMessageType.VISIBILITY_CHANGED, { is_visible: true });
    send(ParentToIframeMessageType.VISIBILITY_CHANGED, { is_visible: false });
    send(ParentToIframeMessageType.VISIBILITY_CHANGED, { is_visible: false });
    send(ParentToIframeMessageType.VISIBILITY_CHANGED, { is_visible: true });
    expect(module.isActive).toBe(true);
    expect(deactivated).toHaveBeenCalledOnce();
    expect(activated).toHaveBeenCalledOnce();
  });

  it('битые payload и чужой appId игнорируются', () => {
    const { module, events, send } = setup();
    module.start();
    const changed = vi.fn();
    events.on('themeChanged', changed);
    events.on('safeAreaChanged', changed);
    send(ParentToIframeMessageType.THEME_CHANGED, null);
    send(ParentToIframeMessageType.THEME_CHANGED, { color_scheme: 'system' });
    send(ParentToIframeMessageType.SAFE_AREA_CHANGED, { ...insets, left: -1 });
    send(ParentToIframeMessageType.SAFE_AREA_CHANGED, { top: 0 });
    send(ParentToIframeMessageType.THEME_CHANGED, { color_scheme: 'light' }, 'other-app');
    expect(changed).not.toHaveBeenCalled();
    expect(module.colorScheme).toBeUndefined();
    expect(module.safeAreaInset).toBeUndefined();
  });

  it('destroy снимает подписку, сбрасывает состояние и CSS-переменные, допускает новый start', () => {
    const { module, send, handlers, post } = setup();
    module.start();
    send(ParentToIframeMessageType.SAFE_AREA_CHANGED, insets);
    module.destroy();
    send(ParentToIframeMessageType.VISIBILITY_CHANGED, { is_visible: false });
    expect(handlers.size).toBe(0);
    expect(module.isActive).toBe(true);
    expect(module.safeAreaInset).toBeUndefined();
    expect(cssVars.has('--aw-safe-area-inset-bottom')).toBe(false);
    module.start();
    module.refresh();
    expect(post).toHaveBeenCalledTimes(3);
  });
});

describe('parseInsets', () => {
  it.each([null, { top: 0 }, { ...insets, left: -1 }, { ...insets, top: 'x' }])('отвергает некорректные инсеты: %j', value => {
    expect(parseInsets(value)).toBeUndefined();
  });
});
