type EventHandler<T> = T extends void ? () => void : (data: T) => void;

/**
 * Типизированный эмиттер событий без зависимостей
 */
export class TypedEmitter<EventMap extends { [key: string]: unknown }> {
  private listeners = new Map<keyof EventMap, Set<EventHandler<unknown>>>();

  on<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler as EventHandler<unknown>);
  }

  off<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): void {
    this.listeners.get(event)?.delete(handler as EventHandler<unknown>);
  }

  emit<K extends keyof EventMap>(
    event: K,
    ...args: EventMap[K] extends void ? [] : [EventMap[K]]
  ): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        (handler as (...a: unknown[]) => void)(...args);
      }
    }
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}
