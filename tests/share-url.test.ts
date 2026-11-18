import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AWCommand,
  AWSDK,
  AWSDKError,
  AWShareUrlError,
  AWTimeoutError,
  IframeToParentMessageType,
  ParentToIframeMessageType,
  ShareUrlErrorCodes,
} from '../src/index';
import type { AWMessage } from '../src/types/protocol';

const parentOrigin = 'https://wallet.example';
const config = { appId: 'app-1', parentOrigin, scopes: [], timeout: 100, retry: { maxAttempts: 1 } };
const link = { url: 'https://cashback.example/r/42', title: 'Cashback' };

type Browser = EventTarget & { location: { search: string; origin: string }; parent: { postMessage: ReturnType<typeof vi.fn> } };

let browser: Browser;
let sdk: AWSDK | undefined;
let supportedCommands: Record<string, number>;
let shareReply: ((requestId: string) => void) | undefined;

function deliver(type: ParentToIframeMessageType, payload: unknown, requestId: string) {
  browser.dispatchEvent(new MessageEvent('message', {
    origin: parentOrigin,
    data: { type, payload, appId: config.appId, requestId, version: '1.0', timestamp: Date.now() },
  }));
}

function sent(type: string): AWMessage[] {
  return browser.parent.postMessage.mock.calls.map(([message]) => message as AWMessage).filter(message => message.type === type);
}

function urlOf(length: number): string {
  const prefix = 'https://example.com/';
  return prefix + 'a'.repeat(length - prefix.length);
}

beforeEach(() => {
  supportedCommands = { init: 1, web_app_share_url: 1 };
  shareReply = undefined;
  vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  vi.stubGlobal('document', { documentElement: { style: { setProperty: () => {}, removeProperty: () => {} } } });
  browser = Object.assign(new EventTarget(), {
    location: { search: '', origin: 'https://mini.example' },
    parent: { postMessage: vi.fn((message: AWMessage) => {
      queueMicrotask(() => {
        if (message.type === IframeToParentMessageType.WEB_APP_SHARE_URL) {
          shareReply?.(message.requestId);
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
  vi.useRealTimers();
});

describe('sdk.shareUrl', () => {
  it('sends the SDK envelope and resolves true when the host opens the sheet', async () => {
    sdk = new AWSDK(config);
    await sdk.init();
    shareReply = requestId => deliver(ParentToIframeMessageType.SHARE_URL_OPENED, { status: 'opened' }, requestId);

    await expect(sdk.shareUrl({ url: `  ${link.url}  `, title: '  Cashback  ' })).resolves.toBe(true);

    const [message] = sent(IframeToParentMessageType.WEB_APP_SHARE_URL);
    expect(message.type).toBe('web_app_share_url');
    expect(message.payload).toEqual({ url: link.url, title: 'Cashback' });
    expect(message.version).toBe('1.0');
    expect(message.appId).toBe(config.appId);
    expect(message.requestId).toEqual(expect.any(String));
    expect(message.requestId.length).toBeGreaterThan(0);
    expect(message.timestamp).toEqual(expect.any(Number));
    expect(AWCommand.ShareUrl).toBe('web_app_share_url');
    expect(ParentToIframeMessageType.SHARE_URL_OPENED).toBe('share_url_opened');
  });

  it('keeps the trimmed url as typed and omits an empty title', async () => {
    sdk = new AWSDK(config);
    await sdk.init();
    shareReply = requestId => deliver(ParentToIframeMessageType.SHARE_URL_OPENED, { status: 'opened' }, requestId);

    await sdk.shareUrl({ url: '  HTTPS://Example.com/a  ', title: '   ' });

    const [message] = sent(IframeToParentMessageType.WEB_APP_SHARE_URL);
    expect(message.payload).toEqual({ url: 'HTTPS://Example.com/a' });
  });

  it('accepts http and clips the title to 120 characters', async () => {
    sdk = new AWSDK(config);
    await sdk.init();
    shareReply = requestId => deliver(ParentToIframeMessageType.SHARE_URL_OPENED, { status: 'opened' }, requestId);

    await sdk.shareUrl({ url: ' http://example.com/a ', title: 'й'.repeat(121) });

    const [message] = sent(IframeToParentMessageType.WEB_APP_SHARE_URL);
    expect(message.payload).toEqual({ url: 'http://example.com/a', title: 'й'.repeat(120) });
  });

  it('cancelled — the user closed the sheet → false, not a throw', async () => {
    sdk = new AWSDK(config);
    await sdk.init();
    shareReply = requestId => deliver(ParentToIframeMessageType.SHARE_URL_OPENED, { status: 'cancelled' }, requestId);

    await expect(sdk.shareUrl(link)).resolves.toBe(false);
  });

  it('does not resolve on share_url_opened with another requestId', async () => {
    sdk = new AWSDK(config);
    await sdk.init();
    vi.useFakeTimers();
    const sharing = sdk.shareUrl(link);
    deliver(ParentToIframeMessageType.SHARE_URL_OPENED, { status: 'opened' }, 'other');
    const assertion = expect(sharing).rejects.toBeInstanceOf(AWTimeoutError);
    await vi.advanceTimersByTimeAsync(101);
    await assertion;
  });

  it('unknown status → generic_error', async () => {
    sdk = new AWSDK(config);
    await sdk.init();
    shareReply = requestId => deliver(ParentToIframeMessageType.SHARE_URL_OPENED, { status: 'weird' }, requestId);
    await expect(sdk.shareUrl(link)).rejects.toMatchObject({ errorCode: ShareUrlErrorCodes.GenericError });
  });

  it('host ERROR with a known code is passed through, an unknown one → generic_error', async () => {
    sdk = new AWSDK(config);
    await sdk.init();
    shareReply = requestId => deliver(ParentToIframeMessageType.ERROR, { code: 'not_active', message: 'no' }, requestId);
    await expect(sdk.shareUrl(link)).rejects.toMatchObject({ errorCode: ShareUrlErrorCodes.NotActive, message: 'no' });
    shareReply = requestId => deliver(ParentToIframeMessageType.ERROR, { code: 'weird', message: 'x' }, requestId);
    await expect(sdk.shareUrl(link)).rejects.toMatchObject({ errorCode: ShareUrlErrorCodes.GenericError });
  });

  it('ERROR reply to shareUrl does not emit sdk.error', async () => {
    sdk = new AWSDK(config);
    await sdk.init();
    const onError = vi.fn();
    sdk.events.on('sdk.error', onError);
    shareReply = requestId => deliver(ParentToIframeMessageType.ERROR, { code: 'not_active', message: 'no' }, requestId);
    await expect(sdk.shareUrl(link)).rejects.toBeInstanceOf(AWShareUrlError);
    expect(onError).not.toHaveBeenCalled();
  });

  it.each([
    ['javascript URL', { url: 'javascript:alert(1)' }],
    ['data URL', { url: 'data:text/plain,hi' }],
    ['not a URL', { url: 'cashback' }],
    ['empty url', { url: '   ' }],
    ['url longer than 2048', { url: ` ${urlOf(2049)} ` }],
    ['non-string url', { url: 1 }],
    ['non-string title', { url: link.url, title: 1 }],
  ])('%s → invalid_share_params, nothing is sent', async (_name, params) => {
    sdk = new AWSDK(config);
    await sdk.init();
    await expect(sdk.shareUrl(params as never)).rejects.toMatchObject({ errorCode: ShareUrlErrorCodes.InvalidParams });
    expect(sent(IframeToParentMessageType.WEB_APP_SHARE_URL)).toHaveLength(0);
  });

  it('sends a url of exactly 2048 characters', async () => {
    sdk = new AWSDK(config);
    await sdk.init();
    shareReply = requestId => deliver(ParentToIframeMessageType.SHARE_URL_OPENED, { status: 'opened' }, requestId);
    const url = urlOf(2048);
    await sdk.shareUrl({ url: ` ${url} ` });
    const [message] = sent(IframeToParentMessageType.WEB_APP_SHARE_URL);
    expect(message.payload).toEqual({ url });
  });

  it('no reply → AWTimeoutError after the configured timeout, without a retry', async () => {
    sdk = new AWSDK({ ...config, retry: { maxAttempts: 3, baseDelay: 50 } });
    await sdk.init();
    vi.useFakeTimers();
    const sharing = sdk.shareUrl(link);
    const assertion = expect(sharing).rejects.toBeInstanceOf(AWTimeoutError);
    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;
    expect(sent(IframeToParentMessageType.WEB_APP_SHARE_URL)).toHaveLength(1);
  });

  it('destroy() rejects a pending call with a plain AWSDKError', async () => {
    sdk = new AWSDK(config);
    await sdk.init();
    const sharing = sdk.shareUrl(link);
    await new Promise(resolve => setTimeout(resolve, 0));
    sdk.destroy();
    sdk = undefined;
    const error = await sharing.catch((reason: unknown) => reason);
    expect(error).toMatchObject({ name: 'AWSDKError', message: 'Transport destroyed' });
    expect(error).toBeInstanceOf(AWSDKError);
    expect(error).not.toBeInstanceOf(AWShareUrlError);
  });

  it('older wallet without the command still inits, shareUrl is unavailable and sends nothing', async () => {
    supportedCommands = { init: 1 };
    sdk = new AWSDK(config);
    await sdk.init();
    expect(sdk.isCommandAvailable(AWCommand.ShareUrl)).toBe(false);
    await expect(sdk.shareUrl(link)).rejects.toMatchObject({ errorCode: ShareUrlErrorCodes.Unsupported });
    expect(sent(IframeToParentMessageType.WEB_APP_SHARE_URL)).toHaveLength(0);
  });

  it('host version 0 is not enough', async () => {
    supportedCommands = { init: 1, web_app_share_url: 0 };
    sdk = new AWSDK(config);
    await sdk.init();
    expect(sdk.isCommandAvailable(AWCommand.ShareUrl)).toBe(false);
    await expect(sdk.shareUrl(link)).rejects.toMatchObject({ errorCode: ShareUrlErrorCodes.Unsupported });
  });
});
