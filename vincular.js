// ================================================================
// VINCULAR.JS — Invitación de ARM Veterinaria (vincular.html), pública
// Depende de: config.js, utils.js
//
// La clínica envía al dueño un enlace vincular.html?codigo=XXXXXXXX.
// Esta página muestra de qué veterinaria viene y qué mascotas incluye,
// guarda el código en el dispositivo y lleva al dueño a ingresar o
// crear su cuenta. La conexión en sí (vet_app_aceptar_invitacion) se
// hace dentro de la app con la sesión iniciada — ver modulo-veterinaria.js,
// que lee el mismo código guardado.
// ================================================================

(async () => {
    Utils.inicializarTema(document.getElementById('btnTema'));

    // Misma clave que VetApp (modulo-veterinaria.js).
    const CLAVE_CODIGO = 'arm_vet_codigo_pendiente';
    const contenedor = document.getElementById('vinContenido');

    const limpiar = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const formato = (c) => (c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c);
    const esc = (v) => (v === null || v === undefined ? '' : String(v))
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const guardar = (c) => { try { localStorage.setItem(CLAVE_CODIGO, c); } catch (_e) { /* modo privado */ } };
    const olvidar = () => { try { localStorage.removeItem(CLAVE_CODIGO); } catch (_e) { /* */ } };

    const { data: sesion } = await db.auth.getSession();
    const conSesion = !!(sesion && sesion.session);

    const codigoUrl = limpiar(new URLSearchParams(window.location.search).get('codigo'));
    if (codigoUrl.length >= 8) await mostrar(codigoUrl);
    else pedirCodigo();

    function pedirCodigo(mensaje) {
        contenedor.innerHTML = `
            <div class="vin-icono">🏥</div>
            <h1 class="vin-titulo">Conecta con tu veterinaria</h1>
            <p class="vin-texto">Ingresa el código de 8 caracteres que te envió tu veterinaria.</p>
            <form id="vinForm" class="vin-form" novalidate>
                <div class="input-wrap"><input id="vinCodigo" placeholder="Ej: K7Q4-MZ8B" maxlength="12" autocomplete="one-time-code" autocapitalize="characters"></div>
                <p class="field-msg ${mensaje ? 'msg-error' : ''}" id="vinMsg">${esc(mensaje || '')}</p>
                <button class="btn-primario" type="submit">Continuar</button>
            </form>`;
        contenedor.querySelector('#vinForm').addEventListener('submit', (ev) => {
            ev.preventDefault();
            const c = limpiar(contenedor.querySelector('#vinCodigo').value);
            if (c.length < 8) {
                const msg = contenedor.querySelector('#vinMsg');
                msg.textContent = 'El código tiene 8 caracteres.';
                msg.className = 'field-msg msg-error';
                return;
            }
            history.replaceState(null, '', `/vincular.html?codigo=${c}`);
            mostrar(c);
        });
    }

    async function mostrar(codigo) {
        contenedor.innerHTML = '<p>Buscando la invitación...</p>';
        const { data: vista, error } = await db.rpc('vet_app_ver_invitacion', { p_clave: codigo });
        if (error) { pedirCodigo('No pudimos revisar el código. Revisa tu conexión e intenta de nuevo.'); return; }

        if (vista.estado !== 'vigente') {
            olvidar();
            const textos = {
                inexistente: 'Este código no existe. Revísalo con tu veterinaria.',
                aceptada: 'Esta invitación ya fue usada. Si eres tú, ingresa a la app: tus mascotas ya están conectadas.',
                revocada: 'Este código fue reemplazado por uno nuevo. Pide el más reciente a tu veterinaria.',
                vencida: 'Este código venció. Pide uno nuevo a tu veterinaria.'
            };
            pedirCodigo(textos[vista.estado] || 'Código no válido.');
            return;
        }

        guardar(codigo);
        const c = vista.clinica || {};
        const mascotas = vista.mascotas || [];
        const nombres = mascotas.map((m) => m.nombre);
        const deQuien = nombres.length > 1 ? `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}` : (nombres[0] || 'tus mascotas');

        contenedor.innerHTML = `
            <div class="vin-clinica" style="--vin-color:${esc(c.color || '#0ea5a1')}">
                ${c.logo_url ? `<img src="${esc(c.logo_url)}" alt="">` : '<span class="vin-clinica-logo">🏥</span>'}
                <div><h1>${esc(c.nombre)}</h1>${c.comuna ? `<p>${esc(c.comuna)}</p>` : ''}</div>
            </div>
            <p class="vin-texto">Hola <b>${esc(vista.cliente)}</b> 👋<br>${esc(c.nombre)} te invita a ver en <b>ARM Mascotas</b> la información de ${esc(deQuien)}.</p>
            ${mascotas.length ? `<ul class="vin-mascotas">${mascotas.map((m) => `
                <li><span>${esc(m.emoji)}</span><b>${esc(m.nombre)}</b>${m.raza ? `<small>${esc(m.raza)}</small>` : ''}</li>`).join('')}</ul>` : ''}
            <ul class="vin-beneficios">
                <li>💉 Vacunas, desparasitaciones y próximas dosis</li>
                <li>🩺 Consultas, recetas y resultados de exámenes</li>
                <li>🔔 Recordatorios y avisos de la clínica en tu teléfono</li>
            </ul>
            <p class="vin-codigo">Código <b>${esc(formato(codigo))}</b></p>
            ${conSesion ? `
                <a class="btn-app btn-app-primario" href="/app.html?vet=vincular&codigo=${esc(codigo)}">Conectar en mi app</a>
            ` : `
                <div class="lista-apps">
                    <a class="btn-app btn-app-primario" href="/registro.html">Crear mi cuenta gratis</a>
                    <a class="btn-app" href="/index.html">Ya tengo cuenta · Ingresar</a>
                </div>
                <p class="vin-nota">Guardamos el código en este teléfono: al entrar terminarás de conectarte.</p>
            `}`;
    }
})();
