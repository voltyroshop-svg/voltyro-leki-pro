const prefix = 'voltyro-leki-shell-';
const version = prefix + '5';
const shell = ['./', './index.html', './style.css', './app.js', './data.js', './measurements.js', './measurements-data.js', './manifest.webmanifest',
  './favicon.svg', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
const urls = new Set(shell.map(path => new URL(path, self.registration.scope).href));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(version).then(cache => cache.addAll(shell.map(path => new Request(path, {cache: 'reload'})))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(prefix) && key !== version)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === 'navigate' && request.url.startsWith(self.registration.scope)) {
    event.respondWith(caches.open(version).then(cache => cache.match('./index.html')).then(saved => saved ?? fetch(request)));
  } else if (urls.has(request.url)) {
    event.respondWith(caches.open(version).then(cache => cache.match(request)).then(saved => saved ?? fetch(request)));
  }
});
