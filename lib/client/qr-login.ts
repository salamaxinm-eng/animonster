export async function qrRequest(
  input: Record<string, unknown>,
  signal?: AbortSignal,
) {
  const response = await fetch('/api/auth/qr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    cache: 'no-store',
    body: JSON.stringify(input),
    signal,
  });
  const data = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(data.error || 'Не удалось выполнить вход.'), {
      code: data.code,
    });
  return data;
}
