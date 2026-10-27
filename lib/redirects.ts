// Post-login destination validation shared by the password and link flows.
// Only same-site absolute paths are accepted, so a crafted link cannot turn the
// login into an open redirect.
export function safeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/';
  if (value.startsWith('/api/session')) return '/';
  return value;
}
