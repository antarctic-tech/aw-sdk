import type { PostMessageTransport } from '../transport/postMessage';
import { DownloadFileErrorCodes } from '../types/errors';
import {
  IframeToParentMessageType,
  ParentToIframeMessageType,
  type DownloadFileParams,
  type ErrorPayload,
  type FileDownloadRequestedPayload,
  type RequestFileDownloadPayload,
} from '../types/protocol';
import { AWDownloadFileError, AWTimeoutError } from '../utils/errors';
import type { Logger } from '../utils/logger';

// В Telegram кошелёк показывает диалог подтверждения — пользователь может думать долго
const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;

const KNOWN_CODES = new Set<string>(Object.values(DownloadFileErrorCodes));

/**
 * Скачивание файла средствами кошелька. Из iframe / WebView приложение само скачать не может:
 * в Telegram это умеет только Telegram, в мобильном приложении — системный браузер.
 * Файл должен лежать по https-ссылке: blob- и data-ссылки кошелёк не скачает.
 */
export class DownloadFileModule {
  constructor(
    private transport: PostMessageTransport,
    private logger: Logger,
    private isSupported: () => boolean,
  ) {}

  /** true — скачивание началось, false — пользователь отказался в диалоге кошелька */
  async download(params: DownloadFileParams): Promise<boolean> {
    const payload = toPayload(params);
    if (!this.isSupported()) throw new AWDownloadFileError(DownloadFileErrorCodes.Unsupported);

    this.logger.log('DownloadFile:', payload.file_name);
    const response = await this.transport
      .sendAndWait<RequestFileDownloadPayload, FileDownloadRequestedPayload | ErrorPayload>(
        IframeToParentMessageType.WEB_APP_REQUEST_FILE_DOWNLOAD,
        payload,
        DOWNLOAD_TIMEOUT_MS,
        { maxAttempts: 1, baseDelay: 0 },
      )
      .catch((error: unknown) => {
        // Кошелёк так и не ответил — для приложения это та же ошибка скачивания, а не таймаут транспорта
        if (error instanceof AWTimeoutError) {
          throw new AWDownloadFileError(DownloadFileErrorCodes.GenericError, 'The wallet did not answer in time.');
        }
        throw error;
      });

    if (response.type === ParentToIframeMessageType.FILE_DOWNLOAD_REQUESTED) {
      const { status } = response.payload as FileDownloadRequestedPayload;
      if (status === 'downloading') return true;
      if (status === 'cancelled') return false;
      throw new AWDownloadFileError(DownloadFileErrorCodes.GenericError, `Unexpected status: ${String(status)}`);
    }

    if (response.type === ParentToIframeMessageType.ERROR) {
      const error = response.payload as ErrorPayload;
      const code = KNOWN_CODES.has(error?.code) ? (error.code as DownloadFileErrorCodes) : DownloadFileErrorCodes.GenericError;
      throw new AWDownloadFileError(code, error?.message);
    }

    throw new AWDownloadFileError(DownloadFileErrorCodes.GenericError, `Unexpected response: ${response.type}`);
  }
}

function toPayload(params: DownloadFileParams): RequestFileDownloadPayload {
  const url = typeof params?.url === 'string' ? toHttpsUrl(params.url) : null;
  const fileName = typeof params?.fileName === 'string' ? params.fileName.trim() : '';

  if (!url || fileName.length === 0) {
    throw new AWDownloadFileError(DownloadFileErrorCodes.InvalidParams);
  }

  return { url, file_name: fileName };
}

// Хвост ссылки после хоста как он есть: путь, query и hash до разбора парсером
const RAW_TAIL = /^https:\/\/[^/?#\\]*(.*)$/is;

/**
 * Ссылку отдаём хосту исходной строкой: сериализация парсера меняет байты
 * (схлопывает `..`, убирает `:443`, `\` → `/`), и у presigned-ссылки ломается подпись.
 * Если нормализация меняет путь, query или hash — отклоняем: проверили бы одно, а скачали другое.
 */
function toHttpsUrl(value: string): string | null {
  const raw = value.trim();
  const tail = RAW_TAIL.exec(raw)?.[1];
  if (tail === undefined) return null;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;

  const normalizedTail = parsed.pathname + parsed.search + parsed.hash;
  // Без пути парсер дописывает «/» — путь от этого не меняется
  const isSameTail = tail === normalizedTail || `/${tail}` === normalizedTail;

  return isSameTail ? raw : null;
}
