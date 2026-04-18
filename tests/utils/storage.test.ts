import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { saveSession, loadSession, clearSession } from '../../src/utils/storage';
import type { AWSession } from '../../src/types/session';

const APP_ID = 'test-app';
const STORAGE_KEY = 'aw-sdk:session:test-app';

const makeSession = (overrides?: Partial<AWSession>): AWSession => ({
  sessionToken: 'tok-1',
  grantedScopes: ['user.profile.read'],
  userContext: { userId: 'u1', displayName: 'Alice', walletAddress: '0x1', avatarUrl: '' },
  expiresAt: Date.now() + 60_000,
  ...overrides,
});

// Мок sessionStorage для node-окружения
const store = new Map<string, string>();
beforeAll(() => {
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear(),
  });
});

describe('storage', () => {
  beforeEach(() => {
    store.clear();
  });

  describe('saveSession', () => {
    it('сохраняет сессию в sessionStorage', () => {
      saveSession(APP_ID, makeSession());

      const raw = sessionStorage.getItem(STORAGE_KEY);
      expect(raw).toBeTruthy();

      const parsed = JSON.parse(raw!);
      expect(parsed.session.sessionToken).toBe('tok-1');
      expect(parsed.savedAt).toBeTypeOf('number');
    });
  });

  describe('loadSession', () => {
    it('загружает валидную сессию', () => {
      const session = makeSession();
      saveSession(APP_ID, session);

      const loaded = loadSession(APP_ID);
      expect(loaded).not.toBeNull();
      expect(loaded!.sessionToken).toBe('tok-1');
    });

    it('возвращает null если сессия истекла', () => {
      const session = makeSession({ expiresAt: Date.now() - 1000 });
      saveSession(APP_ID, session);

      const loaded = loadSession(APP_ID);
      expect(loaded).toBeNull();
    });

    it('возвращает null если нет сохранённой сессии', () => {
      expect(loadSession(APP_ID)).toBeNull();
    });

    it('возвращает null при невалидном JSON', () => {
      sessionStorage.setItem(STORAGE_KEY, 'not-json');
      expect(loadSession(APP_ID)).toBeNull();
    });
  });

  describe('clearSession', () => {
    it('удаляет сессию из sessionStorage', () => {
      saveSession(APP_ID, makeSession());
      clearSession(APP_ID);

      expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('не падает если сессии нет', () => {
      expect(() => clearSession(APP_ID)).not.toThrow();
    });
  });
});
