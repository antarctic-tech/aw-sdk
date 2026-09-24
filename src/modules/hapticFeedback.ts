import type { PostMessageTransport } from '../transport/postMessage';
import {
  type HapticImpactStyle,
  type HapticNotificationType,
  IframeToParentMessageType,
  type TriggerHapticFeedbackPayload,
} from '../types/protocol';
import type { Logger } from '../utils/logger';

/**
 * Тактильный отклик через вибромотор кошелька. Fire-and-forget: ответа нет, старый кошелёк
 * сообщение игнорирует, а кошелёк с выключенной вибрацией ничего не делает.
 * Срабатывает только пока приложение на экране.
 */
export class HapticFeedbackModule {
  constructor(
    private transport: PostMessageTransport,
    private logger: Logger,
  ) {}

  /** Удар: light | medium | heavy | rigid | soft */
  impactOccurred(style: HapticImpactStyle): void {
    this.trigger({ type: 'impact', impact_style: style });
  }

  /** Результат действия: success | warning | error */
  notificationOccurred(type: HapticNotificationType): void {
    this.trigger({ type: 'notification', notification_type: type });
  }

  /** Смена выбора (переключатель, пикер) */
  selectionChanged(): void {
    this.trigger({ type: 'selection_change' });
  }

  private trigger(payload: TriggerHapticFeedbackPayload): void {
    this.logger.log('Haptic:', payload.type);
    this.transport.post<TriggerHapticFeedbackPayload>(IframeToParentMessageType.WEB_APP_TRIGGER_HAPTIC_FEEDBACK, payload);
  }
}
