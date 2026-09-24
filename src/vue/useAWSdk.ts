import {
  onMounted,
  onUnmounted,
  readonly,
  ref,
  shallowRef,
  type DeepReadonly,
  type Ref,
  type ShallowRef,
} from 'vue';
import { AWSDK } from '../sdk';
import type { AWSDKConfig } from '../types/config';
import type { AWColorScheme, AWInsets, AWPlatform } from '../types/environment';
import type { AWSession } from '../types/session';
import type { AWUserContext } from '../types/user';
import { readLaunchEnvironment } from '../utils/environment';

export interface UseAWSDKReturn {
  platform: Readonly<Ref<AWPlatform | undefined>>;
  isActive: Readonly<Ref<boolean>>;
  colorScheme: Readonly<Ref<AWColorScheme | undefined>>;
  languageCode: Readonly<Ref<string | undefined>>;
  safeAreaInset: Readonly<Ref<AWInsets | undefined>>;
  /** Инстанс SDK (null до mount) */
  sdk: ShallowRef<AWSDK | null>;
  /** Текущая сессия (null до инициализации) */
  session: DeepReadonly<Ref<AWSession | null>>;
  /** Контекст пользователя (null до инициализации) */
  user: DeepReadonly<Ref<AWUserContext | null>>;
  /** SDK успешно инициализирован */
  isReady: Readonly<Ref<boolean>>;
  /** Ошибка при инициализации */
  error: Readonly<Ref<Error | null>>;
}

/**
 * Vue 3 composable для работы с AW SDK.
 *
 * Создаёт экземпляр SDK, инициализирует его при mount и уничтожает при unmount.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useAWSdk } from '@antarctic-wallet/aw-sdk/vue';
 *
 * const { sdk, session, user, isReady, error } = useAWSdk({
 *   appId: 'my-app',
 *   scopes: ['userData', 'balance'],
 *   parentOrigin: 'https://wallet.antarctic.com',
 * });
 * </script>
 * ```
 */
export function useAWSdk(config: AWSDKConfig): UseAWSDKReturn {
  const launch = readLaunchEnvironment();
  const platform = ref(launch.platform);
  const isActive = ref(launch.isActive);
  const colorScheme = ref(launch.colorScheme);
  const languageCode = ref(launch.languageCode);
  const safeAreaInset = shallowRef<AWInsets>();
  const sdk = shallowRef<AWSDK | null>(null);
  const session = ref<AWSession | null>(null);
  const user = ref<AWUserContext | null>(null);
  const isReady = ref(false);
  const error = ref<Error | null>(null);

  onMounted(async () => {
    const instance = new AWSDK(config);
    sdk.value = instance;

    const syncEnvironment = () => {
      platform.value = instance.platform;
      isActive.value = instance.isActive;
      colorScheme.value = instance.colorScheme;
      languageCode.value = instance.languageCode;
      safeAreaInset.value = instance.safeAreaInset;
    };
    syncEnvironment();
    instance.events.on('themeChanged', syncEnvironment);
    instance.events.on('languageChanged', syncEnvironment);
    instance.events.on('safeAreaChanged', syncEnvironment);
    instance.events.on('activated', syncEnvironment);
    instance.events.on('deactivated', syncEnvironment);

    try {
      const s = await instance.init();
      session.value = s;
      user.value = s.userContext ?? null;
      isReady.value = true;
    } catch (e) {
      error.value = e instanceof Error ? e : new Error(String(e));
    }

    instance.events.on('session.refreshed', () => {
      const current = instance.getSession();
      if (!current) return;
      session.value = current;
      user.value = current.userContext ?? null;
    });

    // Обновлять ошибку при sdk.error
    instance.events.on('sdk.error', (e) => {
      error.value = new Error(e.message);
    });

    // Сессия истекла
    instance.events.on('session.expired', () => {
      session.value = null;
      user.value = null;
      isReady.value = false;
    });
  });

  onUnmounted(() => {
    sdk.value?.destroy();
    sdk.value = null;
  });

  return {
    platform: readonly(platform),
    isActive: readonly(isActive),
    colorScheme: readonly(colorScheme),
    languageCode: readonly(languageCode),
    safeAreaInset: readonly(safeAreaInset),
    sdk,
    session: readonly(session),
    user: readonly(user),
    isReady: readonly(isReady),
    error: readonly(error),
  };
}
