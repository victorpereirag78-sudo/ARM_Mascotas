// ================================================================
// MODULO-PERDIDA.JS — "Mi mascota está perdida"
// Depende de: config.js, utils.js, auth.js
// Se monta en la ficha de la mascota vía Perdida.init(el, mascota).
// Reutiliza el mismo QR permanente del collar (qr_token / qr.html)
// como el enlace/publicación a compartir: cuando hay una alerta
// activa, esa misma página pública muestra el aviso de emergencia.
// Expone window.Perdida.
// ================================================================

const Perdida = (() => {

    let contenedor = null;
    let mascota = null;
    let alerta = null;

    async function init(el, m) {
        contenedor = el;
        mascota = m;
        el.innerHTML = `<div class="estado-vacio"><p>Cargando...</p></div>`;
        await cargarAlerta();
        render();
    }

    async function cargarAlerta() {
        const { data, error } = await db
            .from('mascotas_alertas_perdida')
            .select('*')
            .eq('mascota_id', mascota.id)
            .eq('activa', true)
            .maybeSingle();

        if (error) {
            Utils.toast('No se pudo revisar el estado de la mascota: ' + error.message, 'error');
            alerta = null;
            return;
        }
        alerta = data;
    }

    function urlPublica() {
        return `${window.location.origin}/qr.html?t=${mascota.qr_token}`;
    }

    function render() {
        contenedor.innerHTML = alerta ? plantillaActiva() : plantillaInactiva();
        wireEventos();
    }

    function plantillaInactiva() {
        const perfil = window.appData.perfil;
        return `
            <div class="card perdida-card">
                <p class="perdida-estado-ok">✅ ${esc(mascota.nombre)} no está marcada como perdida.</p>
                <button type="button" class="btn-peligro btn-ancho-auto" id="btnAbrirFormPerdida">🚨 Marcar como perdida</button>

                <form id="perdidaForm" class="grid-2 perdida-form" hidden novalidate>
                    <div class="field-group field-ancho-completo">
                        <label>Descripción</label>
                        <div class="input-wrap"><input type="text" id="pDescripcion" placeholder="Ej: Se escapó por el patio trasero, collar rojo"></div>
                    </div>
                    <div class="field-group field-ancho-completo">
                        <label>Última ubicación conocida</label>
                        <div class="input-wrap"><input type="text" id="pUbicacionTexto" placeholder="Ej: Cerca de Av. Providencia con Los Leones"></div>
                    </div>
                    <div class="field-group field-ancho-completo">
                        <button type="button" class="btn-secundario" id="btnUsarUbicacion">📍 Usar mi ubicación actual</button>
                        <span class="perdida-ubicacion-estado" id="perdidaUbicacionEstado"></span>
                    </div>
                    <div class="field-group"><label>Nombre de contacto</label><div class="input-wrap"><input type="text" id="pContactoNombre" value="${esc(perfil.nombre)}"></div></div>
                    <div class="field-group"><label>Teléfono de contacto</label><div class="input-wrap"><input type="text" id="pContactoTelefono" value="${esc(perfil.telefono)}"></div></div>
                    <div class="field-msg field-ancho-completo" id="perdidaMensaje"></div>
                    <button type="submit" class="btn-peligro btn-ancho-auto field-ancho-completo">Activar alerta de mascota perdida</button>
                </form>
            </div>
        `;
    }

    function plantillaActiva() {
        const texto = `🚨 ${mascota.nombre} está perdida. Si la ves, contáctanos: ${urlPublica()}`;
        return `
            <div class="card perdida-card perdida-card-activa">
                <p class="perdida-estado-activa">🚨 ${esc(mascota.nombre)} está marcada como perdida desde ${formatearFechaHora(alerta.fecha_hora)}</p>
                ${alerta.descripcion ? `<p class="perdida-detalle"><strong>Descripción:</strong> ${esc(alerta.descripcion)}</p>` : ''}
                ${alerta.ultima_ubicacion_texto ? `<p class="perdida-detalle"><strong>Última ubicación:</strong> ${esc(alerta.ultima_ubicacion_texto)}</p>` : ''}
                ${alerta.ultima_ubicacion_lat ? `<p class="perdida-detalle"><a href="https://maps.google.com/?q=${alerta.ultima_ubicacion_lat},${alerta.ultima_ubicacion_lng}" target="_blank" rel="noopener">Ver en el mapa</a></p>` : ''}

                <div class="perdida-acciones">
                    <button type="button" class="btn-primario btn-ancho-auto" id="btnCompartirWhatsapp">📤 Compartir por WhatsApp</button>
                    <button type="button" class="btn-secundario" id="btnCopiarPerdida">Copiar enlace</button>
                </div>
                <input type="text" readonly value="${urlPublica()}" class="qr-link-input" id="perdidaLinkInput">

                <button type="button" class="btn-secundario btn-ancho-auto" id="btnMarcarEncontrada">✅ Marcar como encontrada</button>
                <div class="field-msg" id="perdidaMensaje"></div>
            </div>
            <script id="perdidaTextoCompartir" type="application/json">${JSON.stringify(texto)}</script>
        `;
    }

    function wireEventos() {
        const btnAbrir = document.getElementById('btnAbrirFormPerdida');
        if (btnAbrir) btnAbrir.addEventListener('click', () => {
            document.getElementById('perdidaForm').hidden = false;
            btnAbrir.hidden = true;
        });

        const btnUbicacion = document.getElementById('btnUsarUbicacion');
        if (btnUbicacion) btnUbicacion.addEventListener('click', usarUbicacionActual);

        const form = document.getElementById('perdidaForm');
        if (form) form.addEventListener('submit', activarAlerta);

        const btnWhatsapp = document.getElementById('btnCompartirWhatsapp');
        if (btnWhatsapp) btnWhatsapp.addEventListener('click', compartirWhatsapp);

        const btnCopiar = document.getElementById('btnCopiarPerdida');
        if (btnCopiar) btnCopiar.addEventListener('click', copiarLink);

        const btnEncontrada = document.getElementById('btnMarcarEncontrada');
        if (btnEncontrada) btnEncontrada.addEventListener('click', marcarEncontrada);
    }

    let ubicacionCapturada = null;

    function usarUbicacionActual() {
        const estado = document.getElementById('perdidaUbicacionEstado');
        if (!navigator.geolocation) {
            estado.textContent = 'Tu navegador no soporta geolocalización.';
            return;
        }
        estado.textContent = 'Obteniendo ubicación...';
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                ubicacionCapturada = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                estado.textContent = '✅ Ubicación capturada';
            },
            () => { estado.textContent = 'No pudimos obtener tu ubicación.'; },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    }

    async function activarAlerta(ev) {
        ev.preventDefault();
        const btn = ev.target.querySelector('button[type="submit"]');
        const mensaje = document.getElementById('perdidaMensaje');

        const payload = {
            mascota_id: mascota.id,
            activa: true,
            fecha_hora: new Date().toISOString(),
            descripcion: valor('pDescripcion'),
            ultima_ubicacion_texto: valor('pUbicacionTexto'),
            ultima_ubicacion_lat: ubicacionCapturada?.lat ?? null,
            ultima_ubicacion_lng: ubicacionCapturada?.lng ?? null,
            contacto_nombre: valor('pContactoNombre'),
            contacto_telefono: valor('pContactoTelefono'),
            creado_por: window.appData.usuario.id,
            encontrada_at: null
        };

        Utils.setLoading(btn, true);
        const { error } = await db.from('mascotas_alertas_perdida').insert(payload);
        Utils.setLoading(btn, false);

        if (error) {
            mensaje.textContent = error.message;
            mensaje.className = 'field-msg msg-error field-ancho-completo';
            return;
        }

        Utils.toast('Alerta de mascota perdida activada', 'exito');
        ubicacionCapturada = null;
        await cargarAlerta();
        render();
    }

    function compartirWhatsapp() {
        const texto = JSON.parse(document.getElementById('perdidaTextoCompartir').textContent);
        window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank');
    }

    function copiarLink() {
        const input = document.getElementById('perdidaLinkInput');
        input.select();
        if (navigator.clipboard) {
            navigator.clipboard.writeText(input.value)
                .then(() => Utils.toast('Enlace copiado', 'exito'))
                .catch(() => Utils.toast('No se pudo copiar, selecciona y copia manualmente', 'info'));
        }
    }

    async function marcarEncontrada() {
        if (!confirm(`¿Marcar a ${mascota.nombre} como encontrada? Se quitará el aviso de emergencia del QR público.`)) return;

        const { error } = await db
            .from('mascotas_alertas_perdida')
            .update({ activa: false, encontrada_at: new Date().toISOString() })
            .eq('id', alerta.id);

        if (error) {
            Utils.toast('No se pudo actualizar: ' + error.message, 'error');
            return;
        }

        Utils.toast(`¡Qué alegría! ${mascota.nombre} ya no aparece como perdida`, 'exito');
        await cargarAlerta();
        render();
    }

    function formatearFechaHora(iso) {
        if (!iso) return '';
        const fecha = Utils.formatearFecha(iso.slice(0, 10));
        const hora = iso.slice(11, 16);
        return hora ? `${fecha} ${hora}` : fecha;
    }

    function valor(id) {
        const el = document.getElementById(id);
        return el ? el.value.trim() || null : null;
    }

    function esc(v) {
        return (v || '').toString().replace(/"/g, '&quot;');
    }

    return { init };
})();

window.Perdida = Perdida;
