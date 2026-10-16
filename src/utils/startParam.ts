/** Общий контракт start_param: и openApp, и чтение после init(). Расхождение молча обнулит параметр у получателя. */
export const START_PARAM = /^[A-Za-z0-9_-]{1,512}$/;

/**
 * Стартовый параметр открытия. Хост уже проверяет строку; здесь только отсев.
 * Нет значения, null и пустая строка — null без предупреждения.
 * Невалидное значение — null и console.warn, init() из-за этого не падает.
 */
export function parseStartParam(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value === 'string' && START_PARAM.test(value)) return value;
  console.warn('[AW-SDK]', 'Невалидный start_param отброшен:', value);
  return null;
}
