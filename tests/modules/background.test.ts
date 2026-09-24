import { describe, expect, it, vi } from 'vitest';
import { BackgroundModule } from '../../src/modules/background';
import { IframeToParentMessageType } from '../../src/types/protocol';
import type { PostMessageTransport } from '../../src/transport/postMessage';
import type { Logger } from '../../src/utils/logger';

function setup() {
  const post = vi.fn();
  const transport = { post } as unknown as PostMessageTransport;
  const logger = { log: () => {}, warn: () => {}, error: () => {} } as unknown as Logger;
  return { module: new BackgroundModule(transport, logger), post };
}

describe('BackgroundModule', () => {
  it('шлёт web_app_set_background_color с нормализованным #rrggbb, без ожидания ответа', () => {
    const { module, post } = setup();
    expect(module.setBackgroundColor('#ABCDEF')).toBe(true);
    expect(module.setBackgroundColor(' #f0a ')).toBe(true);
    expect(post.mock.calls).toEqual([
      [IframeToParentMessageType.WEB_APP_SET_BACKGROUND_COLOR, { color: '#abcdef' }],
      [IframeToParentMessageType.WEB_APP_SET_BACKGROUND_COLOR, { color: '#ff00aa' }],
    ]);
    expect(module.backgroundColor).toBe('#ff00aa');
  });

  it('невалидный цвет не отправляет и не запоминает', () => {
    const { module, post } = setup();
    for (const value of ['red', '#12345', '#ggg', 'rgb(0,0,0)', '']) {
      expect(module.setBackgroundColor(value)).toBe(false);
    }
    expect(post).not.toHaveBeenCalled();
    expect(module.backgroundColor).toBeUndefined();
  });

  it('reset забывает цвет', () => {
    const { module } = setup();
    module.setBackgroundColor('#000');
    module.reset();
    expect(module.backgroundColor).toBeUndefined();
  });
});
