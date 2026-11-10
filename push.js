// ================================================================
// PUSH.JS — Notificaciones push de ARM Mascotas
// Depende de: config.js, utils.js
//
// Una sola suscripción por teléfono (tabla vet_push_suscripciones, con
// la clave VAPID de vet_push_config) sirve para todo lo que llega al
// teléfono: los recordatorios propios (agenda, vacunas,
// desparasitaciones, medicamentos — sql/020) y los avisos de ARM
// Veterinaria. No hace falta estar conectado a una clínica.
//
// Expone window.Push:
//   tarjeta(el)      estado + botones Activar / Enviar prueba / Desactivar
//   bannerInicio(el) invitación a activarlas en el inicio (se puede cerrar)
// ================================================================

const Push = (() => {

    const CLAVE_BANNER = 'arm_push_banner_oculto_hasta';

    function base64UrlABytes(b64) {
        const relleno = '='.repeat((4 - (b64.length % 4)) % 4);
        const bin = atob((b64 + relleno).replace(/-/g, '+').replace(/_/g, '/'));
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }
    function soporta() {
        return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    }
    function esIOSNoInstalada() {
        const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const instalada = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
        return ios && !instalada;
    }
    async function estado() {
        if (!soporta()) return esIOSNoInstalada() ? 'instalar_ios' : 'no_soportado';
        if (Notification.permission === 'denied') return 'bloqueado';
        const reg = await navigator.serviceWorker.getRegistration();
        if (!reg) return 'sin_sw';
        const sub = await reg.pushManager.getSubscription();
        return sub && Notification.permission === 'granted' ? 'activo' : 'inactivo';
    }
    async function activar() {
        const reg = await navigator.serviceWorker.ready;
        const permiso = await Notification.requestPermission();
        if (permiso !== 'granted') throw new Error('No diste permiso para notificaciones.');
        const { data, error } = await db.from('vet_push_config').select('application_server_key').eq('id', 1).maybeSingle();
        if (error) throw error;
        if (!data || !data.application_server_key) throw new Error('Las notificaciones se están configurando. Intenta en un minuto.');
        const clave = base64UrlABytes(data.application_server_key);
        let sub = await reg.pushManager.getSubscription();
        if (sub) {
            const actual = sub.options && sub.options.applicationServerKey ? new Uint8Array(sub.options.applicationServerKey) : null;
            if (actual && (actual.length !== clave.length || actual.some((b, i) => b !== clave[i]))) { await sub.unsubscribe(); sub = null; }
        }
        if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: clave });
        const j = sub.toJSON();
        const { error: e2 } = await db.rpc('vet_push_suscribir', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_user_agent: navigator.userAgent.slice(0, 300) });
        if (e2) throw e2;
    }
    async function desactivar() {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = reg && await reg.pushManager.getSubscription();
        if (sub) {
            await db.rpc('vet_push_desuscribir', { p_endpoint: sub.endpoint }).catch(() => {});
            await sub.unsubscribe().catch(() => {});
        }
    }
    async function probar() {
        const { error } = await db.rpc('mascotas_push_prueba');
        if (error) throw error;
    }

    // ── Tarjeta de estado (Agenda y Mi veterinaria) ──────────────
    const TEXTOS = {
        activo: '✅ Este teléfono recibe tus notificaciones: recordatorios, vacunas, tratamientos y avisos de tu veterinaria.',
        inactivo: '📲 Activa las notificaciones y te avisamos en el teléfono de cada recordatorio, vacuna, desparasitación y tratamiento.',
        bloqueado: '🔕 Bloqueaste las notificaciones en el navegador. Actívalas desde la configuración del sitio (candado junto a la dirección).',
        instalar_ios: '📲 En iPhone, primero agrega ARM Mascotas a la pantalla de inicio (Compartir → Agregar a inicio) y ábrela desde ahí.',
        no_soportado: 'Este navegador no admite notificaciones push. Igual verás todo en la agenda.',
        sin_sw: 'Recarga la página para activar las notificaciones.'
    };

    async function tarjeta(el) {
        if (!el) return;
        const est = await estado().catch(() => 'no_soportado');
        el.innerHTML = `
            <div class="vet-push vet-push-${est}">
                <p>${TEXTOS[est]}</p>
                ${est === 'inactivo' ? '<button class="btn-primario btn-ancho-auto btn-chico" data-push="activar">Activar notificaciones</button>' : ''}
                ${est === 'instalar_ios' ? '<a class="btn-secundario btn-chico" href="/instalar.html">Cómo instalar</a>' : ''}
                ${est === 'activo' ? '<button class="btn-secundario btn-chico" data-push="probar">Enviar prueba</button> <button class="btn-secundario btn-chico" data-push="desactivar">Desactivar</button>' : ''}
            </div>`;
        const on = (accion, fn) => { const b = el.querySelector(`[data-push="${accion}"]`); if (b) b.addEventListener('click', fn); };
        on('activar', async (ev) => {
            Utils.setLoading(ev.currentTarget, true, 'Activando...');
            try { await activar(); Utils.toast('Notificaciones activadas.', 'exito'); } catch (e) { Utils.toast(e.message, 'error'); }
            tarjeta(el);
        });
        on('probar', async () => {
            try { await probar(); Utils.toast('Enviada: llegará en menos de un minuto.', 'exito'); } catch (e) { Utils.toast(e.message, 'error'); }
        });
        on('desactivar', async () => { await desactivar(); tarjeta(el); });
    }

    // ── Invitación en el inicio ──────────────────────────────────
    function bannerOculto() {
        try { return Number(localStorage.getItem(CLAVE_BANNER) || 0) > Date.now(); } catch (_e) { return false; }
    }
    function ocultarBanner(dias) {
        try { localStorage.setItem(CLAVE_BANNER, String(Date.now() + dias * 86400000)); } catch (_e) { /* */ }
    }

    async function bannerInicio(el) {
        if (!el || bannerOculto()) return;
        const est = await estado().catch(() => 'no_soportado');
        if (est !== 'inactivo' && est !== 'instalar_ios') return;
        if (el.querySelector('.push-banner')) return;
        const caja = document.createElement('div');
        caja.className = 'push-banner';
        caja.innerHTML = est === 'inactivo'
            ? `<p>🔔 <b>Activa las notificaciones</b> y te avisamos en el teléfono de vacunas, desparasitaciones, tratamientos y tus recordatorios.</p>
               <div class="push-banner-acciones"><button class="btn-primario btn-chico btn-ancho-auto" data-push="activar">Activar</button>
               <button class="push-banner-cerrar" data-push="cerrar" aria-label="Ahora no">✕</button></div>`
            : `<p>🔔 Para recibir avisos de vacunas y recordatorios en tu iPhone, <b>agrega ARM Mascotas a la pantalla de inicio</b>.</p>
               <div class="push-banner-acciones"><a class="btn-primario btn-chico btn-ancho-auto" href="/instalar.html">Cómo hacerlo</a>
               <button class="push-banner-cerrar" data-push="cerrar" aria-label="Ahora no">✕</button></div>`;
        caja.querySelector('[data-push="cerrar"]').addEventListener('click', () => { ocultarBanner(14); caja.remove(); });
        const btn = caja.querySelector('[data-push="activar"]');
        if (btn) btn.addEventListener('click', async () => {
            Utils.setLoading(btn, true, 'Activando...');
            try {
                await activar();
                Utils.toast('Listo: te avisaremos en este teléfono.', 'exito');
                caja.remove();
            } catch (e) {
                Utils.setLoading(btn, false);
                Utils.toast(e.message, 'error');
            }
        });
        // Siempre en el mismo lugar: después de los avisos de la clínica
        // (que llegan después y se insertan bajo la cabecera), antes de
        // los accesos directos.
        const accesos = el.querySelector('#dashAccesos');
        const cab = el.querySelector('.dashboard-cabecera');
        if (accesos) accesos.before(caja); else if (cab) cab.after(caja); else el.prepend(caja);
    }

    return { estado, activar, desactivar, probar, tarjeta, bannerInicio };
})();

window.Push = Push;
