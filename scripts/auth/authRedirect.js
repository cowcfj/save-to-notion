const CANONICAL_AUTH_PAGE = 'pages/auth/auth.html';

export function buildCanonicalAuthUrl(location = globalThis.location) {
  const targetUrl = new URL(CANONICAL_AUTH_PAGE, location.href);
  targetUrl.search = location.search;
  targetUrl.hash = location.hash;
  return targetUrl.toString();
}

if (globalThis.location?.pathname === '/auth.html') {
  globalThis.location.replace(buildCanonicalAuthUrl());
}
