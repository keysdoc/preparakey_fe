const CACHE='preparakey-v16.11.0';
const ASSETS=['./','./index.html','./app.html','./offline.html','./css/styles.css','./js/config.js','./js/auth.js','./js/questions.js','./js/app.js','./manifest.webmanifest','./assets/keydoc-logo.png','./assets/apple-touch-icon.png','./assets/icons/icon-192.png','./assets/icons/icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>event.respondWith(caches.match(event.request).then(response=>response||fetch(event.request).catch(()=>caches.match('./offline.html').then(response=>response||caches.match('./index.html'))))));
