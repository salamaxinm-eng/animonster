export function referralUrl(code: string, origin: string) {
  return new URL(
    `/ref/${encodeURIComponent(code.trim().toUpperCase())}`,
    origin,
  ).toString();
}
