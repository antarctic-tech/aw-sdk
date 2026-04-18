/**
 * Генерация уникального ID запроса
 */
export function generateRequestId(): string {
  return crypto.randomUUID();
}
