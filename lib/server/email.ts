import { ApiError, runtime } from './core';

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  );

export async function sendMail(
  recipient: string,
  subject: string,
  text: string,
  action?: { label: string; url: string },
) {
  const apiKey = runtime().RESEND_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === 'production')
      throw new ApiError('Отправка писем временно недоступна.', 503, 'email_unavailable');
    console.info(JSON.stringify({ event: 'development_email', recipient, subject, action }));
    return;
  }
  const html = `<div style="font:16px/1.5 Arial,sans-serif;color:#10151c"><h1 style="font-size:24px">AniMonster</h1><p>${escapeHtml(text)}</p>${action ? `<p><a href="${escapeHtml(action.url)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#a7f432;color:#10151c;text-decoration:none;font-weight:700">${escapeHtml(action.label)}</a></p>` : ''}<p style="color:#667085;font-size:13px">Если это были не вы, проигнорируйте письмо.</p></div>`;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: runtime().EMAIL_FROM || 'AniMonster <no-reply@animonster.su>',
        to: [recipient],
        subject,
        html,
        text: `${text}${action ? `\n${action.label}: ${action.url}` : ''}`,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) return;
    console.error('Resend rejected email', {
      status: response.status,
      requestId: response.headers.get('x-request-id'),
    });
    await response.body?.cancel();
  } catch (error) {
    console.error('Resend request failed', {
      reason: error instanceof Error ? error.name : 'unknown',
    });
  }
  throw new ApiError('Не удалось отправить письмо. Попробуйте позже.', 502, 'email_delivery_failed');
}
