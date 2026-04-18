/**
 * Конфигурация retry-логики
 */
export interface AWRetryConfig {
  /** Максимальное количество попыток (включая первую). По умолчанию 3 */
  maxAttempts?: number;
  /** Базовая задержка перед retry в мс. По умолчанию 1000 */
  baseDelay?: number;
}

/**
 * Конфигурация инициализации SDK
 */
export interface AWSDKConfig {
  /** Уникальный идентификатор приложения */
  appId: string;
  /** Запрашиваемые разрешения */
  scopes: string[];
  /** Ожидаемый origin родителя для безопасности postMessage */
  parentOrigin: string;
  /** Включить отладочное логирование */
  debug?: boolean;
  /** Таймаут ожидания ответов postMessage (мс). По умолчанию 30000 */
  timeout?: number;
  /** Сохранять сессию в sessionStorage для восстановления при перезагрузке. По умолчанию true */
  persistSession?: boolean;
  /** Конфигурация retry при таймаутах. По умолчанию { maxAttempts: 3, baseDelay: 1000 } */
  retry?: AWRetryConfig;
}
