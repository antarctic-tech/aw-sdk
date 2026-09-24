import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AWSDK, AWCommand, IframeToParentMessageType, ParentToIframeMessageType } from '../src/index';
import type { AWMessage } from '../src/types/protocol';

const parentOrigin = 'https://wallet.example';
const config = { appId: 'app-1', parentOrigin, scopes: [], timeout: 100, retry: { maxAttempts: 1 } };

type Browser = EventTarget & {
  location: { search: string; origin: string };
  parent: { postMessage: ReturnType<typeof vi.fn> };
};

let browser: Browser;
let sdk: AWSDK | undefined;
let hostReplies: boolean;
let storage: Map<string, string>;

const SNAPSHOT: { type: ParentToIframeMessageType; payload: unknown }[] = [
  { type: ParentToIframeMessageType.THEME_CHANGED, payload: { color_scheme: 'light' } },
  { type: ParentToIframeMessageType.LANGUAGE_CHANGED, payload: { language_code: 'ru' } },
  { type: ParentToIframeMessageType.SAFE_AREA_CHANGED, payload: { top: 0, right: 0, bottom: 34, left: 0 } },
  { type: ParentToIframeMessageType.VISIBILITY_CHANGED, payload: { is_visible: true } },
];

const REQUEST_REPLIES: Record<string, { type: ParentToIframeMessageType; payload: unknown }> = {
  [IframeToParentMessageType.WEB_APP_REQUEST_THEME]: SNAPSHOT[0],
  [IframeToParentMessageType.WEB_APP_REQUEST_LANGUAGE]: SNAPSHOT[1],
  [IframeToParentMessageType.WEB_APP_REQUEST_SAFE_AREA]: SNAPSHOT[2],
};

function deliver(type: ParentToIframeMessageType, payload: unknown, requestId = 'env-1', origin = parentOrigin) {
  browser.dispatchEvent(new MessageEvent('message', {
    origin,
    data: { type, payload, appId: config.appId, requestId, version: '1.0', timestamp: Date.now() },
  }));
}

function sentTypes(): string[] {
  return browser.parent.postMessage.mock.calls.map(([message]) => (message as AWMessage).type);
}

beforeEach(() => {
  storage = new Map();
  hostReplies = true;
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  vi.stubGlobal('document', { documentElement: { style: { setProperty: () => {}, removeProperty: () => {} } } });
  browser = Object.assign(new EventTarget(), {
    location: { search: '?awPlatform=web&awColorScheme=dark&awLanguageCode=pt-BR', origin: 'https://mini.example' },
    parent: { postMessage: vi.fn((message: AWMessage) => {
      queueMicrotask(() => {
        const reply = REQUEST_REPLIES[message.type];
        if (reply) {
          if (hostReplies) deliver(reply.type, reply.payload, message.requestId);
          return;
        }
        const type = message.type === IframeToParentMessageType.SDK_INIT
          ? ParentToIframeMessageType.SDK_INIT_OK : ParentToIframeMessageType.SESSION_STATUS;
        // Хост шлёт снимок окружения до ответа, завершающего init
        if (hostReplies) SNAPSHOT.forEach(item => deliver(item.type, item.payload, `snap-${item.type}`));
        browser.dispatchEvent(new MessageEvent('message', {
          origin: parentOrigin,
          data: { ...message, type, payload: {
            sessionToken: 'token', status: 'active', grantedScopes: [], userContext: {},
            expiresAt: Date.now() + 3_600_000, supportedCommands: { init: 1 },
          } },
        }));
      });
    }) },
  });
  vi.stubGlobal('window', browser);
});

afterEach(() => {
  sdk?.destroy();
  sdk = undefined;
  vi.unstubAllGlobals();
});

describe('окружение хоста через AWSDK', () => {
  it('launch-параметры доступны сразу после конструктора, без транспорта', () => {
    sdk = new AWSDK(config);
    expect(sdk.platform).toBe('web');
    expect(sdk.colorScheme).toBe('dark');
    expect(sdk.languageCode).toBe('pt-BR');
    expect(sdk.isActive).toBe(true);
    expect(browser.parent.postMessage).not.toHaveBeenCalled();
  });

  it('init не шлёт запросов, снимок хоста применён к моменту резолва init()', async () => {
    sdk = new AWSDK(config);
    const theme = vi.fn(() => expect(sdk?.colorScheme).toBe('light'));
    sdk.events.on('themeChanged', theme);
    await sdk.init();
    expect(sentTypes().some(type => type.startsWith('web_app_request_'))).toBe(false);
    expect(theme).toHaveBeenCalledOnce();
    expect(sdk.languageCode).toBe('ru');
    expect(sdk.safeAreaInset).toEqual({ top: 0, right: 0, bottom: 34, left: 0 });
    expect(sdk.isActive).toBe(true);
    expect(sdk.isCommandAvailable(AWCommand.RequestSafeArea)).toBe(true);
  });

  it('refreshEnvironment шлёт три web_app_request_* и применяет ответы', async () => {
    sdk = new AWSDK(config);
    await sdk.init();
    const safeArea = vi.fn();
    sdk.events.on('safeAreaChanged', safeArea);
    SNAPSHOT[2].payload = { top: 0, right: 0, bottom: 0, left: 0 };
    sdk.refreshEnvironment();
    await new Promise(resolve => setTimeout(resolve, 0));
    SNAPSHOT[2].payload = { top: 0, right: 0, bottom: 34, left: 0 };
    expect(sentTypes().filter(type => type.startsWith('web_app_request_'))).toHaveLength(3);
    expect(safeArea).toHaveBeenCalledOnce();
    expect(sdk.safeAreaInset).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });

  it('visibility_changed от хоста переключает isActive', async () => {
    sdk = new AWSDK(config);
    await sdk.init();
    const deactivated = vi.fn();
    const activated = vi.fn();
    sdk.events.on('deactivated', deactivated);
    sdk.events.on('activated', activated);
    deliver(ParentToIframeMessageType.VISIBILITY_CHANGED, { is_visible: false });
    expect(sdk.isActive).toBe(false);
    deliver(ParentToIframeMessageType.VISIBILITY_CHANGED, { is_visible: true });
    expect(deactivated).toHaveBeenCalledOnce();
    expect(activated).toHaveBeenCalledOnce();
  });

  it('чужой origin игнорируется', async () => {
    sdk = new AWSDK(config);
    await sdk.init();
    deliver(ParentToIframeMessageType.THEME_CHANGED, { color_scheme: 'dark' }, 'x', 'https://other.example');
    expect(sdk.colorScheme).toBe('light');
  });

  it('старый кошелёк не шлёт снимок, init завершается и свойства undefined', async () => {
    hostReplies = false;
    browser.location.search = '';
    sdk = new AWSDK(config);
    const error = vi.fn();
    sdk.events.on('sdk.error', error);
    const session = await sdk.init();
    expect(session.sessionToken).toBe('token');
    expect(sdk.colorScheme).toBeUndefined();
    expect(sdk.safeAreaInset).toBeUndefined();
    expect(sdk.isCommandAvailable(AWCommand.RequestTheme)).toBe(false);
    expect(error).not.toHaveBeenCalled();
  });

  it('при восстановлении сессии без SDK_INIT снимок приходит перед SESSION_STATUS', async () => {
    storage.set('aw-sdk:session:app-1', JSON.stringify({ session: {
      sessionToken: 'saved-token', grantedScopes: [], userContext: {}, expiresAt: Date.now() + 3_600_000,
    }, savedAt: Date.now() }));
    sdk = new AWSDK(config);
    const session = await sdk.init();
    expect(session.sessionToken).toBe('saved-token');
    expect(sdk.colorScheme).toBe('light');
    expect(sdk.safeAreaInset).toEqual({ top: 0, right: 0, bottom: 34, left: 0 });
    const types = sentTypes();
    expect(types).toContain(IframeToParentMessageType.GET_SESSION_STATUS);
    expect(types).not.toContain(IframeToParentMessageType.SDK_INIT);
  });

  it('после destroy сообщения не обрабатываются, состояние сброшено', async () => {
    sdk = new AWSDK(config);
    await sdk.init();
    const changed = vi.fn();
    sdk.events.on('themeChanged', changed);
    sdk.destroy();
    deliver(ParentToIframeMessageType.THEME_CHANGED, { color_scheme: 'dark' });
    expect(changed).not.toHaveBeenCalled();
    expect(sdk.colorScheme).toBeUndefined();
    expect(sdk.isActive).toBe(true);
  });
});
