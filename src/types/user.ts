/**
 * Контекст пользователя из id_token.
 * displayName — это `sub` (непрозрачный per-app login): его и показываем как имя.
 * avatarUrl — `userImage`, только https.
 * Не использовать для авторизации.
 */
export interface AWUserContext {
  /** Per-app login (`sub`). Это и есть отображаемое имя. */
  displayName?: string;
  /** URL аватара (`userImage`) */
  avatarUrl?: string;
}
