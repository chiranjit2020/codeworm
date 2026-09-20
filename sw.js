/* CODEWORM Build Lab — service worker.
   Goal: every page works offline after one visit, and content is always fresh
   when the network is there.

   Strategy
   - Same-origin files: network first (fresh whenever online), fall back to the
     cache. A slow network gives up after 3 s if there is a cached copy.
   - Everything else (mailto:, other origins): untouched. The site has no
     third-party requests: fonts are self-hosted and part of the shell.

   Bump VERSION when the SHELL list changes (files added/removed). Content
   edits do not need a bump: network-first picks them up. */
const VERSION = 'cw-v4';

const SHELL = [
  './',
  'index.html',
  'philosophy.html',
  'build-lab.html',
  'method.html',
  'labs.html',
  'about.html',
  'contact.html',
  'field-notes/',
  'field-notes/ai-code-engineering-judgment/',
  'css/styles.css',
  'js/main.js',
  'js/motion.js',
  'js/reading.js',
  'js/vendor/lenis.min.js',
  'favicon.svg',
  'fonts/manrope-latin.woff2',
  'fonts/space-grotesk-latin.woff2',
  'manifest.webmanifest',
  'img/codeworm-logo.png',
  'img/whatsapp.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

const NETWORK_TIMEOUT = 3000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) event.respondWith(networkFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(req, { ignoreSearch: true });

  // 'no-cache' = always revalidate with the server (a cheap 304 when unchanged),
  // so the browser's own HTTP cache can't serve content that is minutes stale.
  const network = fetch(req, { cache: 'no-cache' }).then((res) => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  });
  network.catch(() => {}); // the race below handles failure; avoid an unhandled rejection

  if (!cached) {
    try { return await network; } catch (err) { return offlineFallback(req, cache, err); }
  }
  try {
    return await Promise.race([
      network,
      new Promise((resolve) => setTimeout(() => resolve(cached), NETWORK_TIMEOUT)),
    ]);
  } catch (err) {
    return cached;
  }
}

async function offlineFallback(req, cache, err) {
  if (req.mode === 'navigate') {
    const home = await cache.match('index.html');
    if (home) return home;
  }
  throw err;
}
