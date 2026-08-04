// ================================================================
// MODULO-QR.JS — Ficha SOS + código QR de emergencia
// Depende de: config.js, utils.js, auth.js
// Se monta dentro de la ficha de la mascota vía QR.init(el, mascota).
// Expone window.QR.
// ================================================================

const QR = (() => {

    const ETIQUETAS_SEVERIDAD = { leve: 'Leve', moderada: 'Moderada', grave: 'Grave' };

    let contenedor = null;
    let mascota = null;
    let alergias = [];
    let medicamentosActivos = [];

    async function init(el, m) {
        contenedor = el;
        mascota = m;
        el.innerHTML = `<div class="estado-vacio"><p>Cargando...</p></div>`;
        await cargarDatos();
        render();
    }

    async function cargarDatos() {
        const [{ data: al }, { data: meds }] = await Promise.all([
            db.from('mascotas_alergias').select('*').eq('mascota_id', mascota.id).order('created_at', { ascending: false }),
            db.from('mascotas_medicamentos').select('nombre').eq('mascota_id', mascota.id).eq('recordatorio_activo', true)
        ]);
        alergias = al || [];
        medicamentosActivos = (meds || []).map((m) => m.nombre);
    }

    function render() {
        const perfil = window.appData.perfil;
        const visibilidad = mascota.qr_visibilidad || {};
        const urlPublica = `${window.location.origin}/qr.html?t=${mascota.qr_token}`;
        const qrImg = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(urlPublica)}`;

        const filasAlergias = alergias.map((a) => `
            <div class="historial-fila">
                <div class="historial-fila-info">
                    <strong>${esc(a.nombre)}</strong>
                    <span class="historial-fila-sub">${ETIQUETAS_SEVERIDAD[a.severidad] || 'Sin severidad'}${a.observaciones ? ' · ' + esc(a.observaciones) : ''}</span>
                </div>
                <button class="btn-peligro btn-alergia-eliminar" data-id="${a.id}">Eliminar</button>
            </div>
        `).join('');

        contenedor.innerHTML = `
            <div class="card sos-card">
                <h3 class="seccion-titulo">🆘 Ficha SOS</h3>
                <div class="sos-datos">
                    <div class="sos-item"><span class="sos-etiqueta">Alergias</span><span>${alergias.length ? alergias.map((a) => esc(a.nombre)).join(', ') : 'Ninguna registrada'}</span></div>
                    <div class="sos-item"><span class="sos-etiqueta">Medicamentos activos</span><span>${medicamentosActivos.length ? medicamentosActivos.map(esc).join(', ') : 'Ninguno'}</span></div>
                    <div class="sos-item"><span class="sos-etiqueta">Veterinario</span><span>${mascota.veterinario_habitual_id ? 'Asignado' : 'Sin veterinario asignado'}</span></div>
                    <div class="sos-item"><span class="sos-etiqueta">Contacto dueño</span><span>${esc(perfil.telefono) || 'Sin teléfono'}</span></div>
                    <div class="sos-item"><span class="sos-etiqueta">Contacto de emergencia</span><span>${perfil.contacto_emergencia_nombre ? esc(perfil.contacto_emergencia_nombre) + (perfil.contacto_emergencia_telefono ? ' · ' + esc(perfil.contacto_emergencia_telefono) : '') : 'Sin registrar'}</span></div>
                </div>

                <h4 class="seccion-titulo">Alergias registradas</h4>
                <form id="alergiaForm" class="grid-2" novalidate>
                    <div class="field-group"><label>Nombre *</label><div class="input-wrap"><input type="text" id="alNombre" required></div></div>
                    <div class="field-group"><label>Severidad</label><div class="input-wrap"><select id="alSeveridad">
                        <option value="leve">Leve</option>
                        <option value="moderada">Moderada</option>
                        <option value="grave">Grave</option>
                    </select></div></div>
                    <div class="field-group field-ancho-completo"><label>Observaciones</label><div class="input-wrap"><input type="text" id="alObs"></div></div>
                    <button type="submit" class="btn-primario btn-ancho-auto field-ancho-completo">Agregar alergia</button>
                </form>
                ${alergias.length ? `<div class="historial-lista">${filasAlergias}</div>` : ''}
            </div>

            <div class="card qr-card">
                <h3 class="seccion-titulo">Código QR de emergencia</h3>
                <p class="qr-descripcion">Cualquiera que escanee este código ve una ficha pública de emergencia con solo la información que autorices abajo. Ideal para la placa o collar de ${esc(mascota.nombre)}.</p>
                <div class="qr-contenido">
                    <img src="${qrImg}" alt="Código QR de ${esc(mascota.nombre)}" class="qr-imagen">
                    <div class="qr-acciones">
                        <input type="text" readonly value="${urlPublica}" class="qr-link-input" id="qrLinkInput">
                        <button type="button" class="btn-secundario" id="btnCopiarQR">Copiar enlace</button>
                    </div>
                </div>

                <h4 class="seccion-titulo">¿Qué se muestra públicamente?</h4>
                <div class="qr-visibilidad">
                    ${checkboxVisibilidad('mostrar_alergias', 'Alergias', visibilidad)}
                    ${checkboxVisibilidad('mostrar_medicamentos', 'Medicamentos activos', visibilidad)}
                    ${checkboxVisibilidad('mostrar_veterinario', 'Veterinario habitual', visibilidad)}
                    ${checkboxVisibilidad('mostrar_telefono_dueno', 'Mi teléfono', visibilidad)}
                    ${checkboxVisibilidad('mostrar_contacto_emergencia', 'Contacto de emergencia', visibilidad)}
                </div>
                <button type="button" class="btn-primario btn-ancho-auto" id="btnGuardarVisibilidad">Guardar visibilidad</button>
                <div class="field-msg" id="qrMensaje"></div>
            </div>
        `;
        wireEventos();
    }

    function checkboxVisibilidad(campo, etiqueta, visibilidad) {
        const checked = visibilidad[campo] ? 'checked' : '';
        return `<label class="check-inline qr-check"><input type="checkbox" class="qr-visibilidad-check" data-campo="${campo}" ${checked}> ${etiqueta}</label>`;
    }

    function wireEventos() {
        document.getElementById('alergiaForm').addEventListener('submit', guardarAlergia);
        document.querySelectorAll('.btn-alergia-eliminar').forEach((btn) => {
            btn.addEventListener('click', () => eliminarAlergia(btn.dataset.id));
        });
        document.getElementById('btnCopiarQR').addEventListener('click', copiarLink);
        document.getElementById('btnGuardarVisibilidad').addEventListener('click', guardarVisibilidad);
    }

    async function guardarAlergia(ev) {
        ev.preventDefault();
        const nombre = valor('alNombre');
        if (!nombre) return;

        const btn = ev.target.querySelector('button[type="submit"]');
        Utils.setLoading(btn, true);
        const { error } = await db.from('mascotas_alergias').insert({
            mascota_id: mascota.id,
            nombre,
            severidad: valor('alSeveridad'),
            observaciones: valor('alObs'),
            registrado_por: window.appData.usuario.id
        });
        Utils.setLoading(btn, false);

        if (error) return Utils.toast('No se pudo guardar: ' + error.message, 'error');
        Utils.toast('Alergia agregada', 'exito');
        await cargarDatos();
        render();
    }

    async function eliminarAlergia(id) {
        if (!confirm('¿Eliminar esta alergia?')) return;
        const { error } = await db.from('mascotas_alergias').delete().eq('id', id);
        if (error) return Utils.toast('No se pudo eliminar: ' + error.message, 'error');

        Utils.toast('Alergia eliminada', 'exito');
        await cargarDatos();
        render();
    }

    function copiarLink() {
        const input = document.getElementById('qrLinkInput');
        input.select();
        if (navigator.clipboard) {
            navigator.clipboard.writeText(input.value)
                .then(() => Utils.toast('Enlace copiado', 'exito'))
                .catch(() => Utils.toast('No se pudo copiar, selecciona y copia manualmente', 'info'));
        }
    }

    async function guardarVisibilidad() {
        const nueva = {};
        document.querySelectorAll('.qr-visibilidad-check').forEach((chk) => { nueva[chk.dataset.campo] = chk.checked; });

        const btn = document.getElementById('btnGuardarVisibilidad');
        const mensaje = document.getElementById('qrMensaje');
        Utils.setLoading(btn, true);
        const { error } = await db.from('mascotas').update({ qr_visibilidad: nueva }).eq('id', mascota.id);
        Utils.setLoading(btn, false);

        if (error) {
            mensaje.textContent = error.message;
            mensaje.className = 'field-msg msg-error';
            return;
        }

        mascota.qr_visibilidad = nueva;
        mensaje.textContent = 'Visibilidad actualizada.';
        mensaje.className = 'field-msg msg-exito';
        Utils.toast('Visibilidad guardada', 'exito');
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

window.QR = QR;
