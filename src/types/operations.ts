/**
 * Доступные типы операций
 */
export type AWOperationType = 'transfer' | 'payment';

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
 * Параметры для создания намерения операции
 */
export interface AWOperationIntentParams {
  type: AWOperationType;
  amount: string;
  currency: string;
  to: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Ответ на подготовку операции
 */
export interface AWOperationIntent {
  operationId: string;
  type: AWOperationType;
  status: AWOperationStatus;
  amount: string;
  currency: string;
  to: string;
  description?: string;
}

/**
 * Результат подтверждённой операции
 */
export interface AWOperationResult {
  operationId: string;
  status: AWOperationStatus;
  txId?: string;
}
