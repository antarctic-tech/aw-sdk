import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AWOpenAppError,
  AWSDK,
  IframeToParentMessageType,
  OpenAppErrorCodes,
  ParentToIframeMessageType,
} from '../src/index';
import type { AWMessage, OpenAppParams } from '../src/types/protocol';

const parentOrigin = 'https://wallet.example';
const config = { appId: 'app-1', parentOrigin, scopes: [], timeout: 100, retry: { maxAttempts: 1 } };

type Browser = EventTarget & { location: { search: string; origin: string }; parent: { postMessage: ReturnType<typeof vi.fn> } };

let browser: Browser;
let sdk: AWSDK | undefined;
let supportedCommands: Record<string, number>;
let openReply: ((requestId: string) => void) | undefined;

function deliver(type: ParentToIframeMessageType, payload: unknown, requestId: string) {
  browser.dispatchEvent(new MessageEvent('message', {
    origin: parentOrigin,
    data: { type, payload, appId: config.appId, requestId, version: '1.0', timestamp: Date.now() },
  }));
}

function sent(type: string): AWMessage[] {
  return browser.parent.postMessage.mock.calls.map(([message]) => message as AWMessage).filter(message => message.type === type);
}

beforeEach(() => {
  supportedCommands = { init: 1, open_app: 1 };
  openReply = undefined;
  vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  vi.stubGlobal('document', { documentElement: { style: { setProperty: () => {}, removeProperty: () => {} } } });
  browser = Object.assign(new EventTarget(), {
    location: { search: '', origin: 'https://mini.example' },
    parent: { postMessage: vi.fn((message: AWMessage) => {
      queueMicrotask(() => {
        if (message.type === IframeToParentMessageType.OPEN_APP) {
          openReply?.(message.requestId);
          return;
        }
        if (message.type === IframeToParentMessageType.SDK_INIT) {
          deliver(ParentToIframeMessageType.SDK_INIT_OK, {
            sessionToken: 'token', grantedScopes: [], userContext: {}, expiresAt: Date.now() + 3_600_000, supportedCommands,
          }, message.requestId);
        }
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

describe('sdk.openApp', () => {
  it('шлёт appId, startParam и fullscreen и резолвится на OPEN_APP_OK', async () => {
    sdk = new AWSDK(config);
    await sdk.init();
    openReply = requestId => deliver(ParentToIframeMessageType.OPEN_APP_OK, {}, requestId);
    await expect(sdk.openApp({ appId: 'other', startParam: 'order_42', fullscreen: true })).resolves.toBeUndefined();
    const [message] = sent(IframeToParentMessageType.OPEN_APP);
    expect(message.payload).toEqual({ appId: 'other', startParam: 'order_42', fullscreen: true });
  });

  it('свой appId не уходит на хост', async () => {
    sdk = new AWSDK(config);
    await sdk.init();
    await expect(sdk.openApp({ appId: config.appId, startParam: 'again' })).rejects.toMatchObject({
      errorCode: OpenAppErrorCodes.SameApp,
    });
    await expect(sdk.openApp({ appId: `  ${config.appId}  ` })).rejects.toMatchObject({
      errorCode: OpenAppErrorCodes.SameApp,
    });
    expect(sent(IframeToParentMessageType.OPEN_APP)).toHaveLength(0);
  });

  it('обрезает appId до отправки', async () => {
    sdk = new AWSDK(config);
    await sdk.init();
    openReply = requestId => deliver(ParentToIframeMessageType.OPEN_APP_OK, {}, requestId);
    await sdk.openApp({ appId: '  other  ', startParam: 'order_42' });
    const [message] = sent(IframeToParentMessageType.OPEN_APP);
    expect(message.payload).toEqual({ appId: 'other', startParam: 'order_42' });
  });

  it('пустой startParam и отсутствие fullscreen не попадают в payload, false попадает', async () => {
    sdk = new AWSDK(config);
    await sdk.init();
    openReply = requestId => deliver(ParentToIframeMessageType.OPEN_APP_OK, {}, requestId);
    await sdk.openApp({ appId: 'other', startParam: '' });
    await sdk.openApp({ appId: 'other', startParam: null });
    await sdk.openApp({ appId: 'other' });
    await sdk.openApp({ appId: 'other', startParam: 'a'.repeat(512), fullscreen: false });
    const payloads = sent(IframeToParentMessageType.OPEN_APP).map(message => message.payload);
    expect(payloads).toEqual([
      { appId: 'other' },
      { appId: 'other' },
      { appId: 'other' },
      { appId: 'other', startParam: 'a'.repeat(512), fullscreen: false },
    ]);
  });

  it('невалидный startParam, пустой appId и не-boolean fullscreen не уходят на хост', async () => {
    sdk = new AWSDK(config);
    await sdk.init();
    const cases: Array<{ params: OpenAppParams; errorCode: OpenAppErrorCodes }> = [
      { params: { appId: 'other', startParam: 'bad char' }, errorCode: OpenAppErrorCodes.InvalidStartParam },
      { params: { appId: 'other', startParam: 'a'.repeat(513) }, errorCode: OpenAppErrorCodes.InvalidStartParam },
      { params: { appId: 'other', startParam: 1 as unknown as string }, errorCode: OpenAppErrorCodes.InvalidStartParam },
      { params: { appId: '' }, errorCode: OpenAppErrorCodes.InvalidAppId },
      { params: { appId: '   ' }, errorCode: OpenAppErrorCodes.InvalidAppId },
      { params: { appId: 1 as unknown as string }, errorCode: OpenAppErrorCodes.InvalidAppId },
      { params: { appId: 'other', fullscreen: 'yes' as unknown as boolean }, errorCode: OpenAppErrorCodes.InvalidFullscreen },
    ];
    for (const { params, errorCode } of cases) {
      await expect(sdk.openApp(params)).rejects.toMatchObject({ errorCode });
    }
    expect(sent(IframeToParentMessageType.OPEN_APP)).toHaveLength(0);
  });

  it('ERROR от хоста с известным кодом пробрасывается как есть, неизвестный → generic_error', async () => {
    sdk = new AWSDK(config);
    await sdk.init();
    for (const errorCode of [
      OpenAppErrorCodes.NotFound,
      OpenAppErrorCodes.Blocked,
      OpenAppErrorCodes.Suspended,
      OpenAppErrorCodes.StackLimit,
      OpenAppErrorCodes.RateLimited,
    ]) {
      openReply = requestId => deliver(ParentToIframeMessageType.ERROR, { code: errorCode, message: 'no' }, requestId);
      await expect(sdk.openApp({ appId: 'other' })).rejects.toMatchObject({ errorCode, message: 'no' });
    }
    openReply = requestId => deliver(ParentToIframeMessageType.ERROR, { code: 'weird', message: 'x' }, requestId);
    await expect(sdk.openApp({ appId: 'other' })).rejects.toMatchObject({
      errorCode: OpenAppErrorCodes.GenericError,
      message: 'x',
    });
  });

  it('неожиданный тип ответа → generic_error', async () => {
    sdk = new AWSDK(config);
    await sdk.init();
    openReply = requestId => deliver(ParentToIframeMessageType.SDK_INIT_OK, {}, requestId);
    await expect(sdk.openApp({ appId: 'other' })).rejects.toMatchObject({ errorCode: OpenAppErrorCodes.GenericError });
  });

  it('ERROR-ответ на openApp не эмитит sdk.error; ERROR без запроса — эмитит', async () => {
    sdk = new AWSDK(config);
    await sdk.init();
    const onError = vi.fn();
    sdk.events.on('sdk.error', onError);
    openReply = requestId => deliver(ParentToIframeMessageType.ERROR, { code: 'blocked', message: 'no' }, requestId);
    await expect(sdk.openApp({ appId: 'other' })).rejects.toBeInstanceOf(AWOpenAppError);
    expect(onError).not.toHaveBeenCalled();
    deliver(ParentToIframeMessageType.ERROR, { code: 'generic_error', message: 'boom' }, 'unsolicited');
    expect(onError).toHaveBeenCalledWith({ code: 'generic_error', message: 'boom' });
  });

  it('старый кошелёк без команды → unsupported, ничего не отправляется', async () => {
    supportedCommands = { init: 1 };
    sdk = new AWSDK(config);
    await sdk.init();
    await expect(sdk.openApp({ appId: 'other', startParam: 'ok' })).rejects.toMatchObject({
      errorCode: OpenAppErrorCodes.Unsupported,
    });
    expect(sent(IframeToParentMessageType.OPEN_APP)).toHaveLength(0);
  });
});
