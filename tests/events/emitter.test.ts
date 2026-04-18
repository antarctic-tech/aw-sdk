import { describe, it, expect, vi } from 'vitest';
import { TypedEmitter } from '../../src/events/emitter';

type TestEvents = {
  ping: { count: number };
  pong: void;
};

describe('TypedEmitter', () => {
  it('вызывает обработчик при emit', () => {
    const emitter = new TypedEmitter<TestEvents>();
    const handler = vi.fn();

    emitter.on('ping', handler);
    emitter.emit('ping', { count: 1 });

    expect(handler).toHaveBeenCalledWith({ count: 1 });
  });

  it('поддерживает void-события без аргументов', () => {
    const emitter = new TypedEmitter<TestEvents>();
    const handler = vi.fn();

    emitter.on('pong', handler);
    emitter.emit('pong');

    expect(handler).toHaveBeenCalledOnce();
  });

  it('поддерживает несколько обработчиков на одно событие', () => {
    const emitter = new TypedEmitter<TestEvents>();
    const h1 = vi.fn();
    const h2 = vi.fn();

    emitter.on('ping', h1);
    emitter.on('ping', h2);
    emitter.emit('ping', { count: 5 });

    expect(h1).toHaveBeenCalledWith({ count: 5 });
    expect(h2).toHaveBeenCalledWith({ count: 5 });
  });

  it('off удаляет обработчик', () => {
    const emitter = new TypedEmitter<TestEvents>();
    const handler = vi.fn();

    emitter.on('ping', handler);
    emitter.off('ping', handler);
    emitter.emit('ping', { count: 1 });

    expect(handler).not.toHaveBeenCalled();
  });

  it('removeAllListeners удаляет все обработчики', () => {
    const emitter = new TypedEmitter<TestEvents>();
    const h1 = vi.fn();
    const h2 = vi.fn();

    emitter.on('ping', h1);
    emitter.on('pong', h2);
    emitter.removeAllListeners();

    emitter.emit('ping', { count: 1 });
    emitter.emit('pong');

    expect(h1).not.toHaveBeenCalled();
    expect(h2).not.toHaveBeenCalled();
  });

  it('emit без подписчиков не падает', () => {
    const emitter = new TypedEmitter<TestEvents>();
    expect(() => emitter.emit('ping', { count: 1 })).not.toThrow();
  });
});
