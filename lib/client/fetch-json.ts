export async function fetchJsonWithRetry<T>(
  url: string,
  signal: AbortSignal,
  attempts = 3,
): Promise<{ data: T; response: Response }> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal.addEventListener('abort', onAbort, { once: true });
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as T;
      return { data, response };
    } catch (error) {
      if (signal.aborted || attempt === attempts - 1) throw error;
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          clearTimeout(delay);
          reject(new DOMException('Aborted', 'AbortError'));
        };
        const delay = setTimeout(() => {
          signal.removeEventListener('abort', onAbort);
          resolve();
        }, 600 * (attempt + 1));
        signal.addEventListener('abort', onAbort, { once: true });
      });
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener('abort', onAbort);
    }
  }
  throw new Error('Request failed');
}
