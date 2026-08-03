// ================================================================
// SW.JS — Service Worker de ARM Mascotas
// Navegaciones (HTML): red primero, caché solo como respaldo offline
// — así nunca queda pegado en un shell viejo ni se rompe si algún
// archivo no llegó a precachearse.
// Assets estáticos (css/js/íconos): caché primero con actualización
// en segundo plano.
// Supabase (Auth/REST/Storage): siempre red, nunca interceptado.
//
// IMPORTANTE: subir CACHE_NAME en cada despliegue para invalidar el
// caché anterior (mismo criterio de versionado que los `?v=` de
// ARMUniversal, sin necesidad de un bundler).
// ================================================================

const CACHE_NAME = 'arm-mascotas-v3';

const ARCHIVOS_SHELL = [
    '/index.html',
    '/registro.html',
    '/app.html',
    '/login.css',
    '/registro.css',
    '/app.css',
    '/modulo-dashboard.css',
    '/modulo-perfil.css',
    '/modulo-mascota.css',
    '/modulo-compartir.css',
    '/config.js',
    '/utils.js',
    '/auth.js',
    '/login.js',
    '/registro.js',
    '/app.js',
    '/modulo-dashboard.js',
    '/modulo-perfil.js',
    '/modulo-mascota.js',
    '/modulo-compartir.js',
    '/manifest.json',
    '/icons/icon-192.svg',
    '/icons/icon-512.svg',
    '/icons/icon-maskable.svg'
];

self.addEventListener('install', (evento) => {
    evento.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => Promise.all(
                // cache.add() individual por archivo: si uno falla no aborta
                // la instalación completa (a diferencia de cache.addAll).
                ARCHIVOS_SHELL.map((ruta) => cache.add(ruta).catch(() => {}))
            ))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (evento) => {
    evento.waitUntil(
        caches.keys()
            .then((nombres) => Promise.all(
                nombres.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (evento) => {
    const url = new URL(evento.request.url);
    const esMismoOrigen = url.origin === self.location.origin;
    const esSupabase = url.hostname.endsWith('supabase.co');

    if (evento.request.method !== 'GET' || esSupabase || !esMismoOrigen) {
        return; // se deja pasar a la red sin interceptar
    }

    // Navegaciones (carga de una página completa): red primero.
    if (evento.request.mode === 'navigate') {
        evento.respondWith(
            fetch(evento.request)
                .then((respuesta) => {
                    const copia = respuesta.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(evento.request, copia)).catch(() => {});
                    return respuesta;
                })
                .catch(() => caches.match(evento.request).then((cacheada) => cacheada || caches.match('/index.html')))
        );
        return;
    }

    // Assets estáticos: caché primero, red de respaldo/actualización.
    evento.respondWith(
        caches.match(evento.request).then((cacheada) => {
            if (cacheada) {
                fetch(evento.request)
                    .then((respuesta) => {
                        if (respuesta && respuesta.ok) {
                            caches.open(CACHE_NAME).then((cache) => cache.put(evento.request, respuesta)).catch(() => {});
                        }
                    })
                    .catch(() => {});
                return cacheada;
            }
            return fetch(evento.request).then((respuesta) => {
                if (respuesta && respuesta.ok) {
                    const copia = respuesta.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(evento.request, copia)).catch(() => {});
                }
                return respuesta;
            });
        })
    );
});
