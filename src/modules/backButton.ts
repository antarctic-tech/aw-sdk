import type { PostMessageTransport } from '../transport/postMessage';
import { IframeToParentMessageType, type SetupBackButtonPayload } from '../types/protocol';
import type { Logger } from '../utils/logger';

type BackButtonClickHandler = () => void;

/**
 * Управление кнопкой «Назад» в chrome контейнера AW.
 *
 * `show()` просит хост показать стрелку «Назад» вместо «Закрыть», `hide()` возвращает
 * «Закрыть». Нажатие стрелки хост доставляет событием `back_button_pressed` — SDK вызывает
 * зарегистрированные через `onClick` хендлеры (и эмитит событие `backButton`), сам хост
 * навигацию не выполняет и контейнер не закрывает.
 */
export class BackButtonModule {
  private transport: PostMessageTransport;
  private logger: Logger;
  private visible = false;
  private clickHandlers = new Set<BackButtonClickHandler>();

  constructor(transport: PostMessageTransport, logger: Logger) {
    this.transport = transport;
    this.logger = logger;
  }

  /**
   * Текущее состояние видимости кнопки «Назад»
   */
  get isVisible(): boolean {
    return this.visible;
  }

  /**
   * Показать кнопку «Назад» в chrome хоста
   */
  show(): void {
    if (this.visible) return;

    this.visible = true;
    this.sync();
  }

  /**
   * Скрыть кнопку «Назад» (chrome вернётся к «Закрыть»)
   */
  hide(): void {
    if (!this.visible) return;

    this.visible = false;
    this.sync();
  }

  /**
   * Зарегистрировать хендлер нажатия «Назад»
   */
  onClick(handler: BackButtonClickHandler): void {
    this.clickHandlers.add(handler);
  }

  /**
   * Снять хендлер нажатия
   */
  offClick(handler: BackButtonClickHandler): void {
    this.clickHandlers.delete(handler);
  }

  /**
   * Доставка нажатия от хоста (вызывается ядром SDK по back_button_pressed)
   * @internal
   */
  handlePressed(): void {
    this.logger.log('BackButton: нажатие от хоста');
    for (const handler of this.clickHandlers) {
      handler();
    }
  }

  /**
   * Сброс состояния при уничтожении SDK
   * Если кнопка была видима — шлёт hide на хост, пока транспорт ещё жив.
   * @internal
   */
  reset(): void {
    const wasVisible = this.visible;
    this.visible = false;
    this.clickHandlers.clear();

    if (wasVisible) {
      this.sync();
    }
  }

  private sync(): void {
    this.logger.log('BackButton: is_visible =', this.visible);
    this.transport.post<SetupBackButtonPayload>(IframeToParentMessageType.WEB_APP_SETUP_BACK_BUTTON, {
      is_visible: this.visible,
    });
  }
}
