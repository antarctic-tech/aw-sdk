/**
 * Типы операций, которые создаёт бэкенд партнёра
 * через POST {AW_API_BASE}/api/apps/v1/intents
 */
export type AWOperationType = 'pay' | 'receive' | 'scopes';

/**
 * Статус операции
 */
export type AWOperationStatus =
  | 'pending'
  | 'awaiting_confirmation'
  | 'confirmed'
  | 'succeeded'
  | 'failed'
  | 'rejected';

/**
 * Результат подтверждённой операции
 */
export interface AWOperationResult {
  operationId: string;
  status: AWOperationStatus;
  txId?: string;
}
