const ALLOWED_HOSTS = new Set([
  'facebook.com',
  'www.facebook.com',
  'm.facebook.com',
  'fb.watch',
  'www.fb.watch'
]);

const MAX_REDIRECTS = 6;
const ALLOWED_ORIGIN = 'https://twn9-tech.github.io';

function corsHeaders(origin = '') {
  const allowOrigin = origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN;
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function json(data, status, origin = '') {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function isFacebookUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && ALLOWED_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function cleanCanonicalUrl(value) {
  const url = new URL(value);
  url.hash = '';
  url.search = '';
  return url.toString();
}

async function resolveFacebookUrl(input) {
  let current = input;

  for (let attempt = 0; attempt < MAX_REDIRECTS; attempt += 1) {
    const response = await fetch(current, {
      method: 'GET',
      redirect: 'manual',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ReelFlowResolver/1.0)' }
    });

    if (response.status < 300 || response.status >= 400) {
      return cleanCanonicalUrl(current);
    }

    const location = response.headers.get('Location');
    if (!location) throw new Error('Redirect Facebook tidak memiliki tujuan.');

    const next = new URL(location, current);
    if (!ALLOWED_HOSTS.has(next.hostname.toLowerCase())) {
      throw new Error('Redirect keluar dari domain Facebook.');
    }
    current = next.toString();
  }

  throw new Error('Terlalu banyak redirect.');
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (url.pathname !== '/resolve' || request.method !== 'GET') {
      return json({ ok: false, error: 'Gunakan GET /resolve?url=...' }, 404, origin);
    }

    const input = url.searchParams.get('url');
    if (!input || !isFacebookUrl(input)) {
      return json({ ok: false, error: 'URL Facebook tidak valid.' }, 400, origin);
    }

    try {
      const resolved = await resolveFacebookUrl(input);
      const resolvedUrl = new URL(resolved);
      const isReel = /\/(reel|reels)\//i.test(resolvedUrl.pathname);
      return json({ ok: true, input, url: resolved, isReel }, 200, origin);
    } catch (error) {
      return json({ ok: false, error: error instanceof Error ? error.message : 'Gagal mengikuti redirect Facebook.' }, 502, origin);
    }
  }
};
