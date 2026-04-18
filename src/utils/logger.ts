/**
 * Отладочный логгер, выводит только при включённом debug
 */
export class Logger {
  private enabled: boolean;
  private prefix: string;

  constructor(prefix: string, enabled: boolean = false) {
    this.prefix = `[${prefix}]`;
    this.enabled = enabled;
  }

  log(...args: unknown[]): void {
    if (this.enabled) {
      console.log(this.prefix, ...args);
    }
  }

  warn(...args: unknown[]): void {
    if (this.enabled) {
      console.warn(this.prefix, ...args);
    }
  }

  error(...args: unknown[]): void {
    // Ошибки логируются всегда
    console.error(this.prefix, ...args);
  }
}
