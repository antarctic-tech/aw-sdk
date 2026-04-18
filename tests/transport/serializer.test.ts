import { describe, it, expect } from 'vitest';
import { isValidAWMessage, createMessage } from '../../src/transport/serializer';

describe('serializer', () => {
  describe('isValidAWMessage', () => {
    it('возвращает true для валидного сообщения', () => {
      expect(isValidAWMessage({
        type: 'SDK_INIT',
        requestId: 'r1',
        payload: {},
        version: '1.0',
        appId: 'app-1',
        timestamp: 123,
      })).toBe(true);
    });

    it('возвращает true если payload = null', () => {
      expect(isValidAWMessage({
        type: 'X',
        requestId: 'r1',
        payload: null,
        version: '1.0',
        appId: 'a',
        timestamp: 1,
      })).toBe(true);
    });

    it('возвращает false для null', () => {
      expect(isValidAWMessage(null)).toBe(false);
    });

    it('возвращает false для строки', () => {
      expect(isValidAWMessage('hello')).toBe(false);
    });

    it('возвращает false если нет type', () => {
      expect(isValidAWMessage({
        requestId: 'r1', payload: {}, version: '1.0', appId: 'a', timestamp: 1,
      })).toBe(false);
    });

    it('возвращает false если нет requestId', () => {
      expect(isValidAWMessage({
        type: 'X', payload: {}, version: '1.0', appId: 'a', timestamp: 1,
      })).toBe(false);
    });

    it('возвращает false если нет payload', () => {
      expect(isValidAWMessage({
        type: 'X', requestId: 'r1', version: '1.0', appId: 'a', timestamp: 1,
      })).toBe(false);
    });

    it('возвращает false если timestamp не число', () => {
      expect(isValidAWMessage({
        type: 'X', requestId: 'r1', payload: {}, version: '1.0', appId: 'a', timestamp: 'abc',
      })).toBe(false);
    });
  });

  describe('createMessage', () => {
    it('создаёт обёртку AWMessage с правильными полями', () => {
      const msg = createMessage('SDK_INIT', { foo: 'bar' }, 'app-1', 'req-1', '1.0');

      expect(msg.type).toBe('SDK_INIT');
      expect(msg.payload).toEqual({ foo: 'bar' });
      expect(msg.appId).toBe('app-1');
      expect(msg.requestId).toBe('req-1');
      expect(msg.version).toBe('1.0');
      expect(msg.timestamp).toBeTypeOf('number');
    });

    it('timestamp близок к текущему времени', () => {
      const before = Date.now();
      const msg = createMessage('X', {}, 'a', 'r', '1.0');
      const after = Date.now();

      expect(msg.timestamp).toBeGreaterThanOrEqual(before);
      expect(msg.timestamp).toBeLessThanOrEqual(after);
    });
  });
});
