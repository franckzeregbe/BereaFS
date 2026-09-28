/**
 * BereaFS Service Worker — Cache intelligent
 * Stratégie: Cache First pour les assets, Network First pour les API
 */
const CACHE_NAME = 'bereafs-v4';
const STATIC_CACHE = [
    '/academie',
    '/client/index.html',
    '/client/dashboard.html',
    '/client/lesson-streaming.html',
    '/client/assets/js/api.js',
    '/client/assets/js/auth.js',
    '/client/assets/js/app.js',
    '/client/assets/js/notifications.js',
    '/client/assets/js/security.js',
    '/client/assets/js/pwa.js',
    '/client/assets/css/styles.css',
    '/client/assets/icons/icon-192.svg',
    '/client/assets/icons/icon-512.svg',
    '/client/manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_CACHE).catch(() => {}))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) => Promise.all(
            names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))
        ))
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    // Ne jamais cacher les API calls ni le service worker
    if (request.url.includes('/api/')) return;
    if (request.url.includes('/client/sw.js')) return;

    event.respondWith(
        caches.match(request).then((cached) => {
            const fetchPromise = fetch(request).then((response) => {
                if (response && response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                }
                return response;
            }).catch(() => cached);

            return cached || fetchPromise;
        })
    );
});
