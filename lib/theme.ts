export type ThemePreference='light'|'dark'|'system';

const THEME_COOKIE='loft_theme';

export function parseTheme(value:string|null|undefined):ThemePreference{
  return value==='light'||value==='dark'||value==='system'?value:'system';
}

export function themeFromCookieHeader(cookieHeader:string|null|undefined):ThemePreference{
  const raw=cookieHeader||'';
  const pair=raw.split(';').map(part=>part.trim()).find(part=>part.startsWith(`${THEME_COOKIE}=`));
  return parseTheme(pair?.slice(THEME_COOKIE.length+1));
}

export async function getThemePreference():Promise<ThemePreference>{
  // Imported lazily so pure helpers stay testable outside the Next runtime.
  const {headers}=await import('next/headers');
  const requestHeaders=await headers();
  return themeFromCookieHeader(requestHeaders.get('cookie'));
}

export const themeCookieName=THEME_COOKIE;