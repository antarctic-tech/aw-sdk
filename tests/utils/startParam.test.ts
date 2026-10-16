import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseStartParam } from '../../src/utils/startParam';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseStartParam', () => {
  it('принимает алфавит A-Za-z0-9_- на границах длины', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseStartParam('A')).toBe('A');
    expect(parseStartParam('z')).toBe('z');
    expect(parseStartParam('0')).toBe('0');
    expect(parseStartParam('_')).toBe('_');
    expect(parseStartParam('-')).toBe('-');
    expect(parseStartParam('order_42')).toBe('order_42');
    expect(parseStartParam('Az9_-')).toBe('Az9_-');
    expect(parseStartParam('a'.repeat(512))).toBe('a'.repeat(512));
    expect(warn).not.toHaveBeenCalled();
  });

  it('нет значения, null и пустая строка дают null без предупреждения', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseStartParam(undefined)).toBeNull();
    expect(parseStartParam(null)).toBeNull();
    expect(parseStartParam('')).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('невалидное значение даёт null и пишет console.warn, строку не обрезает', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const invalid = [' ', 'bad char', 'a*b', 'order_42 ', 'й', 'a'.repeat(513), 1, true, { startParam: 'order_42' }];
    for (const value of invalid) {
      expect(parseStartParam(value)).toBeNull();
    }
    expect(warn).toHaveBeenCalledTimes(invalid.length);
    expect(warn).toHaveBeenCalledWith('[AW-SDK]', 'Невалидный start_param отброшен:', 'bad char');
  });
});
