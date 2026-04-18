import {
  ref,
  shallowRef,
  readonly,
  onMounted,
  onUnmounted,
  type ShallowRef,
  type Ref,
  type DeepReadonly,
} from 'vue';
import { AWSDK } from '../sdk';
import type { AWSDKConfig } from '../types/config';
import type { AWSession } from '../types/session';
import type { AWUserContext } from '../types/user';

export interface UseAWSDKReturn {
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
 *   scopes: ['balance:read'],
 *   parentOrigin: 'https://wallet.antarctic.com',
 * });
 * </script>
 * ```
 */
export function useAWSdk(config: AWSDKConfig): UseAWSDKReturn {
  const sdk = shallowRef<AWSDK | null>(null);
  const session = ref<AWSession | null>(null);
  const user = ref<AWUserContext | null>(null);
  const isReady = ref(false);
  const error = ref<Error | null>(null);

  onMounted(async () => {
    const instance = new AWSDK(config);
    sdk.value = instance;

    try {
      const s = await instance.init();
      session.value = s;
      user.value = s.userContext ?? null;
      isReady.value = true;
    } catch (e) {
      error.value = e instanceof Error ? e : new Error(String(e));
    }

    // Обновлять сессию при рефреше
    instance.events.on('session.refreshed', (data) => {
      if (session.value) {
        session.value = {
          ...session.value,
          sessionToken: data.sessionToken,
          expiresAt: data.expiresAt,
        };
      }
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
    sdk,
    session: readonly(session),
    user: readonly(user),
    isReady: readonly(isReady),
    error: readonly(error),
  };
}
