import { describe, it, expect, vi } from 'vitest';
import { BackButtonModule } from '../../src/modules/backButton';
import { IframeToParentMessageType } from '../../src/types/protocol';
import type { PostMessageTransport } from '../../src/transport/postMessage';
import type { Logger } from '../../src/utils/logger';

const mockLogger: Logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Logger;

function makeTransport() {
  return { post: vi.fn() } as unknown as PostMessageTransport;
}

describe('BackButtonModule', () => {
  it('изначально скрыта', () => {
    const mod = new BackButtonModule(makeTransport(), mockLogger);
    expect(mod.isVisible).toBe(false);
  });

  it('show отправляет web_app_setup_back_button с is_visible: true', () => {
    const transport = makeTransport();
    const mod = new BackButtonModule(transport, mockLogger);

    mod.show();

    expect(mod.isVisible).toBe(true);
    expect(transport.post).toHaveBeenCalledWith(IframeToParentMessageType.WEB_APP_SETUP_BACK_BUTTON, {
      is_visible: true,
    });
  });

  it('hide отправляет is_visible: false', () => {
    const transport = makeTransport();
    const mod = new BackButtonModule(transport, mockLogger);

    mod.show();
    mod.hide();

    expect(mod.isVisible).toBe(false);
    expect(transport.post).toHaveBeenLastCalledWith(IframeToParentMessageType.WEB_APP_SETUP_BACK_BUTTON, {
      is_visible: false,
    });
  });

  it('повторный show/hide без смены состояния не шлёт сообщений', () => {
    const transport = makeTransport();
    const mod = new BackButtonModule(transport, mockLogger);

    mod.hide();
    expect(transport.post).not.toHaveBeenCalled();

    mod.show();
    mod.show();
    expect(transport.post).toHaveBeenCalledTimes(1);
  });

  it('handlePressed вызывает зарегистрированные onClick-хендлеры', () => {
    const mod = new BackButtonModule(makeTransport(), mockLogger);
    const first = vi.fn();
    const second = vi.fn();

    mod.onClick(first);
    mod.onClick(second);
    mod.handlePressed();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('offClick снимает хендлер', () => {
    const mod = new BackButtonModule(makeTransport(), mockLogger);
    const handler = vi.fn();

    mod.onClick(handler);
    mod.offClick(handler);
    mod.handlePressed();

    expect(handler).not.toHaveBeenCalled();
  });

  it('reset скрывает кнопку на хосте и чистит хендлеры', () => {
    const transport = makeTransport();
    const mod = new BackButtonModule(transport, mockLogger);
    const handler = vi.fn();

    mod.show();
    mod.onClick(handler);
    mod.reset();
    mod.handlePressed();

    expect(mod.isVisible).toBe(false);
    expect(handler).not.toHaveBeenCalled();
    expect(transport.post).toHaveBeenLastCalledWith(IframeToParentMessageType.WEB_APP_SETUP_BACK_BUTTON, {
      is_visible: false,
    });
  });

  it('reset без видимой кнопки не шлёт сообщений', () => {
    const transport = makeTransport();
    const mod = new BackButtonModule(transport, mockLogger);

    mod.reset();

    expect(transport.post).not.toHaveBeenCalled();
  });
});
