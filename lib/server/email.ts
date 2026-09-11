import { ApiError, runtime } from './core';

function sender() {
  const value = runtime().EMAIL_FROM || 'AniMonster <no-reply@animonster.su>';
  const match = value.match(/^(.+?)\s*<([^>]+)>$/);
  return match ? { name: match[1].trim(), email: match[2] } : { name: 'AniMonster', email: value };
}

export async function sendMail(
  recipient: string,
  subject: string,
  text: string,
  action?: { label: string; url: string },
) {
  const apiKey = runtime().UNISENDER_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === 'production')
      throw new ApiError('Отправка писем временно недоступна.', 503, 'email_unavailable');
    console.info(JSON.stringify({ event: 'development_email', recipient, subject, action }));
    return;
  }
  const from = sender();
  const escapedText = text.replace(/[&<>]/g, (value) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[value]!);
  const html = `<div style="font:16px/1.5 Arial,sans-serif;color:#10151c"><h1 style="font-size:24px">AniMonster</h1><p>${escapedText}</p>${action ? `<p><a href="${action.url}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#a7f432;color:#10151c;text-decoration:none;font-weight:700">${action.label}</a></p>` : ''}<p style="color:#667085;font-size:13px">Если это были не вы, проигнорируйте письмо.</p></div>`;
  const response = await fetch('https://goapi.unisender.ru/ru/transactional/api/v1/email/send.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-API-KEY': apiKey },
    body: JSON.stringify({ message: {
      recipients: [{ email: recipient }], subject,
      from_email: from.email, from_name: from.name,
      body: { html, plaintext: `${text}${action ? `\n${action.label}: ${action.url}` : ''}` },
      track_links: 0, track_read: 0,
    } }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new ApiError('Не удалось отправить письмо. Попробуйте позже.', 502, 'email_delivery_failed');
}
