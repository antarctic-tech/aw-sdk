import type { PostMessageTransport } from '../transport/postMessage';
import { ShareUrlErrorCodes } from '../types/errors';
import {
  IframeToParentMessageType,
  ParentToIframeMessageType,
  type ErrorPayload,
  type ShareUrlOpenedPayload,
  type ShareUrlParams,
  type ShareUrlPayload,
} from '../types/protocol';
import { AWShareUrlError } from '../utils/errors';
import type { Logger } from '../utils/logger';

const MAX_URL_LENGTH = 2048;
const MAX_TITLE_LENGTH = 120;

const KNOWN_CODES = new Set<string>(Object.values(ShareUrlErrorCodes));

/**
 * Системный шит «поделиться» открывает только кошелёк: в Android WebView нет navigator.share.
 * true — шит открыт, false — пользователь его закрыл. Невалидная ссылка на хост не уходит.
 */
export class ShareUrlModule {
  constructor(
    private transport: PostMessageTransport,
    private timeout: number,
    private logger: Logger,
    private isSupported: () => boolean,
  ) {}

  async share(params: ShareUrlParams): Promise<boolean> {
    const payload = toPayload(params);
    if (!this.isSupported()) throw new AWShareUrlError(ShareUrlErrorCodes.Unsupported);

    this.logger.log('ShareUrl');
    const response = await this.transport.sendAndWait<ShareUrlPayload, ShareUrlOpenedPayload | ErrorPayload>(
      IframeToParentMessageType.WEB_APP_SHARE_URL,
      payload,
      this.timeout,
      { maxAttempts: 1, baseDelay: 0 },
    );

    if (response.type === ParentToIframeMessageType.SHARE_URL_OPENED) {
      const status = (response.payload as ShareUrlOpenedPayload | null)?.status;
      if (status === 'opened') return true;
      if (status === 'cancelled') return false;
      throw new AWShareUrlError(ShareUrlErrorCodes.GenericError, `Unexpected status: ${String(status)}`);
    }

    if (response.type === ParentToIframeMessageType.ERROR) {
      const error = response.payload as ErrorPayload;
      const code = KNOWN_CODES.has(error?.code) ? (error.code as ShareUrlErrorCodes) : ShareUrlErrorCodes.GenericError;
      throw new AWShareUrlError(code, error?.message);
    }

    throw new AWShareUrlError(ShareUrlErrorCodes.GenericError, `Unexpected response: ${response.type}`);
  }
}

function toPayload(params: ShareUrlParams): ShareUrlPayload {
  const url = httpUrl(params?.url);
  if (!url) throw new AWShareUrlError(ShareUrlErrorCodes.InvalidParams);

  const title = shareTitle(params?.title);
  return title ? { url, title } : { url };
}

/** Ссылку отдаём обрезанной по краям. Парсер нужен только чтобы проверить схему, href не подставляем. */
function httpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const url = value.trim();
  if (url.length === 0 || url.length > MAX_URL_LENGTH) return null;

  try {
    const protocol = new URL(url).protocol;
    return protocol === 'http:' || protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

function shareTitle(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'string') throw new AWShareUrlError(ShareUrlErrorCodes.InvalidParams);

  const title = value.trim();
  if (title.length === 0) return undefined;
  return title.length <= MAX_TITLE_LENGTH ? title : title.slice(0, MAX_TITLE_LENGTH);
}
