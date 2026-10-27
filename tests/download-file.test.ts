import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AWDownloadFileError,
  AWSDK,
  DownloadFileErrorCodes,
  IframeToParentMessageType,
  ParentToIframeMessageType,
} from '../src/index';
import type { AWMessage } from '../src/types/protocol';

const parentOrigin = 'https://wallet.example';
const config = { appId: 'app-1', parentOrigin, scopes: [], timeout: 100, retry: { maxAttempts: 1 } };
const file = { url: 'https://files.example/logs.csv', fileName: 'webhook-logs.csv' };

type Browser = EventTarget & { location: { search: string; origin: string }; parent: { postMessage: ReturnType<typeof vi.fn> } };

let browser: Browser;
let sdk: AWSDK | undefined;
let supportedCommands: Record<string, number>;
let downloadReply: ((requestId: string) => void) | undefined;

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
  supportedCommands = { init: 1, web_app_request_file_download: 1 };
  downloadReply = undefined;
  vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  vi.stubGlobal('document', { documentElement: { style: { setProperty: () => {}, removeProperty: () => {} } } });
  browser = Object.assign(new EventTarget(), {
    location: { search: '', origin: 'https://mini.example' },
    parent: { postMessage: vi.fn((message: AWMessage) => {
      queueMicrotask(() => {
        if (message.type === IframeToParentMessageType.WEB_APP_REQUEST_FILE_DOWNLOAD) {
          downloadReply?.(message.requestId);
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

describe('sdk.downloadFile', () => {
  it('sends web_app_request_file_download with a Telegram-style payload and resolves true on downloading', async () => {
    sdk = new AWSDK(config);
    await sdk.init();
    downloadReply = requestId => deliver(ParentToIframeMessageType.FILE_DOWNLOAD_REQUESTED, { status: 'downloading' }, requestId);
    await expect(sdk.downloadFile(file)).resolves.toBe(true);
    const [message] = sent(IframeToParentMessageType.WEB_APP_REQUEST_FILE_DOWNLOAD);
    expect(message.payload).toEqual({ url: 'https://files.example/logs.csv', file_name: 'webhook-logs.csv' });
  });

  it('cancelled — the user declined → false', async () => {
    sdk = new AWSDK(config);
    await sdk.init();
    downloadReply = requestId => deliver(ParentToIframeMessageType.FILE_DOWNLOAD_REQUESTED, { status: 'cancelled' }, requestId);
    await expect(sdk.downloadFile(file)).resolves.toBe(false);
  });

  it('unknown status → generic_error', async () => {
    sdk = new AWSDK(config);
    await sdk.init();
    downloadReply = requestId => deliver(ParentToIframeMessageType.FILE_DOWNLOAD_REQUESTED, { status: 'weird' }, requestId);
    await expect(sdk.downloadFile(file)).rejects.toMatchObject({ errorCode: DownloadFileErrorCodes.GenericError });
  });

  it('host ERROR with a known code is passed through, an unknown one → generic_error', async () => {
    sdk = new AWSDK(config);
    await sdk.init();
    downloadReply = requestId => deliver(ParentToIframeMessageType.ERROR, { code: 'not_active', message: 'no' }, requestId);
    await expect(sdk.downloadFile(file)).rejects.toMatchObject({ errorCode: DownloadFileErrorCodes.NotActive, message: 'no' });
    downloadReply = requestId => deliver(ParentToIframeMessageType.ERROR, { code: 'weird', message: 'x' }, requestId);
    await expect(sdk.downloadFile(file)).rejects.toMatchObject({ errorCode: DownloadFileErrorCodes.GenericError });
  });

  it('ERROR reply to downloadFile does not emit sdk.error', async () => {
    sdk = new AWSDK(config);
    await sdk.init();
    const onError = vi.fn();
    sdk.events.on('sdk.error', onError);
    downloadReply = requestId => deliver(ParentToIframeMessageType.ERROR, { code: 'invalid_download_params', message: 'no' }, requestId);
    await expect(sdk.downloadFile(file)).rejects.toMatchObject({ errorCode: DownloadFileErrorCodes.InvalidParams });
    expect(onError).not.toHaveBeenCalled();
  });

  it.each([
    ['http URL', { url: 'http://files.example/logs.csv', fileName: 'a.csv' }],
    ['blob URL', { url: 'blob:https://mini.example/1', fileName: 'a.csv' }],
    ['not a URL', { url: 'logs.csv', fileName: 'a.csv' }],
    ['empty file name', { url: 'https://files.example/logs.csv', fileName: '   ' }],
    ['non-string values', { url: 1, fileName: null }],
  ])('%s → invalid_download_params, nothing is sent to the host', async (_name, params) => {
    sdk = new AWSDK(config);
    await sdk.init();
    await expect(sdk.downloadFile(params as never)).rejects.toMatchObject({ errorCode: DownloadFileErrorCodes.InvalidParams });
    expect(sent(IframeToParentMessageType.WEB_APP_REQUEST_FILE_DOWNLOAD)).toHaveLength(0);
  });

  it.each([
    ['presigned URL', 'https://bucket.s3.amazonaws.com/foo/bar.csv?X-Amz-Signature=abc%2Fdef&X-Amz-Expires=300'],
    ['explicit default port', 'https://example.com:443/a.csv'],
    ['upper-case host', 'https://Files.Example.com/a.csv'],
    ['bare origin', 'https://files.example'],
    ['query without a path', 'https://files.example?id=1'],
  ])('%s is sent byte for byte, not as the parser serialization', async (_name, url) => {
    sdk = new AWSDK(config);
    await sdk.init();
    downloadReply = requestId => deliver(ParentToIframeMessageType.FILE_DOWNLOAD_REQUESTED, { status: 'downloading' }, requestId);
    await sdk.downloadFile({ url: `  ${url}  `, fileName: 'a.csv' });
    const [message] = sent(IframeToParentMessageType.WEB_APP_REQUEST_FILE_DOWNLOAD);
    expect(message.payload).toMatchObject({ url });
  });

  it.each([
    ['dot segments', 'https://bucket.s3.amazonaws.com/foo/../bar.csv?X-Amz-Signature=abc'],
    ['single dot segment', 'https://files.example/./a.csv'],
    ['backslash in the path', 'https://files.example/a\\b.csv'],
    ['backslash after the host', 'https://files.example\\a.csv'],
    ['unencoded space', 'https://files.example/a b.csv'],
    ['tab inside', 'https://files.example/a\tb.csv'],
    ['no slashes after the scheme', 'https:files.example/a.csv'],
  ])('%s changes after normalization → invalid_download_params, nothing is sent', async (_name, url) => {
    sdk = new AWSDK(config);
    await sdk.init();
    await expect(sdk.downloadFile({ url, fileName: 'a.csv' })).rejects.toMatchObject({
      errorCode: DownloadFileErrorCodes.InvalidParams,
    });
    expect(sent(IframeToParentMessageType.WEB_APP_REQUEST_FILE_DOWNLOAD)).toHaveLength(0);
  });

  it('file name is trimmed', async () => {
    sdk = new AWSDK(config);
    await sdk.init();
    downloadReply = requestId => deliver(ParentToIframeMessageType.FILE_DOWNLOAD_REQUESTED, { status: 'downloading' }, requestId);
    await sdk.downloadFile({ url: file.url, fileName: '  logs.csv  ' });
    const [message] = sent(IframeToParentMessageType.WEB_APP_REQUEST_FILE_DOWNLOAD);
    expect(message.payload).toMatchObject({ file_name: 'logs.csv' });
  });

  it('no reply from the wallet → AWDownloadFileError(generic_error), not a transport timeout', async () => {
    sdk = new AWSDK(config);
    await sdk.init();
    vi.useFakeTimers();
    try {
      const download = sdk.downloadFile(file);
      const assertion = expect(download).rejects.toMatchObject({
        name: 'AWDownloadFileError',
        errorCode: DownloadFileErrorCodes.GenericError,
      });
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000 + 1);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('destroy() rejects a pending call with a plain AWSDKError', async () => {
    sdk = new AWSDK(config);
    await sdk.init();
    const download = sdk.downloadFile(file);
    await new Promise(resolve => setTimeout(resolve, 0));
    sdk.destroy();
    sdk = undefined;
    const error = await download.catch((reason: unknown) => reason);
    expect(error).toMatchObject({ name: 'AWSDKError', message: 'Transport destroyed' });
    expect(error).not.toBeInstanceOf(AWDownloadFileError);
  });

  it('older wallet without the command → unsupported, nothing is sent', async () => {
    supportedCommands = { init: 1 };
    sdk = new AWSDK(config);
    await sdk.init();
    await expect(sdk.downloadFile(file)).rejects.toBeInstanceOf(AWDownloadFileError);
    await expect(sdk.downloadFile(file)).rejects.toMatchObject({ errorCode: DownloadFileErrorCodes.Unsupported });
    expect(sent(IframeToParentMessageType.WEB_APP_REQUEST_FILE_DOWNLOAD)).toHaveLength(0);
  });
});
