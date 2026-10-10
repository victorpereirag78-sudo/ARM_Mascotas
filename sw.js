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

const CACHE_NAME = 'arm-mascotas-v8';

const ARCHIVOS_SHELL = [
    '/index.html',
    '/registro.html',
    '/app.html',
    '/recuperar.html',
    '/actualizar-password.html',
    '/qr.html',
    '/pasaporte.html',
    '/login.css',
    '/registro.css',
    '/app.css',
    '/modulo-dashboard.css',
    '/modulo-perfil.css',
    '/modulo-mascota.css',
    '/modulo-compartir.css',
    '/modulo-historial.css',
    '/modulo-qr.css',
    '/modulo-autorizacion-vet.css',
    '/modulo-agenda.css',
    '/modulo-veterinario.css',
    '/modulo-admin.css',
    '/modulo-emergencia.css',
    '/modulo-perdida.css',
    '/modulo-pasaporte.css',
    '/modulo-veterinaria.css',
    '/qr-publico.css',
    '/pasaporte-publico.css',
    '/config.js',
    '/utils.js',
    '/auth.js',
    '/login.js',
    '/registro.js',
    '/recuperar.js',
    '/actualizar-password.js',
    '/app.js',
    '/modulo-dashboard.js',
    '/modulo-perfil.js',
    '/modulo-mascota.js',
    '/modulo-compartir.js',
    '/modulo-historial.js',
    '/modulo-qr.js',
    '/modulo-autorizacion-vet.js',
    '/modulo-agenda.js',
    '/modulo-veterinario.js',
    '/modulo-admin.js',
    '/modulo-emergencia.js',
    '/modulo-perdida.js',
    '/modulo-pasaporte.js',
    '/modulo-veterinaria.js',
    '/vincular.html',
    '/vincular.js',
    '/vincular.css',
    '/qr.js',
    '/pasaporte.js',
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

// ================================================================
// Web Push de ARM Veterinaria
// Llega cifrado desde la Edge Function vet-dispatch con
// { title, body, url, tag }. Al tocarlo se abre (o enfoca) la app en
// la pantalla del aviso.
// ================================================================
self.addEventListener('push', (evento) => {
    let d = {};
    try { d = evento.data ? evento.data.json() : {}; } catch (_e) { d = { body: evento.data ? evento.data.text() : '' }; }
    evento.waitUntil(
        self.registration.showNotification(d.title || 'ARM Mascotas', {
            body: d.body || '',
            icon: '/icons/icon-192.svg',
            badge: '/icons/icon-192.svg',
            tag: d.tag || undefined,
            data: { url: d.url || '/app.html?vet=notificaciones' }
        })
    );
});

self.addEventListener('notificationclick', (evento) => {
    evento.notification.close();
    const destino = new URL((evento.notification.data && evento.notification.data.url) || '/app.html', self.location.origin).href;
    evento.waitUntil((async () => {
        const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const v of ventanas) {
            if (new URL(v.url).origin === self.location.origin) {
                await v.focus();
                if ('navigate' in v) await v.navigate(destino);
                return;
            }
        }
        await self.clients.openWindow(destino);
    })());
});
