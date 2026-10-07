// ================================================================
// MODULO-VETERINARIA.JS — Conexión con ARM Veterinaria
// Depende de: config.js, utils.js, auth.js
//
// ARM Mascotas es la "App Mascotas" del ecosistema VETERINARIA + APP
// MASCOTAS. Lo que registra la clínica (vacunas, consultas, recetas,
// exámenes, hospitalización…) vive en las tablas vet_* y se LEE aquí
// con las funciones vet_app_* de la base: no se copia ni se edita.
// Cada registro muestra qué veterinaria lo generó.
//
// Expone:
//   window.VetApp       panel "Mi veterinaria" (bandeja, push, clínicas,
//                       vincular con código), vinculación en cuenta
//                       pendiente y decoración del dashboard.
//   window.CarpetaVet   carpeta médica de una mascota (ficha de mascota).
// ================================================================

const VetApp = (() => {

    const CLAVE_CODIGO = 'arm_vet_codigo_pendiente';
    let contenedor = null;

    // ── Utilidades ───────────────────────────────────────────────
    function h(v) {
        return (v === null || v === undefined ? '' : String(v))
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function fecha(iso) {
        if (!iso) return '—';
        return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? Utils.formatearFecha(iso)
            : new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    function fechaHora(iso) {
        if (!iso) return '—';
        const d = new Date(iso);
        return `${fecha(iso)} ${d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
    }
    function haceCuanto(iso) {
        const seg = (Date.now() - new Date(iso).getTime()) / 1000;
        if (seg < 60) return 'hace un momento';
        if (seg < 3600) return `hace ${Math.floor(seg / 60)} min`;
        if (seg < 86400) return `hace ${Math.floor(seg / 3600)} h`;
        const d = Math.floor(seg / 86400);
        return d === 1 ? 'ayer' : d < 30 ? `hace ${d} días` : fecha(iso);
    }
    function limpiarCodigo(v) {
        return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    }
    async function rpc(nombre, args) {
        const { data, error } = await db.rpc(nombre, args || {});
        if (error) throw error;
        return data;
    }

    // ── Código pendiente (llega por vincular.html o por la URL) ──
    function guardarCodigo(c) { try { localStorage.setItem(CLAVE_CODIGO, limpiarCodigo(c)); } catch (_e) { /* */ } }
    function leerCodigo() { try { return localStorage.getItem(CLAVE_CODIGO); } catch (_e) { return null; } }
    function olvidarCodigo() { try { localStorage.removeItem(CLAVE_CODIGO); } catch (_e) { /* */ } }

    // ── Panel "Mi veterinaria" ───────────────────────────────────
    async function init(el, opciones) {
        contenedor = el;
        el.innerHTML = '<div class="estado-vacio"><p>Cargando...</p></div>';
        let clinicas = [];
        let notificaciones = [];
        try {
            [clinicas, notificaciones] = await Promise.all([rpc('vet_app_mis_clinicas'), rpc('vet_app_notificaciones', { p_limite: 60 })]);
        } catch (e) {
            el.innerHTML = `<div class="estado-vacio"><p>No pudimos cargar la información de tu veterinaria: ${h(e.message)}</p></div>`;
            return;
        }
        const codigo = (opciones && opciones.codigo) || leerCodigo();

        el.innerHTML = `
            <div class="vet-panel">
                <section class="card vet-seccion" id="vetSeccionVincular"></section>
                <section class="card vet-seccion">
                    <div class="vet-seccion-cabecera">
                        <h3>🔔 Avisos de tu veterinaria</h3>
                        ${notificaciones.some((n) => !n.leida) ? '<button class="btn-secundario btn-chico" id="btnVetLeerTodo">Marcar todo como leído</button>' : ''}
                    </div>
                    <div id="vetPush"></div>
                    ${notificaciones.length ? `<ul class="vet-bandeja">${notificaciones.map(itemNotificacion).join('')}</ul>`
                        : '<p class="vet-vacio">Aquí llegarán los recordatorios de vacunas y controles, las recetas, los resultados de exámenes y las novedades de tus mascotas.</p>'}
                </section>
                <section class="vet-seccion-sin-card">
                    <h3 class="seccion-titulo">🏥 Mis veterinarias</h3>
                    ${clinicas.length ? `<div class="vet-clinicas">${clinicas.map(tarjetaClinica).join('')}</div>`
                        : '<p class="vet-vacio">Aún no estás conectado con ninguna veterinaria.</p>'}
                </section>
            </div>`;

        renderVinculacion(document.getElementById('vetSeccionVincular'), {
            codigo, compacto: clinicas.length > 0,
            alTerminar: async () => { await init(el); if (window.Mascota) await Mascota.cargarMascotas(); }
        });
        renderPush(document.getElementById('vetPush'));

        const btnLeer = document.getElementById('btnVetLeerTodo');
        if (btnLeer) btnLeer.addEventListener('click', async () => {
            await rpc('vet_app_marcar_leidas', { p_ids: null });
            actualizarInsignia();
            init(el);
        });
        el.querySelectorAll('.vet-notif[data-id]').forEach((li) => {
            li.addEventListener('click', async () => {
                if (li.classList.contains('no-leida')) {
                    await rpc('vet_app_marcar_leidas', { p_ids: [li.dataset.id] }).catch(() => {});
                    li.classList.remove('no-leida');
                    actualizarInsignia();
                }
                if (li.dataset.mascota) abrirMascota(li.dataset.mascota);
            });
        });
        actualizarInsignia();
    }

    function itemNotificacion(n) {
        return `
            <li class="vet-notif ${n.leida ? '' : 'no-leida'}" data-id="${h(n.id)}" ${n.mascota_app_id ? `data-mascota="${h(n.mascota_app_id)}"` : ''}>
                <div class="vet-notif-cuerpo">
                    <p class="vet-notif-titulo">${h(n.titulo)}</p>
                    ${n.mensaje ? `<p class="vet-notif-mensaje">${h(n.mensaje)}</p>` : ''}
                    <p class="vet-notif-meta">${h(n.clinica)} · ${haceCuanto(n.fecha)}</p>
                </div>
                ${n.leida ? '' : '<span class="vet-punto" aria-label="Sin leer"></span>'}
            </li>`;
    }

    function tarjetaClinica(c) {
        const wa = (c.whatsapp || '').replace(/\D/g, '');
        return `
            <div class="card vet-clinica" style="--vet-color:${h(c.color || '#0d9488')}">
                <div class="vet-clinica-cabecera">
                    ${c.logo_url ? `<img src="${h(c.logo_url)}" alt="">` : '<span class="vet-clinica-logo">🏥</span>'}
                    <div><h4>${h(c.nombre)}</h4><p>${h(c.direccion || '')}</p></div>
                </div>
                <div class="vet-clinica-acciones">
                    ${c.telefono ? `<a class="btn-secundario btn-chico" href="tel:${h(c.telefono)}">📞 Llamar</a>` : ''}
                    ${wa ? `<a class="btn-secundario btn-chico" target="_blank" rel="noopener" href="https://wa.me/${wa.length === 9 ? '56' + wa : wa}">💬 WhatsApp</a>` : ''}
                    ${c.telefono_emergencia ? `<a class="btn-peligro btn-chico" href="tel:${h(c.telefono_emergencia)}">🚨 Urgencias</a>` : ''}
                </div>
                <p class="vet-clinica-desde">Conectado desde el ${fecha(c.vinculado_en)}</p>
            </div>`;
    }

    // ── Vincular con el código de la veterinaria ─────────────────
    // opciones: { codigo, compacto, alTerminar, enCuentaPendiente }
    function renderVinculacion(el, opciones) {
        if (!el) return;
        opciones = opciones || {};
        const paso1 = () => {
            el.innerHTML = `
                <div class="vet-seccion-cabecera"><h3>🔗 ${opciones.compacto ? 'Conectar otra veterinaria' : 'Conecta con tu veterinaria'}</h3></div>
                ${opciones.compacto ? '' : `<p class="vet-texto">Si tu veterinaria usa <b>ARM Veterinaria</b>, te habrá enviado un código de 8 caracteres.
                    Al conectarte verás aquí las vacunas, controles, recetas, exámenes y avisos de tus mascotas — sin tener que anotar nada.</p>`}
                <form class="vet-codigo-form" id="vetFormCodigo">
                    <div class="input-wrap"><input id="vetCodigo" placeholder="Ej: K7Q4-MZ8B" maxlength="12" autocomplete="one-time-code" value="${h(opciones.codigo ? formatoCodigo(opciones.codigo) : '')}"></div>
                    <button class="btn-primario btn-ancho-auto" type="submit">Continuar</button>
                </form>
                <p class="field-msg" id="vetCodigoMsg"></p>`;
            el.querySelector('#vetFormCodigo').addEventListener('submit', async (ev) => {
                ev.preventDefault();
                const codigo = limpiarCodigo(el.querySelector('#vetCodigo').value);
                const msg = el.querySelector('#vetCodigoMsg');
                if (codigo.length < 8) { msg.textContent = 'El código tiene 8 caracteres.'; msg.className = 'field-msg msg-error'; return; }
                msg.textContent = 'Buscando...'; msg.className = 'field-msg';
                try {
                    const vista = await rpc('vet_app_ver_invitacion', { p_clave: codigo });
                    if (vista.estado !== 'vigente') {
                        olvidarCodigo();
                        const textos = { inexistente: 'El código no existe. Revísalo con tu veterinaria.', aceptada: 'Este código ya fue usado.',
                            revocada: 'Este código fue reemplazado. Pide uno nuevo a tu veterinaria.', vencida: 'El código venció. Pide uno nuevo a tu veterinaria.' };
                        msg.textContent = textos[vista.estado] || 'Código no válido.';
                        msg.className = 'field-msg msg-error';
                        return;
                    }
                    paso2(codigo, vista);
                } catch (e) {
                    msg.textContent = e.message; msg.className = 'field-msg msg-error';
                }
            });
            if (opciones.codigo && limpiarCodigo(opciones.codigo).length >= 8 && !opciones._autoIntentado) {
                opciones._autoIntentado = true;
                el.querySelector('#vetFormCodigo').requestSubmit();
            }
        };

        const paso2 = async (codigo, vista) => {
            // Mascotas propias para enlazar (si la cuenta ya puede verlas).
            let propias = [];
            if (!opciones.enCuentaPendiente) {
                const { data } = await db.from('mascotas').select('id,nombre,especie').eq('activo', true)
                    .eq('dueno_id', window.appData.usuario.id).order('nombre');
                propias = data || [];
            }
            const opcionesPropias = (m) => {
                const igual = propias.find((p) => p.nombre.trim().toLowerCase() === m.nombre.trim().toLowerCase());
                return `<option value="">Crear "${h(m.nombre)}" en mi app</option>` +
                    propias.map((p) => `<option value="${h(p.id)}" ${igual && igual.id === p.id ? 'selected' : ''}>Es mi ${h(p.nombre)}</option>`).join('');
            };
            el.innerHTML = `
                <div class="vet-preview">
                    <div class="vet-preview-clinica" style="--vet-color:${h(vista.clinica.color || '#0d9488')}">
                        ${vista.clinica.logo_url ? `<img src="${h(vista.clinica.logo_url)}" alt="">` : '<span class="vet-clinica-logo">🏥</span>'}
                        <div><h3>${h(vista.clinica.nombre)}</h3><p>${h(vista.clinica.comuna || '')}</p></div>
                    </div>
                    <p class="vet-texto">Hola <b>${h(vista.cliente)}</b>, ${h(vista.clinica.nombre)} quiere compartir contigo la información de:</p>
                    <ul class="vet-preview-mascotas">
                        ${vista.mascotas.map((m) => `
                            <li>
                                <span class="vet-preview-emoji">${h(m.emoji)}</span>
                                <span class="vet-preview-nombre"><b>${h(m.nombre)}</b><small>${h(m.raza || '')}</small></span>
                                ${propias.length ? `<div class="input-wrap vet-asignacion"><select data-paciente="${h(m.id)}">${opcionesPropias(m)}</select></div>` : ''}
                            </li>`).join('') || '<li>Aún no hay mascotas registradas.</li>'}
                    </ul>
                    ${propias.length ? '<p class="vet-nota">Si alguna ya está en tu app, elígela para no duplicarla.</p>' : '<p class="vet-nota">Las agregaremos a tu app con los datos de la clínica.</p>'}
                    <div class="vet-preview-acciones">
                        <button class="btn-secundario" id="vetVolver">Volver</button>
                        <button class="btn-primario btn-ancho-auto" id="vetAceptar">Conectar con ${h(vista.clinica.nombre)}</button>
                    </div>
                    <p class="field-msg" id="vetAceptarMsg"></p>
                </div>`;
            el.querySelector('#vetVolver').addEventListener('click', () => { opciones.codigo = ''; paso1(); });
            el.querySelector('#vetAceptar').addEventListener('click', async (ev) => {
                const btn = ev.currentTarget;
                const msg = el.querySelector('#vetAceptarMsg');
                const asignaciones = Array.from(el.querySelectorAll('select[data-paciente]'))
                    .map((s) => ({ paciente_id: s.dataset.paciente, mascota_app_id: s.value || null }));
                Utils.setLoading(btn, true, 'Conectando...');
                try {
                    const res = await rpc('vet_app_aceptar_invitacion', { p_clave: codigo, p_asignaciones: asignaciones });
                    olvidarCodigo();
                    Utils.toast(`¡Listo! Te conectaste con ${res.clinica}.`, 'exito');
                    if (opciones.alTerminar) await opciones.alTerminar(res);
                } catch (e) {
                    Utils.setLoading(btn, false);
                    msg.textContent = e.message; msg.className = 'field-msg msg-error';
                }
            });
        };

        paso1();
    }

    function formatoCodigo(c) {
        const l = limpiarCodigo(c);
        return l.length > 4 ? `${l.slice(0, 4)}-${l.slice(4)}` : l;
    }

    // ── Cuenta pendiente de aprobación: el código de la clínica la activa ─
    function ofrecerEnCuentaPendiente(cardEl) {
        const caja = document.createElement('div');
        caja.className = 'vet-bloqueada';
        cardEl.insertBefore(caja, cardEl.querySelector('#btnLogoutBloqueado'));
        renderVinculacion(caja, {
            codigo: new URLSearchParams(location.search).get('codigo') || leerCodigo(),
            enCuentaPendiente: true,
            alTerminar: () => { window.location.href = '/app.html?vet=inicio'; }
        });
    }

    // ── Insignia de avisos sin leer en el menú ───────────────────
    async function actualizarInsignia() {
        let n = 0;
        try {
            const { count } = await db.from('vet_notificaciones').select('id', { count: 'exact', head: true })
                .eq('usuario_id', window.appData.usuario.id).is('leida_en', null);
            n = count || 0;
        } catch (_e) { /* sin red */ }
        document.querySelectorAll('[data-panel="panel-veterinaria"]').forEach((btn) => {
            let b = btn.querySelector('.vet-insignia');
            if (!n) { if (b) b.remove(); return; }
            if (!b) { b = document.createElement('span'); b.className = 'vet-insignia'; btn.appendChild(b); }
            b.textContent = n > 9 ? '9+' : n;
        });
    }

    // ── Avisos en vivo (Realtime): llega una notificación nueva ──
    let canal = null;
    function escucharEnVivo() {
        if (canal || !window.appData.usuario) return;
        canal = db.channel('vet-notificaciones')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'vet_notificaciones', filter: `usuario_id=eq.${window.appData.usuario.id}` },
                (payload) => {
                    Utils.toast(payload.new.titulo, 'info');
                    actualizarInsignia();
                })
            .subscribe();
    }

    // ── Dashboard: próximos eventos de la veterinaria por mascota ─
    async function decorarDashboard(el) {
        let resumen;
        try { resumen = await rpc('vet_app_resumen'); } catch (_e) { return; }
        if (!resumen) return;
        (resumen.mascotas || []).forEach((m) => {
            const card = el.querySelector(`.dashboard-card[data-id="${m.mascota_app_id}"]`);
            if (!card) return;
            const pend = card.querySelector('.dashboard-card-pendientes');
            const linea = document.createElement('span');
            linea.className = 'pendiente-item vet-pendiente';
            linea.innerHTML = m.proximo
                ? `🏥 ${h(m.proximo.titulo.replace(/^\S+\s/, ''))} · <b>${fecha(m.proximo.fecha)}</b>`
                : `🏥 Al día con ${h(m.clinicas.map((c) => c.clinica).join(', '))}`;
            (pend || card).appendChild(linea);
        });
        if (resumen.no_leidas > 0) {
            const aviso = document.createElement('button');
            aviso.className = 'vet-banner';
            aviso.innerHTML = `🔔 Tienes <b>${resumen.no_leidas}</b> ${resumen.no_leidas === 1 ? 'aviso nuevo' : 'avisos nuevos'} de tu veterinaria <span>Ver →</span>`;
            aviso.addEventListener('click', () => irAPanel('panel-veterinaria'));
            const cab = el.querySelector('.dashboard-cabecera');
            if (cab) cab.after(aviso); else el.prepend(aviso);
        }
        if (!(resumen.clinicas || []).length) {
            const invita = document.createElement('button');
            invita.className = 'vet-banner vet-banner-suave';
            invita.innerHTML = '🏥 ¿Tu veterinaria usa ARM Veterinaria? <b>Conéctate con tu código</b> y ve aquí su historial. <span>Conectar →</span>';
            invita.addEventListener('click', () => irAPanel('panel-veterinaria'));
            const cab = el.querySelector('.dashboard-cabecera');
            if (cab) cab.after(invita);
        }
    }

    function abrirMascota(mascotaAppId) {
        sessionStorage.setItem('arm_abrir_mascota', mascotaAppId);
        irAPanel('panel-mascotas');
    }

    // ── Web Push ─────────────────────────────────────────────────
    function base64UrlABytes(b64) {
        const relleno = '='.repeat((4 - (b64.length % 4)) % 4);
        const bin = atob((b64 + relleno).replace(/-/g, '+').replace(/_/g, '/'));
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }
    function soportaPush() {
        return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    }
    function esIOSNoInstalada() {
        const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const instalada = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
        return ios && !instalada;
    }
    async function estadoPush() {
        if (!soportaPush()) return esIOSNoInstalada() ? 'instalar_ios' : 'no_soportado';
        if (Notification.permission === 'denied') return 'bloqueado';
        const reg = await navigator.serviceWorker.getRegistration();
        if (!reg) return 'sin_sw';
        const sub = await reg.pushManager.getSubscription();
        return sub && Notification.permission === 'granted' ? 'activo' : 'inactivo';
    }
    async function activarPush() {
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
        await rpc('vet_push_suscribir', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_user_agent: navigator.userAgent.slice(0, 300) });
    }
    async function desactivarPush() {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = reg && await reg.pushManager.getSubscription();
        if (sub) {
            await rpc('vet_push_desuscribir', { p_endpoint: sub.endpoint }).catch(() => {});
            await sub.unsubscribe().catch(() => {});
        }
    }
    async function renderPush(el) {
        if (!el) return;
        const estado = await estadoPush().catch(() => 'no_soportado');
        const textos = {
            activo: '✅ Este teléfono recibe notificaciones de tu veterinaria.',
            inactivo: '📲 Activa las notificaciones para enterarte al instante de vacunas, controles y novedades.',
            bloqueado: '🔕 Bloqueaste las notificaciones en el navegador. Actívalas desde la configuración del sitio.',
            instalar_ios: '📲 En iPhone, primero agrega ARM Mascotas a la pantalla de inicio (Compartir → Agregar a inicio).',
            no_soportado: 'Este navegador no admite notificaciones push. Igual verás los avisos aquí.',
            sin_sw: 'Recarga la página para activar las notificaciones.'
        };
        el.innerHTML = `
            <div class="vet-push vet-push-${estado}">
                <p>${textos[estado]}</p>
                ${estado === 'inactivo' ? '<button class="btn-primario btn-ancho-auto btn-chico" id="vetPushActivar">Activar notificaciones</button>' : ''}
                ${estado === 'activo' ? '<button class="btn-secundario btn-chico" id="vetPushPrueba">Enviar prueba</button> <button class="btn-secundario btn-chico" id="vetPushDesactivar">Desactivar</button>' : ''}
            </div>`;
        const on = (id, fn) => { const b = el.querySelector(id); if (b) b.addEventListener('click', fn); };
        on('#vetPushActivar', async (ev) => {
            Utils.setLoading(ev.currentTarget, true, 'Activando...');
            try { await activarPush(); Utils.toast('Notificaciones activadas.', 'exito'); } catch (e) { Utils.toast(e.message, 'error'); }
            renderPush(el);
        });
        on('#vetPushPrueba', async () => {
            try { await rpc('vet_push_prueba'); Utils.toast('Enviada: llegará en menos de un minuto.', 'exito'); } catch (e) { Utils.toast(e.message, 'error'); }
        });
        on('#vetPushDesactivar', async () => { await desactivarPush(); renderPush(el); });
    }

    return {
        init, renderVinculacion, ofrecerEnCuentaPendiente, decorarDashboard, actualizarInsignia, escucharEnVivo,
        guardarCodigo, leerCodigo, h, fecha, fechaHora, rpc
    };
})();

// ================================================================
// Carpeta médica de una mascota (lo que compartieron sus clínicas)
// ================================================================
const CarpetaVet = (() => {
    const { h, fecha, fechaHora, rpc } = VetApp;
    let datos = null;
    let pestana = 'resumen';
    let raiz = null;

    const PESTANAS = [
        ['resumen', 'Resumen'], ['vacunas', '💉 Vacunas'], ['desparasitaciones', '🛡️ Desparasitación'], ['tratamientos', '💊 Medicamentos'],
        ['consultas', '🩺 Consultas'], ['examenes', '🧪 Exámenes'], ['procedimientos', '🏥 Cirugías'], ['recetas', '📄 Recetas'],
        ['hospitalizaciones', '🛏️ Hospitalización'], ['documentos', '📎 Documentos'], ['pesos', '⚖️ Peso'], ['gastos', '💰 Gastos']
    ];

    async function init(el, mascota) {
        raiz = el;
        pestana = 'resumen';
        el.innerHTML = '<p class="vet-vacio">Cargando la carpeta médica...</p>';
        try {
            datos = await rpc('vet_app_historial', { p_mascota_app: mascota.id });
        } catch (_e) {
            el.innerHTML = `
                <p class="vet-vacio">Cuando tu veterinaria use <b>ARM Veterinaria</b>, aquí verás automáticamente las vacunas, consultas,
                recetas y exámenes de ${h(mascota.nombre)}.</p>
                <button class="btn-secundario btn-chico" id="vetIrConectar">Conectar con mi veterinaria</button>`;
            el.querySelector('#vetIrConectar').addEventListener('click', () => irAPanel('panel-veterinaria'));
            return;
        }
        datos.mascota = mascota;
        render();
    }

    function cuenta(clave) {
        const v = datos[clave];
        return Array.isArray(v) ? v.length : 0;
    }

    function render() {
        const visibles = PESTANAS.filter(([k]) => k === 'resumen' || (k === 'gastos' ? !!datos.gastos : cuenta(k) > 0));
        raiz.innerHTML = `
            <div class="vet-carpeta">
                <p class="vet-carpeta-origen">Información registrada por ${datos.clinicas.map((c) => `<b>${h(c.clinica)}</b>`).join(', ')} · solo lectura</p>
                <div class="vet-tabs" role="tablist">
                    ${visibles.map(([k, t]) => `<button role="tab" class="vet-tab ${k === pestana ? 'activa' : ''}" data-tab="${k}">${t}${k !== 'resumen' && k !== 'gastos' ? ` <span>${cuenta(k)}</span>` : ''}</button>`).join('')}
                </div>
                <div class="vet-tab-cuerpo">${contenido()}</div>
            </div>`;
        raiz.querySelectorAll('.vet-tab').forEach((b) => b.addEventListener('click', () => { pestana = b.dataset.tab; render(); }));
        raiz.querySelectorAll('[data-doc]').forEach((b) => b.addEventListener('click', () => abrirDocumento(b.dataset.doc)));
        raiz.querySelectorAll('[data-receta]').forEach((b) => b.addEventListener('click', () => imprimirReceta(b.dataset.receta)));
    }

    const etiquetaClinica = (c) => (datos.clinicas.length > 1 ? `<span class="vet-chip">${h(c)}</span>` : '');
    const item = (titulo, fechaTxt, detalle, clinica, extra) => `
        <li class="vet-item">
            <div class="vet-item-cabecera"><b>${titulo}</b><span>${fechaTxt}</span></div>
            ${detalle ? `<p>${detalle}</p>` : ''}
            ${extra || ''}
            <p class="vet-item-meta">${etiquetaClinica(clinica)}</p>
        </li>`;
    const lista = (arr, fn, vacio) => (arr && arr.length ? `<ul class="vet-lista">${arr.map(fn).join('')}</ul>` : `<p class="vet-vacio">${vacio}</p>`);
    const conVet = (r) => (r.veterinario ? ` · ${h(r.veterinario)}` : '');
    const multilinea = (t) => h(t).replace(/\n/g, '<br>');

    function contenido() {
        const hoy = Utils.hoy();
        switch (pestana) {
            case 'resumen': {
                const alergias = (datos.antecedentes || []).filter((a) => a.alergias);
                const vigentes = (datos.tratamientos || []).filter((t) => t.vigente);
                return `
                    ${alergias.length ? `<div class="vet-alerta">⚠️ <b>Alergias:</b> ${alergias.map((a) => h(a.alergias)).join(' · ')}</div>` : ''}
                    <div class="vet-resumen-grid">
                        <div class="vet-bloque">
                            <h4>📅 Próximos eventos</h4>
                            ${lista([...(datos.citas || []).map((c) => ({ tipo: 'cita', titulo: `Hora: ${c.motivo || c.tipo}`, fecha: c.inicio, clinica: c.clinica, hora: true })),
                                ...(datos.proximos || []).filter((p) => p.tipo !== 'cita')],
                                (p) => `<li class="vet-proximo ${!p.hora && p.fecha < hoy ? 'atrasado' : ''}"><span>${h(p.titulo.replace(/^\S+\s/, ''))}</span><b>${p.hora ? fechaHora(p.fecha) : fecha(p.fecha)}${!p.hora && p.fecha < hoy ? ' · atrasado' : ''}</b></li>`,
                                'Nada pendiente por ahora. 🎉')}
                        </div>
                        <div class="vet-bloque">
                            <h4>💊 Medicamentos vigentes</h4>
                            ${lista(vigentes, (t) => `<li class="vet-proximo"><span>${h(t.nombre)}</span><b>${h([t.dosis, t.frecuencia].filter(Boolean).join(' · '))}${t.fecha_termino ? ` hasta ${fecha(t.fecha_termino)}` : ''}</b></li>`, 'Sin medicamentos vigentes.')}
                        </div>
                        <div class="vet-bloque">
                            <h4>💉 Última vacuna</h4>
                            ${datos.vacunas.length ? `<p><b>${h(datos.vacunas[0].nombre)}</b> · ${fecha(datos.vacunas[0].fecha)}${datos.vacunas[0].proxima_dosis ? `<br>Próxima: ${fecha(datos.vacunas[0].proxima_dosis)}` : ''}</p>` : '<p class="vet-vacio">Sin vacunas registradas.</p>'}
                        </div>
                        <div class="vet-bloque">
                            <h4>🩺 Última atención</h4>
                            ${datos.consultas.length ? `<p><b>${h(datos.consultas[0].motivo || 'Consulta')}</b> · ${fecha(datos.consultas[0].fecha)}${datos.consultas[0].diagnostico ? `<br>${h(datos.consultas[0].diagnostico)}` : ''}</p>` : '<p class="vet-vacio">Sin atenciones registradas.</p>'}
                        </div>
                    </div>
                    ${emergencia()}`;
            }
            case 'vacunas':
                return lista(datos.vacunas, (v) => item(`💉 ${h(v.nombre)}`, fecha(v.fecha),
                    `${v.proxima_dosis ? `Próxima dosis: <b class="${v.proxima_dosis < hoy ? 'vet-rojo' : ''}">${fecha(v.proxima_dosis)}</b>` : 'Sin refuerzo indicado'}${v.lote ? ` · Lote ${h(v.lote)}` : ''}${conVet(v)}`, v.clinica), '');
            case 'desparasitaciones':
                return lista(datos.desparasitaciones, (d) => item(`🛡️ ${h(d.producto)}`, fecha(d.fecha),
                    `Desparasitación ${h(d.tipo)}${d.dosis ? ` · ${h(d.dosis)}` : ''}${d.proxima_aplicacion ? ` · próxima: <b>${fecha(d.proxima_aplicacion)}</b>` : ''}`, d.clinica), '');
            case 'tratamientos':
                return lista(datos.tratamientos, (t) => item(`💊 ${h(t.nombre)} ${t.vigente ? '<span class="vet-chip vet-chip-ok">Vigente</span>' : ''}`,
                    `${fecha(t.fecha_inicio)}${t.fecha_termino ? ` → ${fecha(t.fecha_termino)}` : ''}`,
                    `${h([t.dosis, t.frecuencia, t.duracion_dias ? t.duracion_dias + ' días' : null].filter(Boolean).join(' · '))}${t.indicaciones ? `<br>${multilinea(t.indicaciones)}` : ''}${conVet(t)}`, t.clinica), '');
            case 'consultas':
                return lista(datos.consultas, (c) => item(`🩺 ${h(c.motivo || 'Atención')}`, fechaHora(c.fecha),
                    [c.diagnostico && `<b>Diagnóstico:</b> ${multilinea(c.diagnostico)}`, c.tratamiento && `<b>Tratamiento:</b> ${multilinea(c.tratamiento)}`,
                        c.indicaciones && `<b>Indicaciones:</b> ${multilinea(c.indicaciones)}`, c.proximo_control && `<b>Próximo control:</b> ${fecha(c.proximo_control)}`,
                        c.peso && `Peso: ${h(c.peso)} kg`].filter(Boolean).join('<br>') + conVet(c), c.clinica), '');
            case 'examenes':
                return lista(datos.examenes, (e) => item(`🧪 ${h(e.nombre)}`, fecha(e.fecha_resultado || e.fecha_solicitud),
                    e.resultado ? multilinea(e.resultado) : `<i>${e.estado === 'resultado' ? 'Resultado disponible' : 'Esperando resultado'}</i>`, e.clinica,
                    documentosDe('examen', e.id)), '');
            case 'procedimientos':
                return lista(datos.procedimientos, (p) => item(`${p.tipo === 'cirugia' ? '🏥' : '🔬'} ${h(p.nombre)}`, fecha(p.fecha),
                    [p.diagnostico && `<b>Diagnóstico:</b> ${multilinea(p.diagnostico)}`, p.indicaciones && `<b>Indicaciones:</b> ${multilinea(p.indicaciones)}`,
                        p.fecha_control && `<b>Control:</b> ${fecha(p.fecha_control)}`].filter(Boolean).join('<br>') + conVet(p), p.clinica, documentosDe('procedimiento', p.id)), '');
            case 'recetas':
                return lista(datos.recetas, (r) => item(`📄 Receta N° ${h(r.folio)}`, fecha(r.fecha),
                    (r.items || []).map((i) => `• ${h(i.medicamento)}${i.dosis ? ` — ${h(i.dosis)}` : ''}${i.frecuencia ? `, ${h(i.frecuencia)}` : ''}${i.duracion ? `, ${h(i.duracion)}` : ''}`).join('<br>'),
                    r.clinica, `<button class="btn-secundario btn-chico" data-receta="${h(r.id)}">Ver / imprimir</button>`), '');
            case 'hospitalizaciones':
                return lista(datos.hospitalizaciones, (x) => item(`🛏️ ${h(x.motivo)} <span class="vet-chip ${x.estado === 'internado' ? 'vet-chip-aviso' : ''}">${x.estado === 'internado' ? 'Hospitalizado' : x.estado === 'alta' ? 'Alta' : h(x.estado)}</span>`,
                    `${fecha(x.fecha_ingreso)}${x.fecha_alta ? ` → ${fecha(x.fecha_alta)}` : ''}`,
                    `${x.indicaciones_alta ? `<b>Indicaciones de alta:</b><br>${multilinea(x.indicaciones_alta)}` : ''}${(x.novedades || []).length ? `<ul class="vet-novedades">${x.novedades.map((n) => `<li><b>${fechaHora(n.fecha)}</b> ${h(n.mensaje || '')}</li>`).join('')}</ul>` : ''}`, x.clinica), '');
            case 'documentos':
                return lista(datos.documentos, (d) => item(`📎 ${h(d.nombre)}`, fecha(d.fecha), h(d.descripcion || ''), d.clinica,
                    `<button class="btn-secundario btn-chico" data-doc="${h(d.ruta)}">Abrir</button>`), '');
            case 'pesos':
                return graficoPeso(datos.pesos);
            case 'gastos':
                return (datos.gastos || []).map((g) => `
                    <div class="vet-bloque"><h4>💰 ${h(g.clinica)}: $${Number(g.total).toLocaleString('es-CL')}</h4>
                    ${lista(g.grupos || [], (x) => `<li class="vet-proximo"><span>${h(x.grupo)}</span><b>$${Number(x.total).toLocaleString('es-CL')}</b></li>`, 'Sin compras.')}</div>`).join('');
        }
        return '';
    }

    function documentosDe(entidad, id) {
        const docs = (datos.documentos || []).filter((d) => d.entidad === entidad && d.entidad_id === id);
        return docs.length ? `<p>${docs.map((d) => `<button class="btn-secundario btn-chico" data-doc="${h(d.ruta)}">📎 ${h(d.nombre)}</button>`).join(' ')}</p>` : '';
    }

    function emergencia() {
        const clinicas = datos.clinicas.filter((c) => c.telefono_emergencia || c.telefono);
        if (!clinicas.length) return '';
        return `
            <div class="vet-bloque vet-emergencia">
                <h4>🚨 En caso de emergencia</h4>
                ${clinicas.map((c) => `<p><b>${h(c.clinica)}</b> ${c.telefono_emergencia ? `<a class="btn-peligro btn-chico" href="tel:${h(c.telefono_emergencia)}">Urgencias ${h(c.telefono_emergencia)}</a>` : ''}
                    ${c.telefono ? `<a class="btn-secundario btn-chico" href="tel:${h(c.telefono)}">📞 ${h(c.telefono)}</a>` : ''}</p>`).join('')}
            </div>`;
    }

    function graficoPeso(pesos) {
        if (!pesos || !pesos.length) return '<p class="vet-vacio">Sin registros de peso.</p>';
        const w = 560, alto = 180, m = 28;
        const valores = pesos.map((p) => Number(p.peso));
        const min = Math.min(...valores), max = Math.max(...valores);
        const rango = max - min || 1;
        const x = (i) => (pesos.length === 1 ? w / 2 : m + (i * (w - 2 * m)) / (pesos.length - 1));
        const y = (v) => alto - m - ((v - min) / rango) * (alto - 2 * m);
        const puntos = pesos.map((p, i) => `${x(i)},${y(Number(p.peso))}`).join(' ');
        return `
            <svg class="vet-grafico" viewBox="0 0 ${w} ${alto}" role="img" aria-label="Evolución del peso">
                <polyline points="${puntos}" fill="none" stroke="var(--color-primario)" stroke-width="2.5" stroke-linejoin="round"/>
                ${pesos.map((p, i) => `<circle cx="${x(i)}" cy="${y(Number(p.peso))}" r="4" fill="var(--color-primario)"><title>${fecha(p.fecha)}: ${p.peso} kg</title></circle>`).join('')}
                <text x="${m}" y="16" font-size="12" fill="currentColor" opacity=".6">${max} kg</text>
                <text x="${m}" y="${alto - 6}" font-size="12" fill="currentColor" opacity=".6">${min} kg</text>
            </svg>
            <ul class="vet-lista">${[...pesos].reverse().map((p) => `<li class="vet-proximo"><span>${fecha(p.fecha)}</span><b>${String(p.peso).replace('.', ',')} kg</b></li>`).join('')}</ul>`;
    }

    async function abrirDocumento(ruta) {
        const { data, error } = await db.storage.from('vet-privado').createSignedUrl(ruta, 600);
        if (error) { Utils.toast('No se pudo abrir el documento: ' + error.message, 'error'); return; }
        window.open(data.signedUrl, '_blank', 'noopener');
    }

    function imprimirReceta(id) {
        const r = datos.recetas.find((x) => x.id === id);
        if (!r) return;
        const s = r.snapshot || {};
        const v = window.open('', '_blank', 'width=720,height=900');
        if (!v) { Utils.toast('Permite las ventanas emergentes para ver la receta.', 'error'); return; }
        v.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Receta ${h(r.folio)}</title>
            <style>body{font-family:Inter,Arial,sans-serif;color:#15303a;margin:32px;font-size:14px}h1{font-size:20px;margin:0}
            .c{display:flex;justify-content:space-between;border-bottom:2px solid #15303a;padding-bottom:12px}.m{color:#587078;font-size:12px}
            .g{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:16px 0}.g div{border:1px solid #dfe8e8;border-radius:10px;padding:10px}
            .rp{font-size:28px;font-weight:700;font-style:italic}li{margin:10px 0}.f{margin-top:60px;text-align:right}
            .f div{display:inline-block;border-top:1px solid #15303a;padding-top:6px;text-align:center;min-width:240px}</style></head><body>
            <div class="c"><div><h1>${h(s.clinica && s.clinica.nombre)}</h1><p class="m">${h([s.clinica && s.clinica.direccion, s.clinica && s.clinica.telefono].filter(Boolean).join(' · '))}</p></div>
            <div style="text-align:right"><b>RECETA MÉDICO VETERINARIA</b><br>N° ${h(r.folio)}<br>${fecha(r.fecha)}</div></div>
            <div class="g"><div><b>Paciente:</b> ${h(s.paciente && s.paciente.nombre)}<br>${h([s.paciente && s.paciente.especie, s.paciente && s.paciente.raza, s.paciente && s.paciente.edad].filter(Boolean).join(' · '))}</div>
            <div><b>Propietario/a:</b> ${h(s.cliente && s.cliente.nombre)}<br>${h(s.cliente && s.cliente.telefono || '')}</div></div>
            <p class="rp">Rp.</p><ol>${(r.items || []).map((i) => `<li><b>${h(i.medicamento)}${i.presentacion ? ' — ' + h(i.presentacion) : ''}</b>${i.cantidad ? ' · Cant.: ' + h(i.cantidad) : ''}<br>
            ${h([i.dosis && 'Dosis: ' + i.dosis, i.via && 'Vía: ' + i.via, i.frecuencia && 'Frecuencia: ' + i.frecuencia, i.duracion && 'Duración: ' + i.duracion].filter(Boolean).join(' · '))}
            ${i.indicaciones ? '<br><span class="m">' + h(i.indicaciones) + '</span>' : ''}</li>`).join('')}</ol>
            ${r.indicaciones_generales ? `<p><b>Indicaciones:</b><br>${h(r.indicaciones_generales).replace(/\n/g, '<br>')}</p>` : ''}
            <div class="f"><div><b>${h(s.veterinario && s.veterinario.nombre)}</b><br><span class="m">${h([s.veterinario && s.veterinario.especialidad, s.veterinario && s.veterinario.registro_profesional].filter(Boolean).join(' · '))}</span></div></div>
            <script>window.onload=()=>window.print()<\/script></body></html>`);
        v.document.close();
    }

    return { init };
})();

window.VetApp = VetApp;
window.CarpetaVet = CarpetaVet;
