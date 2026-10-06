'use strict';

const CACHE = 'leadership-interview-coach-v0.6.0-alpha-4-51d413de';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/config.js',
  './js/ui.js',
  './js/data.js',
  './js/storage.js',
  './js/home.js',
  './js/learn.js',
  './js/sim.js',
  './js/simulation.js',
  './js/evaluate-client.js',
  './js/recorder.js',
  './js/wake-lock.js',
  './js/report.js',
  './js/sessions.js',
  './js/competencies.js',
  './js/quick-review.js',
  './js/guidance.js',
  './js/self-intro.js',
  './js/search.js',
  './js/settings.js',
  './js/tools.js',
  './js/bookmarks.js',
  './data/reference.json',
  './data/expanded-model-answers.json',
  './data/derived/questions.json',
  './data/derived/competencies.json',
  './data/derived/mission-map.json',
  './data/derived/lessons.json',
  './data/derived/search-index.json',
  './data/derived/variants.json',
  './data/derived/curation.json',
  './data/derived/question-audit.json',
  './data/derived/manifest.json',
  './assets/images/abu-dhabi-sea-hero.jpg',
  './assets/fonts/NotoSansArabic-Regular.ttf',
  './assets/fonts/NotoSansArabic-Bold.ttf',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './assets/icons/apple-touch-icon-180.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy));
      }
      return response;
    }))
  );
});
