const CACHE_NAME = 'arancelsmart-pwa-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './src/styles/main.css',
  './src/js/app.js',
  './src/js/searchEngine.js',
  './src/js/calculator.js',
  './src/js/guidedClassifier.js',
  './src/js/companyResolver.js',
  './src/data/arancel2022.json',
  './src/assets/logo.jpg'
];

// Instalar Service Worker y precargar caché de la aplicación y base de datos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Precargando base de datos y assets offline...');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activar y limpiar cachés obsoletas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Eliminando caché antigua:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Estrategia de interceptación de red: Cache-First con Network Fallback
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Ignorar peticiones a APIs dinámicas (Gemini / Exchange Rate), intentar red primero
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        if (url.pathname === '/api/exchange-rate') {
          return new Response(JSON.stringify({
            source: 'SUNAT / SBS Oficial (Modo Offline Cache)',
            compra: 3.745,
            venta: 3.750,
            tipoCambioImportacion: 3.750,
            fecha: 'Hoy (Offline)',
            updated: false
          }), { headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({ error: 'Modo sin conexión. Conéctate a internet para usar IA en vivo.' }), {
          status: 533,
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // Cache-First para recursos estáticos y dataset arancelario
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Retornar de la caché inmediatamente y actualizar en segundo plano (Stale-While-Revalidate)
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {/* Offline fallback silencioso */});
        return cachedResponse;
      }
      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return response;
      });
    })
  );
});
