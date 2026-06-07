// Open-redirect guard for ?next= params.
// Only allows same-origin absolute paths: must start with `/`, but not `//`
// (protocol-relative) or `/\` (Windows path that some routers misinterpret).
export function sanitizeNext(raw: string | null | undefined): string {
  if (!raw) return '/';
  return raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/\\') ? raw : '/';
}
