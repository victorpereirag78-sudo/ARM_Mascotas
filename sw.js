// ================================================================
// SW.JS — Service Worker de ARM Mascotas
// Cache-first para el shell estático; network-first (sin caché) para
// cualquier llamada a Supabase (Auth/REST/Storage), para no servir
// datos desactualizados ni respuestas no autorizadas.
//
// IMPORTANTE: subir CACHE_NAME en cada despliegue para invalidar el
// caché anterior (mismo criterio de versionado que los `?v=` de
// ARMUniversal, sin necesidad de un bundler).
// ================================================================

const CACHE_NAME = 'arm-mascotas-v1';

const ARCHIVOS_SHELL = [
    'index.html',
    'registro.html',
    'app.html',
    'login.css',
    'registro.css',
    'app.css',
    'modulo-dashboard.css',
    'modulo-perfil.css',
    'modulo-mascota.css',
    'modulo-compartir.css',
    'config.js',
    'utils.js',
    'auth.js',
    'login.js',
    'registro.js',
    'app.js',
    'modulo-dashboard.js',
    'modulo-perfil.js',
    'modulo-mascota.js',
    'modulo-compartir.js',
    'manifest.json',
    'icons/icon-192.svg',
    'icons/icon-512.svg',
    'icons/icon-maskable.svg'
];

self.addEventListener('install', (evento) => {
    evento.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(ARCHIVOS_SHELL))
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
        return; // network-first implícito: dejar pasar a la red, sin interceptar
    }

    evento.respondWith(
        caches.match(evento.request).then((cacheada) => {
            const enRed = fetch(evento.request)
                .then((respuesta) => {
                    if (respuesta && respuesta.ok) {
                        const copia = respuesta.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(evento.request, copia));
                    }
                    return respuesta;
                })
                .catch(() => cacheada);

            return cacheada || enRed;
        })
    );
});
