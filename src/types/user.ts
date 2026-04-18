/**
 * Контекст пользователя, полученный от кошелька при инициализации
 */
export interface AWUserContext {
  /** Внутренний ID пользователя в Antarctic Wallet */
  userId?: string;
  /** Отображаемое имя пользователя */
  displayName?: string;
  /** Основной адрес кошелька */
  walletAddress?: string;
  /** URL аватара */
  avatarUrl?: string;
}
