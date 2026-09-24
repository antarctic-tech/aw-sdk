import type { PostMessageTransport } from '../transport/postMessage';
import { IframeToParentMessageType, type SetBackgroundColorPayload } from '../types/protocol';
import { normalizeHexColor } from '../utils/color';
import type { Logger } from '../utils/logger';

/**
 * Цвет фона под страницей приложения. Кошелёк красит им контейнер: при оверскролле
 * на iOS не виден тон кошелька. Fire-and-forget: ответа нет,
 * старый кошелёк сообщение игнорирует.
 */
export class BackgroundModule {
  private color: string | undefined;

  constructor(
    private transport: PostMessageTransport,
    private logger: Logger,
  ) {}

  /** Последний принятый цвет (#rrggbb) */
  get backgroundColor(): string | undefined {
    return this.color;
  }

  /** Принимает #rgb | #rrggbb; невалидный цвет не отправляется — возвращает false */
  setBackgroundColor(color: string): boolean {
    const normalized = normalizeHexColor(color);
    if (!normalized) {
      this.logger.warn('setBackgroundColor: ожидается #rgb или #rrggbb, получено', color);
      return false;
    }
    this.color = normalized;
    this.logger.log('Background color:', normalized);
    this.transport.post<SetBackgroundColorPayload>(IframeToParentMessageType.WEB_APP_SET_BACKGROUND_COLOR, {
      color: normalized,
    });
    return true;
  }

  reset(): void {
    this.color = undefined;
  }
}
