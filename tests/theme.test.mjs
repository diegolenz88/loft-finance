import assert from 'node:assert/strict';
import {parseTheme,themeFromCookieHeader} from '../lib/theme.ts';

// Stored preference values are whitelisted; anything unknown falls back to the
// system setting instead of injecting arbitrary values into the document.
assert.equal(parseTheme('light'),'light');
assert.equal(parseTheme('dark'),'dark');
assert.equal(parseTheme('system'),'system');

assert.equal(parseTheme(undefined),'system');
assert.equal(parseTheme(null),'system');
assert.equal(parseTheme(''),'system');
assert.equal(parseTheme('DARK'),'system');
assert.equal(parseTheme('blue'),'system');
assert.equal(parseTheme('dark; path=/'),'system');
assert.equal(parseTheme('"><script>'),'system');

// The cookie is read among unrelated cookies, and only the exact name counts.
assert.equal(themeFromCookieHeader('loft_theme=dark'),'dark');
assert.equal(themeFromCookieHeader('a=1; loft_theme=light; b=2'),'light');
assert.equal(themeFromCookieHeader('xloft_theme=dark'),'system');
assert.equal(themeFromCookieHeader('loft_theme='),'system');
assert.equal(themeFromCookieHeader(''),'system');
assert.equal(themeFromCookieHeader(null),'system');
assert.equal(themeFromCookieHeader('loft_theme=neon'),'system');

console.log('PASS: preferência de tema aceita apenas claro, escuro ou sistema.');
