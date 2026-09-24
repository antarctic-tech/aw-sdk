import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AWSDK, AWScanQrError, IframeToParentMessageType, ParentToIframeMessageType, ScanQrErrorCodes } from '../src/index';
import type { AWMessage } from '../src/types/protocol';

const parentOrigin = 'https://wallet.example';
const config = { appId: 'app-1', parentOrigin, scopes: [], timeout: 100, retry: { maxAttempts: 1 } };

type Browser = EventTarget & { location: { search: string; origin: string }; parent: { postMessage: ReturnType<typeof vi.fn> } };

let browser: Browser;
let sdk: AWSDK | undefined;
let supportedCommands: Record<string, number>;
let scanReply: ((requestId: string) => void) | undefined;

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
  supportedCommands = { init: 1, web_app_open_scan_qr: 1 };
  scanReply = undefined;
  vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  vi.stubGlobal('document', { documentElement: { style: { setProperty: () => {}, removeProperty: () => {} } } });
  browser = Object.assign(new EventTarget(), {
    location: { search: '', origin: 'https://mini.example' },
    parent: { postMessage: vi.fn((message: AWMessage) => {
      queueMicrotask(() => {
        if (message.type === IframeToParentMessageType.WEB_APP_OPEN_SCAN_QR) {
          scanReply?.(message.requestId);
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

describe('sdk.scanQr', () => {
  it('шлёт web_app_open_scan_qr с пустым payload и резолвится строкой из qr_text_received', async () => {
    sdk = new AWSDK(config);
    await sdk.init();
    scanReply = requestId => deliver(ParentToIframeMessageType.QR_TEXT_RECEIVED, { data: 'TAddress123' }, requestId);
    await expect(sdk.scanQr()).resolves.toBe('TAddress123');
    const [message] = sent(IframeToParentMessageType.WEB_APP_OPEN_SCAN_QR);
    expect(message.payload).toEqual({});
  });

  it('scan_qr_closed → AWScanQrError(closed)', async () => {
    sdk = new AWSDK(config);
    await sdk.init();
    scanReply = requestId => deliver(ParentToIframeMessageType.SCAN_QR_CLOSED, {}, requestId);
    await expect(sdk.scanQr()).rejects.toMatchObject({ errorCode: ScanQrErrorCodes.Closed });
  });

  it('ERROR от хоста с известным кодом пробрасывается как есть, неизвестный → generic_error', async () => {
    sdk = new AWSDK(config);
    await sdk.init();
    scanReply = requestId => deliver(ParentToIframeMessageType.ERROR, { code: 'not_active', message: 'no' }, requestId);
    await expect(sdk.scanQr()).rejects.toMatchObject({ errorCode: ScanQrErrorCodes.NotActive, message: 'no' });
    scanReply = requestId => deliver(ParentToIframeMessageType.ERROR, { code: 'weird', message: 'x' }, requestId);
    await expect(sdk.scanQr()).rejects.toMatchObject({ errorCode: ScanQrErrorCodes.GenericError });
  });

  it('ERROR-ответ на scanQr не эмитит sdk.error; ERROR без запроса — эмитит', async () => {
    sdk = new AWSDK(config);
    await sdk.init();
    const onError = vi.fn();
    sdk.events.on('sdk.error', onError);
    scanReply = requestId => deliver(ParentToIframeMessageType.ERROR, { code: 'camera_denied', message: 'no' }, requestId);
    await expect(sdk.scanQr()).rejects.toMatchObject({ errorCode: ScanQrErrorCodes.CameraDenied });
    expect(onError).not.toHaveBeenCalled();
    deliver(ParentToIframeMessageType.ERROR, { code: 'generic_error', message: 'boom' }, 'unsolicited');
    expect(onError).toHaveBeenCalledWith({ code: 'generic_error', message: 'boom' });
  });

  it('второй вызов при открытом сканере → already_open, после ответа можно снова', async () => {
    sdk = new AWSDK(config);
    await sdk.init();
    let release: ((requestId: string) => void) | undefined;
    scanReply = requestId => { release = () => deliver(ParentToIframeMessageType.QR_TEXT_RECEIVED, { data: 'a' }, requestId); };
    const first = sdk.scanQr();
    await new Promise(resolve => setTimeout(resolve, 0));
    await expect(sdk.scanQr()).rejects.toMatchObject({ errorCode: ScanQrErrorCodes.AlreadyOpen });
    release?.('');
    await expect(first).resolves.toBe('a');
    scanReply = requestId => deliver(ParentToIframeMessageType.QR_TEXT_RECEIVED, { data: 'b' }, requestId);
    await expect(sdk.scanQr()).resolves.toBe('b');
  });

  it('старый кошелёк без команды → unsupported, ничего не отправляется', async () => {
    supportedCommands = { init: 1 };
    sdk = new AWSDK(config);
    await sdk.init();
    await expect(sdk.scanQr()).rejects.toBeInstanceOf(AWScanQrError);
    await expect(sdk.scanQr()).rejects.toMatchObject({ errorCode: ScanQrErrorCodes.Unsupported });
    expect(sent(IframeToParentMessageType.WEB_APP_OPEN_SCAN_QR)).toHaveLength(0);
  });
});
