import { describe, expect, it, vi } from 'vitest';
import { HapticFeedbackModule } from '../../src/modules/hapticFeedback';
import { IframeToParentMessageType } from '../../src/types/protocol';
import type { PostMessageTransport } from '../../src/transport/postMessage';
import type { Logger } from '../../src/utils/logger';

function setup() {
  const post = vi.fn();
  const transport = { post } as unknown as PostMessageTransport;
  const logger = { log: () => {}, warn: () => {}, error: () => {} } as unknown as Logger;
  return { module: new HapticFeedbackModule(transport, logger), post };
}

describe('HapticFeedbackModule', () => {
  it('шлёт web_app_trigger_haptic_feedback с payload как у Telegram, без ожидания ответа', () => {
    const { module, post } = setup();
    module.impactOccurred('medium');
    module.notificationOccurred('success');
    module.selectionChanged();
    expect(post.mock.calls).toEqual([
      [IframeToParentMessageType.WEB_APP_TRIGGER_HAPTIC_FEEDBACK, { type: 'impact', impact_style: 'medium' }],
      [IframeToParentMessageType.WEB_APP_TRIGGER_HAPTIC_FEEDBACK, { type: 'notification', notification_type: 'success' }],
      [IframeToParentMessageType.WEB_APP_TRIGGER_HAPTIC_FEEDBACK, { type: 'selection_change' }],
    ]);
  });
});
