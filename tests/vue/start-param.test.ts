import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRenderer, h, nextTick } from 'vue';
import { AWSDK } from '../../src/sdk';
import type { AWSession } from '../../src/types/session';
import { useAWSdk, type UseAWSDKReturn } from '../../src/vue/useAWSdk';

const renderer = createRenderer<object, object>({
  createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
  insert: () => {}, remove: () => {}, setText: () => {}, setElementText: () => {},
  parentNode: () => null, nextSibling: () => null, patchProp: () => {},
});

const session: AWSession = {
  sessionToken: 't',
  grantedScopes: [],
  userContext: {},
  expiresAt: 99999,
};

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('useAWSdk: startParam', () => {
  it('после init ref совпадает с геттером и не сбрасывается при session.expired', async () => {
    vi.stubGlobal('window', { location: { search: '?start_param=from_url&awPlatform=web' } });
    vi.stubGlobal('document', { documentElement: { style: { setProperty: () => {}, removeProperty: () => {} } } });
    let resolveInit: (value: AWSession) => void = () => {};
    vi.spyOn(AWSDK.prototype, 'init').mockImplementation(() => new Promise(resolve => { resolveInit = resolve; }));
    vi.spyOn(AWSDK.prototype, 'startParam', 'get').mockReturnValue('order_42');
    const destroy = vi.spyOn(AWSDK.prototype, 'destroy').mockImplementation(() => {});

    let state: UseAWSDKReturn | undefined;
    const app = renderer.createApp({
      setup() {
        state = useAWSdk({ appId: 'a', parentOrigin: 'https://wallet.example', scopes: [] });
        expect(state.startParam.value).toBeNull();
        return () => h('div');
      },
    });
    app.mount({});
    await nextTick();
    expect(state!.startParam.value).toBeNull();

    resolveInit(session);
    await vi.waitFor(() => {
      expect(state!.startParam.value).toBe('order_42');
    });

    state!.sdk.value!.events.emit('session.expired');
    await nextTick();
    expect(state!.startParam.value).toBe('order_42');
    expect(state!.isReady.value).toBe(false);

    app.unmount();
    expect(destroy).toHaveBeenCalledOnce();
  });
});
