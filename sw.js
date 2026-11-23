const prefix = 'voltyro-leki-shell-';
const version = prefix + '7';
const shell = ['./', './index.html', './style.css', './app.js', './pwa-push.js', './push-config.js', './data.js', './measurements.js', './measurements-data.js', './manifest.webmanifest',
  './favicon.svg', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
const urls = new Set(shell.map(path => new URL(path, self.registration.scope).href));

self.addEventListener('install', event => {
  event.waitUntil((async()=>{
    const cache=await caches.open(version);
    await cache.addAll(shell.map(path=>new Request(path,{cache:'reload'})));
    // The v5 client predates the update button. Make this transition available on its next launch.
    if(await caches.has(prefix+'5'))await self.skipWaiting();
  })());
});

self.addEventListener('message',event=>{
  if(event.data==='ACTIVATE_UPDATE')event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(prefix) && key !== version)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  const target = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (request.mode === 'navigate' &&
      (target.pathname === scope.pathname || target.pathname === scope.pathname+'index.html')) {
    event.respondWith(caches.open(version).then(cache => cache.match('./index.html')).then(saved => saved ?? fetch(request)));
  } else if (urls.has(request.url)) {
    event.respondWith(caches.open(version).then(cache => cache.match(request)).then(saved => saved ?? fetch(request)));
  }
});

self.addEventListener('push',event=>{
  let payload;
  try {payload=event.data?.json();} catch {return;}
  if(!['reminder','test'].includes(payload?.type)||typeof payload.tag!=='string'||
      !/^(?:test:\d{10,16}|\d{4}-\d{2}-\d{2}T\d{2}:\d{2})$/.test(payload.tag))return;
  const test=payload.type==='test';
  event.waitUntil(self.registration.showNotification(
    test?'Test przypomnienia':'VOLTYRO Leki PRO',{
      body:test?'To jest powiadomienie testowe.':'Sprawdź zaplanowane dawki w aplikacji.',
      icon:new URL('icon-192.png',self.registration.scope).href,
      tag:'voltyro-leki-'+payload.tag
    }));
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=self.registration.scope;
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const open=windows.find(client=>client.url.startsWith(target));
    if(open)return open.focus();
    return self.clients.openWindow(target);
  })());
});
