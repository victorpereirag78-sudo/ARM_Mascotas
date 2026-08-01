// ================================================================
// MODULO-COMPARTIR.JS — Compartir mascotas con familiares (panel-compartir)
// Depende de: config.js, utils.js, auth.js, modulo-mascota.js
// Expone window.Compartir
// ================================================================

const Compartir = (() => {

    let contenedorActual = null;
    let misMascotas = [];
    let comparticionesEnviadas = [];
    let invitacionesRecibidas = [];

    async function init(el) {
        contenedorActual = el;
        el.innerHTML = `<div class="estado-vacio"><p>Cargando...</p></div>`;
        await cargarDatos();
        render();
    }

    async function cargarDatos() {
        await Mascota.cargarMascotas();
        misMascotas = (window.appData.mascotas || []).filter((m) => m.dueno_id === window.appData.usuario.id);

        const idsMascotas = misMascotas.map((m) => m.id);
        if (idsMascotas.length) {
            const { data } = await db
                .from('mascotas_compartidas')
                .select('*, mascotas(nombre)')
                .in('mascota_id', idsMascotas)
                .order('created_at', { ascending: false });
            comparticionesEnviadas = data || [];
        } else {
            comparticionesEnviadas = [];
        }

        const correo = window.appData.perfil.correo;
        const { data: recibidas } = await db
            .from('mascotas_compartidas')
            .select('*, mascotas(nombre, foto_url)')
            .eq('invitado_email', correo)
            .eq('estado', 'pendiente');
        invitacionesRecibidas = recibidas || [];
    }

    function render() {
        contenedorActual.innerHTML = `
            ${invitacionesRecibidas.length ? plantillaInvitacionesRecibidas() : ''}
            ${plantillaInvitarForm()}
            ${plantillaComparticionesEnviadas()}
        `;
        wireEventos();
    }

    function plantillaInvitacionesRecibidas() {
        const items = invitacionesRecibidas.map((inv) => `
            <div class="invitacion-item" data-id="${inv.id}">
                <span>Te invitaron a ver a <strong>${esc(inv.mascotas?.nombre)}</strong> (${etiquetaPermiso(inv.nivel_permiso)})</span>
                <div class="invitacion-acciones">
                    <button class="btn-primario btn-ancho-auto btn-aceptar-invitacion" data-id="${inv.id}">Aceptar</button>
                    <button class="btn-peligro btn-rechazar-invitacion" data-id="${inv.id}">Rechazar</button>
                </div>
            </div>
        `).join('');

        return `
            <div class="card compartir-seccion">
                <h3 class="seccion-titulo">Invitaciones recibidas</h3>
                ${items}
            </div>
        `;
    }

    function plantillaInvitarForm() {
        if (!misMascotas.length) {
            return `
                <div class="estado-vacio">
                    <span class="estado-vacio-icono">🤝</span>
                    <p>Registra una mascota primero para poder compartirla.</p>
                </div>
            `;
        }

        const opciones = misMascotas.map((m) => `<option value="${m.id}">${esc(m.nombre)}</option>`).join('');
        return `
            <div class="form-panel-embed compartir-seccion">
                <h3 class="seccion-titulo">Invitar a un familiar</h3>
                <form id="formInvitar" novalidate>
                    <div class="grid-2">
                        <div class="field-group">
                            <label>Mascota</label>
                            <div class="input-wrap"><select id="cMascota">${opciones}</select></div>
                        </div>
                        <div class="field-group">
                            <label>Correo del familiar</label>
                            <div class="input-wrap"><input type="email" id="cCorreo" required></div>
                        </div>
                        <div class="field-group">
                            <label>Nivel de acceso</label>
                            <div class="input-wrap">
                                <select id="cNivel">
                                    <option value="lectura">Solo lectura</option>
                                    <option value="edicion">Puede editar</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    <div class="field-msg" id="compartirMensaje"></div>
                    <button type="submit" class="btn-primario btn-ancho-auto" id="btnInvitar">Enviar invitación</button>
                </form>
            </div>
        `;
    }

    function plantillaComparticionesEnviadas() {
        if (!comparticionesEnviadas.length) return '';

        const filas = comparticionesEnviadas.map((c) => `
            <div class="comparticion-fila" data-id="${c.id}">
                <div>
                    <strong>${esc(c.mascotas?.nombre)}</strong>
                    <span class="comparticion-correo">${esc(c.invitado_email)}</span>
                </div>
                <span class="badge-estado badge-${c.estado}">${etiquetaEstado(c.estado)}</span>
                <span class="comparticion-nivel">${etiquetaPermiso(c.nivel_permiso)}</span>
                <button class="btn-peligro btn-revocar" data-id="${c.id}">Revocar</button>
            </div>
        `).join('');

        return `
            <div class="card compartir-seccion">
                <h3 class="seccion-titulo">Accesos compartidos</h3>
                ${filas}
            </div>
        `;
    }

    function wireEventos() {
        const formInvitar = document.getElementById('formInvitar');
        if (formInvitar) formInvitar.addEventListener('submit', invitar);

        document.querySelectorAll('.btn-aceptar-invitacion').forEach((btn) => {
            btn.addEventListener('click', () => responderInvitacion(btn.dataset.id, 'aceptada'));
        });
        document.querySelectorAll('.btn-rechazar-invitacion').forEach((btn) => {
            btn.addEventListener('click', () => responderInvitacion(btn.dataset.id, 'rechazada'));
        });
        document.querySelectorAll('.btn-revocar').forEach((btn) => {
            btn.addEventListener('click', () => revocar(btn.dataset.id));
        });
    }

    async function invitar(ev) {
        ev.preventDefault();
        const btn = document.getElementById('btnInvitar');
        const mensaje = document.getElementById('compartirMensaje');

        const mascotaId = document.getElementById('cMascota').value;
        const correo = document.getElementById('cCorreo').value.trim();
        const nivel = document.getElementById('cNivel').value;

        if (!Utils.esEmailValido(correo)) {
            mensaje.textContent = 'Ingresa un correo válido.';
            mensaje.className = 'field-msg msg-error';
            return;
        }

        Utils.setLoading(btn, true);
        const { error } = await db.from('mascotas_compartidas').insert({
            mascota_id: mascotaId,
            invitado_email: correo,
            nivel_permiso: nivel,
            invitado_por: window.appData.usuario.id
        });
        Utils.setLoading(btn, false);

        if (error) {
            mensaje.textContent = /duplicate|unique/i.test(error.message)
                ? 'Ya invitaste a esa persona a esta mascota.'
                : error.message;
            mensaje.className = 'field-msg msg-error';
            return;
        }

        Utils.toast('Invitación enviada', 'exito');
        await cargarDatos();
        render();
    }

    async function responderInvitacion(id, estado) {
        const { error } = await db
            .from('mascotas_compartidas')
            .update({ estado, respondido_at: new Date().toISOString(), invitado_perfil_id: window.appData.usuario.id })
            .eq('id', id);

        if (error) {
            Utils.toast('No se pudo responder: ' + error.message, 'error');
            return;
        }

        Utils.toast(estado === 'aceptada' ? 'Invitación aceptada' : 'Invitación rechazada', 'exito');
        await cargarDatos();
        render();
    }

    async function revocar(id) {
        if (!confirm('¿Revocar este acceso compartido?')) return;

        const { error } = await db.from('mascotas_compartidas').delete().eq('id', id);
        if (error) {
            Utils.toast('No se pudo revocar: ' + error.message, 'error');
            return;
        }

        Utils.toast('Acceso revocado', 'exito');
        await cargarDatos();
        render();
    }

    function etiquetaEstado(estado) {
        return { pendiente: 'Pendiente', aceptada: 'Aceptada', rechazada: 'Rechazada' }[estado] || estado;
    }

    function etiquetaPermiso(nivel) {
        return { lectura: 'Solo lectura', edicion: 'Puede editar', admin: 'Administrador' }[nivel] || nivel;
    }

    function esc(v) {
        return (v || '').toString().replace(/"/g, '&quot;');
    }

    return { init };
})();

window.Compartir = Compartir;
