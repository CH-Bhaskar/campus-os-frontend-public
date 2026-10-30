/** Only allow same-origin, absolute-path redirects after sign-in (no `//evil.com`). */
export function safeNext(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/'
  return next
}
