import type { PostMessageTransport } from '../transport/postMessage';
import {
  IframeToParentMessageType,
  ParentToIframeMessageType,
  type ErrorPayload,
  type OpenScanQrPayload,
  type QrTextReceivedPayload,
} from '../types/protocol';
import { ScanQrErrorCodes } from '../types/errors';
import { AWScanQrError } from '../utils/errors';
import type { Logger } from '../utils/logger';

// Пользователь может держать сканер открытым долго — ждём без ретраев
const SCAN_TIMEOUT_MS = 10 * 60 * 1000;

const KNOWN_CODES = new Set<string>(Object.values(ScanQrErrorCodes));

/**
 * QR-сканер хоста. Камера и распознавание — на стороне кошелька, приложение получает
 * только распознанную строку. Один запрос — один результат, после чего сканер закрыт.
 */
export class ScanQrModule {
  private pending = false;

  constructor(
    private transport: PostMessageTransport,
    private logger: Logger,
    private isSupported: () => boolean,
  ) {}

  get isOpen(): boolean {
    return this.pending;
  }

  async open(): Promise<string> {
    if (!this.isSupported()) throw new AWScanQrError(ScanQrErrorCodes.Unsupported);
    if (this.pending) throw new AWScanQrError(ScanQrErrorCodes.AlreadyOpen);

    this.pending = true;
    this.logger.log('ScanQr: открываем сканер хоста');
    try {
      const response = await this.transport.sendAndWait<OpenScanQrPayload, QrTextReceivedPayload | ErrorPayload>(
        IframeToParentMessageType.WEB_APP_OPEN_SCAN_QR,
        {},
        SCAN_TIMEOUT_MS,
        { maxAttempts: 1, baseDelay: 0 },
      );

      if (response.type === ParentToIframeMessageType.QR_TEXT_RECEIVED) {
        const { data } = response.payload as QrTextReceivedPayload;
        if (typeof data !== 'string') throw new AWScanQrError(ScanQrErrorCodes.GenericError);
        return data;
      }
      if (response.type === ParentToIframeMessageType.SCAN_QR_CLOSED) {
        throw new AWScanQrError(ScanQrErrorCodes.Closed);
      }

      const error = response.payload as ErrorPayload;
      const code = KNOWN_CODES.has(error?.code) ? (error.code as ScanQrErrorCodes) : ScanQrErrorCodes.GenericError;
      throw new AWScanQrError(code, error?.message);
    } finally {
      this.pending = false;
    }
  }
}
