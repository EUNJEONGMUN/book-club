// Open-redirect guard for ?next= params.
// Only allows same-origin absolute paths: must start with `/`, but not `//`
// (protocol-relative) or `/\` (Windows path that some routers misinterpret).
export function sanitizeNext(raw: string | null | undefined): string {
  if (!raw) return '/';
  // URL parsing removes tabs/newlines before resolving the destination. Reject
  // controls and backslashes first so `/\t/example.com` cannot become `//...`.
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) return '/';
  return raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';
}
