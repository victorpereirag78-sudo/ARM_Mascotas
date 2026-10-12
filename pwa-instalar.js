// ================================================================
// PWA-INSTALAR.JS — Instalación de la app desde un link
// No depende de nada. Expone window.PWAInstalar.
//
// Chrome/Edge/Android disparan `beforeinstallprompt`: se guarda el
// evento para abrir el cuadro nativo de instalación con un botón.
// iOS (Safari) no tiene ese evento: solo se puede explicar el paso
// "Compartir → Agregar al inicio", y desde otros navegadores de iOS
// o desde el navegador interno de WhatsApp/Instagram ni siquiera es
// posible — hay que abrir el link en Safari/Chrome.
//
// Cualquier elemento con [data-pwa-instalar] se muestra solo cuando
// la app NO está instalada (así los links "Instalar la app" desaparecen
// una vez instalada).
// ================================================================

const PWAInstalar = (() => {

    const ua = navigator.userAgent || '';
    const esIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const esAndroid = /android/i.test(ua);
    const enAppSocial = /FBAN|FBAV|Instagram|WhatsApp|Messenger|TikTok|Snapchat|Line\/|MicroMessenger|Twitter/i.test(ua);
    const esSafariIOS = esIOS && /safari/i.test(ua) && !/crios|fxios|edgios|opios|gsa\/|duckduckgo/i.test(ua) && !enAppSocial;

    let evento = null;
    let instaladaEnSesion = false;
    const oyentes = [];

    function estaInstalada() {
        return instaladaEnSesion
            || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
            || window.navigator.standalone === true;
    }

    function plataforma() {
        if (estaInstalada()) return 'instalada';
        if (enAppSocial) return 'navegador-interno';
        if (evento) return 'nativa';
        if (esIOS) return esSafariIOS ? 'ios-safari' : 'ios-otro';
        if (esAndroid) return 'android-manual';
        return 'escritorio';
    }

    function notificar() {
        actualizarElementos();
        oyentes.forEach((cb) => { try { cb(plataforma()); } catch (_e) { /* */ } });
    }

    function actualizarElementos() {
        const visible = !estaInstalada();
        document.querySelectorAll('[data-pwa-instalar]').forEach((el) => { el.hidden = !visible; });
    }

    async function instalar() {
        if (!evento) return 'no-disponible';
        const e = evento;
        evento = null;
        try {
            await e.prompt();
            const { outcome } = await e.userChoice;
            return outcome; // 'accepted' | 'dismissed'
        } catch (_e) {
            return 'error';
        } finally {
            notificar();
        }
    }

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        evento = e;
        notificar();
    });
    window.addEventListener('appinstalled', () => {
        instaladaEnSesion = true;
        evento = null;
        notificar();
    });

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', actualizarElementos);
    else actualizarElementos();

    return {
        estaInstalada,
        plataforma,
        puedeInstalarAhora: () => !!evento,
        instalar,
        alCambiar: (cb) => oyentes.push(cb),
        refrescar: actualizarElementos
    };
})();

window.PWAInstalar = PWAInstalar;
