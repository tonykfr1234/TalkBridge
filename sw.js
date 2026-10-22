// Offline cache for the app shell. Translation and speech recognition still
// need a network connection; the app opens and shows saved meetings offline.
const VERSION = 'talkbridge-v1.4.0';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/ai.js', 'js/android.js', 'js/diarize.js', 'js/duedate.js', 'js/langs.js', 'js/whisper.js', 'js/tts.js', 'js/practice-data.js', 'js/speech.js', 'js/store.js',
  'js/textkit.js', 'js/translate.js', 'js/ui.js',
  'js/views/learn.js', 'js/views/meet.js', 'js/views/settings.js', 'js/views/subs.js', 'js/views/talk.js', 'js/views/voice.js',
  'js/vendor/anthropic-sdk.js',
  'assets/icon-192.png', 'assets/icon-512.png', 'assets/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Same-origin shell: network first so updates arrive, cache when offline.
  if (url.origin === self.location.origin) {
    e.respondWith(fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))));
    return;
  }
  // Fonts: cache after first use.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(e.request, copy));
      return res;
    })));
  }
  // Everything else (translation, Claude API) goes straight to the network.
});
