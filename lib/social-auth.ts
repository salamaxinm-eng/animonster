export type SocialProvider = 'google' | 'telegram';
export function isSocialProvider(value: string): value is SocialProvider {
  return value === 'google' || value === 'telegram';
}
export const socialProviderName = { google: 'Google', telegram: 'Telegram' };
export const socialAuthMessages: Record<string, string> = {
  social_cancelled:
    'Вход отменён. Можно попробовать ещё раз или выбрать другой способ.',
  social_failed: 'Не удалось завершить вход. Попробуйте ещё раз.',
  social_expired: 'Ссылка для входа устарела. Начните вход заново.',
  social_unavailable: 'Этот способ входа пока не настроен. Выберите другой.',
  social_email_exists:
    'Аккаунт с этим email уже существует. Войдите привычным способом и подключите Google в настройках аккаунта.',
  social_conflict:
    'Этот Google или Telegram уже связан с другим профилем. Войдите в тот профиль или используйте другой аккаунт провайдера.',
  social_invite_required:
    'Для создания аккаунта нужен код приглашения. Для входа в существующий аккаунт приглашение не требуется.',
  social_invite_invalid:
    'Приглашение недействительно, истекло или уже использовано.',
  social_session_expired:
    'Сессия закончилась. Войдите в аккаунт и повторите привязку в настройках.',
  social_blocked: 'Вход в этот аккаунт ограничен.',
  social_linked:
    'Способ входа подключён. История, коллекция и оформление сохранены.',
  social_limited:
    'Слишком много попыток входа. Попробуйте через несколько минут.',
};
