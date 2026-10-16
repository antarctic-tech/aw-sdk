import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AWInitError, AWSDK, IframeToParentMessageType, ParentToIframeMessageType } from '../src/index';
import type { AWMessage } from '../src/types/protocol';

const parentOrigin = 'https://wallet.example';
const config = { appId: 'app-1', parentOrigin, scopes: [], timeout: 100, retry: { maxAttempts: 1 } };

type Browser = EventTarget & {
  location: { search: string; origin: string };
  parent: { postMessage: ReturnType<typeof vi.fn> };
};

let browser: Browser;
let sdk: AWSDK | undefined;
let storage: Map<string, string>;
let hostStartParam: unknown;
let includeStartParam: boolean;
let refreshFails: boolean;
let initFails: boolean;
let expiresAt: number;

function deliver(type: ParentToIframeMessageType, payload: unknown, requestId: string) {
  browser.dispatchEvent(new MessageEvent('message', {
    origin: parentOrigin,
    data: { type, payload, appId: config.appId, requestId, version: '1.0', timestamp: Date.now() },
  }));
}

function sentTypes(): string[] {
  return browser.parent.postMessage.mock.calls.map(([message]) => (message as AWMessage).type);
}

beforeEach(() => {
  storage = new Map();
  hostStartParam = 'order_42';
  includeStartParam = true;
  refreshFails = false;
  initFails = false;
  expiresAt = Date.now() + 3_600_000;
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  vi.stubGlobal('document', { documentElement: { style: { setProperty: () => {}, removeProperty: () => {} } } });
  browser = Object.assign(new EventTarget(), {
    location: { search: '', origin: 'https://mini.example' },
    parent: { postMessage: vi.fn((message: AWMessage) => {
      queueMicrotask(() => {
        if (message.type === IframeToParentMessageType.SESSION_REFRESH) {
          if (refreshFails) {
            deliver(ParentToIframeMessageType.SESSION_REFRESH_FAIL, {
              code: 'refresh_failed',
              message: 'expired',
            }, message.requestId);
            return;
          }
          deliver(ParentToIframeMessageType.SESSION_REFRESHED, {
            sessionToken: 'token-2',
            grantedScopes: [],
            expiresAt: Date.now() + 3_600_000,
            start_param: 'refreshed_param',
          }, message.requestId);
          return;
        }
        if (message.type === IframeToParentMessageType.SDK_INIT && initFails) {
          deliver(ParentToIframeMessageType.SDK_INIT_FAIL, {
            code: 'init_failed',
            message: 'fail',
          }, message.requestId);
          return;
        }
        const type = message.type === IframeToParentMessageType.SDK_INIT
          ? ParentToIframeMessageType.SDK_INIT_OK
          : ParentToIframeMessageType.SESSION_STATUS;
        const payload: Record<string, unknown> = {
          sessionToken: 'token',
          status: 'active',
          grantedScopes: [],
          expiresAt,
          supportedCommands: { init: 1 },
        };
        if (includeStartParam) payload.start_param = hostStartParam;
        deliver(type, payload, message.requestId);
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

describe('sdk.startParam', () => {
  it('до init равен null', () => {
    sdk = new AWSDK(config);
    expect(sdk.startParam).toBeNull();
  });

  it('после хендшейка равен строке хоста и не попадает в сессию и sessionStorage', async () => {
    sdk = new AWSDK(config);
    await sdk.init();
    expect(sdk.startParam).toBe('order_42');
    expect(sdk.getSession()).not.toHaveProperty('startParam');
    expect([...storage.values()].join('\n')).not.toContain('order_42');
    expect(sentTypes()).toContain(IframeToParentMessageType.SDK_INIT);
  });

  it('при восстановлении сессии берёт параметр из SESSION_STATUS, а не из sessionStorage', async () => {
    storage.set('aw-sdk:session:app-1', JSON.stringify({
      session: {
        sessionToken: 'saved-token',
        grantedScopes: [],
        userContext: {},
        expiresAt: Date.now() + 3_600_000,
        startParam: 'stale_param',
      },
      savedAt: Date.now(),
    }));
    hostStartParam = 'from_host';
    sdk = new AWSDK(config);
    const session = await sdk.init();
    expect(session.sessionToken).toBe('saved-token');
    expect(session).not.toHaveProperty('startParam');
    expect(sdk.startParam).toBe('from_host');
    expect(sentTypes()).toContain(IframeToParentMessageType.GET_SESSION_STATUS);
    expect(sentTypes()).not.toContain(IframeToParentMessageType.SDK_INIT);
  });

  it('нет поля — null, в том числе если в storage лежит чужой параметр', async () => {
    storage.set('aw-sdk:session:app-1', JSON.stringify({
      session: {
        sessionToken: 'saved-token',
        grantedScopes: [],
        userContext: {},
        expiresAt: Date.now() + 3_600_000,
        startParam: 'stale_param',
      },
      savedAt: Date.now(),
    }));
    includeStartParam = false;
    sdk = new AWSDK(config);
    await sdk.init();
    expect(sdk.startParam).toBeNull();
    expect(sdk.getSession()).not.toHaveProperty('startParam');
  });

  it('битое поле не роняет init и не эмитит sdk.error', async () => {
    for (const value of ['', 'bad char', 'a'.repeat(513), 1]) {
      sdk?.destroy();
      storage.clear();
      hostStartParam = value;
      sdk = new AWSDK(config);
      const onError = vi.fn();
      sdk.events.on('sdk.error', onError);
      await expect(sdk.init()).resolves.toMatchObject({ sessionToken: 'token' });
      expect(sdk.startParam).toBeNull();
      expect(onError).not.toHaveBeenCalled();
    }
  });

  it('не читает start_param и tgWebAppStartParam из URL и не смешивает их с launch-env', async () => {
    browser.location.search = '?start_param=from_url&tgWebAppStartParam=ref_ads&awPlatform=ios&awLanguageCode=ru';
    includeStartParam = false;
    sdk = new AWSDK(config);
    expect(sdk.platform).toBe('ios');
    expect(sdk.languageCode).toBe('ru');
    await sdk.init();
    expect(sdk.startParam).toBeNull();
    expect(sdk.platform).toBe('ios');
    expect(sdk.languageCode).toBe('ru');
  });

  it('значение хоста не подменяется параметром из URL', async () => {
    browser.location.search = '?start_param=from_url&tgWebAppStartParam=ref_ads&awPlatform=web&awLanguageCode=en';
    hostStartParam = 'from_host';
    sdk = new AWSDK(config);
    await sdk.init();
    expect(sdk.startParam).toBe('from_host');
    expect(sdk.platform).toBe('web');
    expect(sdk.languageCode).toBe('en');
    expect([...storage.values()].join('\n')).not.toContain('from_host');
    expect([...storage.values()].join('\n')).not.toContain('from_url');
  });

  it('повторный init и refreshSession не перетирают параметр', async () => {
    sdk = new AWSDK(config);
    await sdk.init();
    hostStartParam = 'other_param';
    await sdk.init();
    expect(sdk.startParam).toBe('order_42');
    expect(sentTypes().filter(type => type === IframeToParentMessageType.SDK_INIT)).toHaveLength(1);
    await sdk.refreshSession();
    expect(sdk.startParam).toBe('order_42');
    expect([...storage.values()].join('\n')).not.toContain('refreshed_param');
    expect([...storage.values()].join('\n')).not.toContain('order_42');
  });

  it('после session.expired повторный init не меняет параметр', async () => {
    expiresAt = Date.now() + 1_000;
    sdk = new AWSDK(config);
    await sdk.init();

    refreshFails = true;
    await vi.waitFor(() => expect(sdk!.getSession()).toBeNull());

    initFails = true;
    await expect(sdk.init()).rejects.toBeInstanceOf(AWInitError);
    expect(sdk.startParam).toBe('order_42');

    initFails = false;
    includeStartParam = false;
    await sdk.init();
    expect(sdk.startParam).toBe('order_42');
    expect(sdk.getSession()?.sessionToken).toBe('token');
  });

  it('пустой параметр не заполняется следующим init', async () => {
    includeStartParam = false;
    expiresAt = Date.now() + 1_000;
    sdk = new AWSDK(config);
    await sdk.init();
    expect(sdk.startParam).toBeNull();

    refreshFails = true;
    includeStartParam = true;
    hostStartParam = 'late_param';
    await vi.waitFor(() => expect(sdk!.getSession()).toBeNull());
    await sdk.init();
    expect(sdk.startParam).toBeNull();
  });

  it('destroy сбрасывает геттер, следующий init читает параметр заново', async () => {
    sdk = new AWSDK(config);
    await sdk.init();
    sdk.destroy();
    expect(sdk.startParam).toBeNull();

    hostStartParam = 'after_destroy';
    await sdk.init();
    expect(sdk.startParam).toBe('after_destroy');
  });
});
