import type { PostMessageTransport } from '../transport/postMessage';
import type { AWSession } from '../types/session';
import {
  IframeToParentMessageType,
  ParentToIframeMessageType,
  type SdkInitPayload,
  type SdkInitOkPayload,
  type SdkInitFailPayload,
} from '../types/protocol';
import { InitErrorCodes } from '../types/errors';
import { SDK_VERSION } from '../utils/version';
import { AWInitError } from '../utils/errors';
import type { RetryConfig } from '../utils/retry';
import type { Logger } from '../utils/logger';

/**
 * Результат хэндшейка — сессия + supportedCommands
 */
export interface HandshakeResult {
  session: AWSession;
  supportedCommands?: Record<string, number>;
}

/**
 * Модуль хэндшейка — обрабатывает SDK_INIT → SDK_INIT_OK/SDK_INIT_FAIL
 */
export async function performHandshake(
  transport: PostMessageTransport,
  appId: string,
  scopes: string[],
  timeout: number,
  logger: Logger,
  retry?: RetryConfig,
): Promise<HandshakeResult> {
  const payload: SdkInitPayload = {
    appId,
    origin: window.location.origin,
    sdkVersion: SDK_VERSION,
    requestedScopes: scopes,
  };

  logger.log('Хэндшейк начат, ожидание ответа...');

  const response = await transport.sendAndWait<SdkInitPayload, SdkInitOkPayload | SdkInitFailPayload>(
    IframeToParentMessageType.SDK_INIT,
    payload,
    timeout,
    retry,
  );

  if (response.type === ParentToIframeMessageType.SDK_INIT_OK) {
    const ok = response.payload as SdkInitOkPayload;
    logger.log('Хэндшейк успешен, скоупы:', ok.grantedScopes);
    return {
      session: {
        sessionToken: ok.sessionToken,
        grantedScopes: ok.grantedScopes,
        userContext: ok.userContext ?? {},
        expiresAt: ok.expiresAt,
      },
      supportedCommands: ok.supportedCommands,
    };
  }

  if (response.type === ParentToIframeMessageType.SDK_INIT_FAIL) {
    const fail = response.payload as SdkInitFailPayload;
    throw new AWInitError(
      (fail.code as InitErrorCodes) || InitErrorCodes.GenericError,
      fail.message,
    );
  }

  throw new AWInitError(InitErrorCodes.GenericError, `Unexpected response type: ${response.type}`);
}
