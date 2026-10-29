import type { ReactNode } from 'react';

export const EMAIL_VERIFICATION_HREF = '/verify-email';

// API clients retain the human-readable message, even when they discard the
// error code. Only known verification prompts become links; other feedback
// keeps its original content and React escaping.
export function FeedbackMessage({ children }: { children: ReactNode }) {
  if (
    typeof children === 'string' &&
    /^(?:Подтвердите email(?:[,.]|$)|Сначала подтвердите email[.,]|Войдите в аккаунт и подтвердите email,)/.test(children)
  ) {
    return (
      <a className="email-verification-link" href={EMAIL_VERIFICATION_HREF}>
        {children}
      </a>
    );
  }
  return <>{children}</>;
}
