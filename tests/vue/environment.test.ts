import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRenderer, h, nextTick } from 'vue';
import { AWSDK } from '../../src/sdk';
import { useAWSdk, type UseAWSDKReturn } from '../../src/vue/useAWSdk';

const renderer = createRenderer<object, object>({
  createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
  insert: () => {}, remove: () => {}, setText: () => {}, setElementText: () => {},
  parentNode: () => null, nextSibling: () => null, patchProp: () => {},
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('useAWSdk: окружение', () => {
  it('доступно в setup из launch URL и реактивно обновляется после mount', async () => {
    vi.stubGlobal('window', { location: { search: '?awPlatform=web&awColorScheme=dark&awLanguageCode=ru' } });
    vi.stubGlobal('document', { documentElement: { style: { setProperty: () => {}, removeProperty: () => {} } } });
    vi.spyOn(AWSDK.prototype, 'init').mockResolvedValue({ sessionToken: 't', grantedScopes: [], userContext: {}, expiresAt: 99999 });
    const destroy = vi.spyOn(AWSDK.prototype, 'destroy').mockImplementation(() => {});
    let state: UseAWSDKReturn | undefined;
    const app = renderer.createApp({
      setup() {
        state = useAWSdk({ appId: 'a', parentOrigin: 'https://wallet.example', scopes: [] });
        expect(state.sdk.value).toBeNull();
        expect(state.platform.value).toBe('web');
        expect(state.isActive.value).toBe(true);
        expect(state.colorScheme.value).toBe('dark');
        expect(state.languageCode.value).toBe('ru');
        expect(state.safeAreaInset.value).toBeUndefined();
        return () => h('div', `${state?.colorScheme.value}:${state?.languageCode.value}`);
      },
    });
    app.mount({});
    await nextTick();
    const instance = state!.sdk.value!;
    vi.spyOn(instance, 'colorScheme', 'get').mockReturnValue('light');
    vi.spyOn(instance, 'languageCode', 'get').mockReturnValue('en');
    vi.spyOn(instance, 'isActive', 'get').mockReturnValue(false);
    const insets = { top: 0, right: 0, bottom: 34, left: 0 };
    vi.spyOn(instance, 'safeAreaInset', 'get').mockReturnValue(insets);
    instance.events.emit('themeChanged');
    instance.events.emit('languageChanged');
    instance.events.emit('safeAreaChanged');
    instance.events.emit('deactivated');
    await nextTick();
    expect(state!.colorScheme.value).toBe('light');
    expect(state!.languageCode.value).toBe('en');
    expect(state!.isActive.value).toBe(false);
    expect(state!.safeAreaInset.value).toEqual(insets);
    app.unmount();
    expect(destroy).toHaveBeenCalledOnce();
  });
});
