import type { PostMessageTransport } from '../transport/postMessage';
import { OpenAppErrorCodes } from '../types/errors';
import {
  IframeToParentMessageType,
  ParentToIframeMessageType,
  type ErrorPayload,
  type OpenAppParams,
  type OpenAppPayload,
} from '../types/protocol';
import { AWOpenAppError } from '../utils/errors';
import type { Logger } from '../utils/logger';
import { START_PARAM } from '../utils/startParam';

const KNOWN_CODES = new Set<string>(Object.values(OpenAppErrorCodes));

/**
 * Открытие другой мини-апки. Стек, частота и soft-add — на хосте.
 * Невалидные аргументы отсекаются здесь и на хост не уходят.
 */
export class OpenAppModule {
  constructor(
    private transport: PostMessageTransport,
    private timeout: number,
    private logger: Logger,
    private currentAppId: string,
    private isSupported: () => boolean,
  ) {}

  async open(params: OpenAppParams): Promise<void> {
    const payload = toPayload(params, this.currentAppId);
    if (!this.isSupported()) throw new AWOpenAppError(OpenAppErrorCodes.Unsupported);

    this.logger.log('OpenApp:', payload.appId);
    const response = await this.transport.sendAndWait<OpenAppPayload, ErrorPayload>(
      IframeToParentMessageType.OPEN_APP,
      payload,
      this.timeout,
      { maxAttempts: 1, baseDelay: 0 },
    );

    if (response.type === ParentToIframeMessageType.OPEN_APP_OK) return;

    if (response.type === ParentToIframeMessageType.ERROR) {
      const error = response.payload as ErrorPayload;
      const code = KNOWN_CODES.has(error?.code) ? (error.code as OpenAppErrorCodes) : OpenAppErrorCodes.GenericError;
      throw new AWOpenAppError(code, error?.message);
    }

    throw new AWOpenAppError(OpenAppErrorCodes.GenericError, `Unexpected response: ${response.type}`);
  }
}

function toPayload(params: OpenAppParams, currentAppId: string): OpenAppPayload {
  if (typeof params?.appId !== 'string') {
    throw new AWOpenAppError(OpenAppErrorCodes.InvalidAppId);
  }
  const appId = params.appId.trim();
  if (appId.length === 0) {
    throw new AWOpenAppError(OpenAppErrorCodes.InvalidAppId);
  }
  if (appId === currentAppId) {
    throw new AWOpenAppError(OpenAppErrorCodes.SameApp);
  }

  const { startParam, fullscreen } = params;
  if (startParam != null && startParam !== '' && (typeof startParam !== 'string' || !START_PARAM.test(startParam))) {
    throw new AWOpenAppError(OpenAppErrorCodes.InvalidStartParam);
  }
  if (fullscreen !== undefined && typeof fullscreen !== 'boolean') {
    throw new AWOpenAppError(OpenAppErrorCodes.InvalidFullscreen);
  }

  return {
    appId,
    ...(typeof startParam === 'string' && startParam !== '' ? { startParam } : {}),
    ...(typeof fullscreen === 'boolean' ? { fullscreen } : {}),
  };
}
