// ================================================================
// MODULO-AUTORIZACION-VET.JS — El dueño autoriza veterinarios
// Depende de: config.js, utils.js, auth.js
// Se monta dentro de la ficha de la mascota vía
// AutorizacionVet.init(el, mascotaId). Expone window.AutorizacionVet.
// ================================================================

const AutorizacionVet = (() => {

    let contenedor = null;
    let mascotaId = null;
    let autorizaciones = [];
    let encontrado = null; // veterinario resultado de la última búsqueda

    async function init(el, idMascota) {
        contenedor = el;
        mascotaId = idMascota;
        encontrado = null;
        el.innerHTML = `<div class="estado-vacio"><p>Cargando...</p></div>`;
        await cargarAutorizaciones();
        render();
    }

    async function cargarAutorizaciones() {
        const { data, error } = await db
            .from('mascotas_autorizaciones_veterinario')
            .select('*, mascotas_veterinarios(nombre, apellido, especialidad, correo, telefono)')
            .eq('mascota_id', mascotaId)
            .order('created_at', { ascending: false });

        if (error) {
            Utils.toast('No se pudieron cargar los veterinarios autorizados: ' + error.message, 'error');
            autorizaciones = [];
            return;
        }
        autorizaciones = data || [];
    }

    function render() {
        const filas = autorizaciones.map((a) => {
            const v = a.mascotas_veterinarios;
            const nombre = v ? `${v.nombre || ''} ${v.apellido || ''}`.trim() : 'Veterinario';
            return `
                <div class="historial-fila">
                    <div class="historial-fila-info">
                        <strong>${esc(nombre)}</strong>
                        <span class="historial-fila-sub">${v?.especialidad ? esc(v.especialidad) + ' · ' : ''}${esc(v?.correo)}</span>
                    </div>
                    <span class="badge-estado ${a.activo ? 'badge-aprobado' : 'badge-rechazado'}">${a.activo ? etiquetaPermiso(a.nivel_permiso) : 'Revocado'}</span>
                    ${a.activo ? `<button class="btn-peligro btn-vet-revocar" data-id="${a.id}">Revocar</button>` : ''}
                </div>
            `;
        }).join('');

        contenedor.innerHTML = `
            <div class="card historial-form-card">
                <form id="buscarVetForm" class="grid-2" novalidate>
                    <div class="field-group field-ancho-completo">
                        <label>Correo del veterinario</label>
                        <div class="input-wrap"><input type="email" id="vetCorreo" required placeholder="veterinario@ejemplo.com"></div>
                    </div>
                    <div class="field-msg field-ancho-completo" id="vetMensaje"></div>
                    <button type="submit" class="btn-secundario btn-ancho-auto field-ancho-completo" id="btnBuscarVet">Buscar veterinario</button>
                </form>

                ${encontrado ? `
                    <div class="vet-encontrado">
                        <div class="historial-fila-info">
                            <strong>${esc(encontrado.nombre)} ${esc(encontrado.apellido)}</strong>
                            <span class="historial-fila-sub">${encontrado.especialidad ? esc(encontrado.especialidad) + ' · ' : ''}${esc(encontrado.correo)}</span>
                        </div>
                        <div class="field-group">
                            <label>Nivel de acceso</label>
                            <div class="input-wrap">
                                <select id="vetNivel">
                                    <option value="lectura">Solo lectura</option>
                                    <option value="edicion">Puede editar (registrar historial clínico)</option>
                                </select>
                            </div>
                        </div>
                        <button type="button" class="btn-primario btn-ancho-auto" id="btnAutorizarVet">Autorizar</button>
                    </div>
                ` : ''}
            </div>

            ${autorizaciones.length ? `<div class="historial-lista">${filas}</div>` : `<div class="estado-vacio"><span class="estado-vacio-icono">🩺</span><p>Todavía no autorizaste a ningún veterinario.</p></div>`}
        `;
        wireEventos();
    }

    function wireEventos() {
        document.getElementById('buscarVetForm').addEventListener('submit', buscarVeterinario);

        const btnAutorizar = document.getElementById('btnAutorizarVet');
        if (btnAutorizar) btnAutorizar.addEventListener('click', autorizar);

        document.querySelectorAll('.btn-vet-revocar').forEach((btn) => {
            btn.addEventListener('click', () => revocar(btn.dataset.id));
        });
    }

    async function buscarVeterinario(ev) {
        ev.preventDefault();
        const mensaje = document.getElementById('vetMensaje');
        const btn = document.getElementById('btnBuscarVet');
        const correo = document.getElementById('vetCorreo').value.trim();

        if (!Utils.esEmailValido(correo)) {
            mensaje.textContent = 'Ingresa un correo válido.';
            mensaje.className = 'field-msg msg-error field-ancho-completo';
            return;
        }

        Utils.setLoading(btn, true, 'Buscando...');
        const { data, error } = await db
            .from('mascotas_veterinarios')
            .select('*')
            .eq('correo', correo)
            .eq('activo', true)
            .maybeSingle();
        Utils.setLoading(btn, false);

        if (error) {
            mensaje.textContent = error.message;
            mensaje.className = 'field-msg msg-error field-ancho-completo';
            return;
        }
        if (!data) {
            encontrado = null;
            mensaje.textContent = 'No encontramos un veterinario con ese correo. Pídele que te confirme el correo con el que está registrado en ARM Mascotas.';
            mensaje.className = 'field-msg msg-error field-ancho-completo';
            render();
            return;
        }
        if (autorizaciones.some((a) => a.veterinario_id === data.id && a.activo)) {
            encontrado = null;
            mensaje.textContent = 'Ese veterinario ya tiene acceso autorizado a esta mascota.';
            mensaje.className = 'field-msg msg-error field-ancho-completo';
            render();
            return;
        }

        encontrado = data;
        render();
    }

    async function autorizar() {
        if (!encontrado) return;
        const btn = document.getElementById('btnAutorizarVet');
        const nivel = document.getElementById('vetNivel').value;

        Utils.setLoading(btn, true);
        const { error } = await db.from('mascotas_autorizaciones_veterinario').insert({
            mascota_id: mascotaId,
            veterinario_id: encontrado.id,
            autorizado_por: window.appData.usuario.id,
            nivel_permiso: nivel
        });
        Utils.setLoading(btn, false);

        if (error) {
            Utils.toast('No se pudo autorizar: ' + error.message, 'error');
            return;
        }

        Utils.toast('Veterinario autorizado', 'exito');
        encontrado = null;
        await cargarAutorizaciones();
        render();
    }

    async function revocar(id) {
        if (!confirm('¿Revocar el acceso de este veterinario a la ficha de tu mascota?')) return;

        const { error } = await db
            .from('mascotas_autorizaciones_veterinario')
            .update({ activo: false, revocado_at: new Date().toISOString() })
            .eq('id', id);

        if (error) {
            Utils.toast('No se pudo revocar: ' + error.message, 'error');
            return;
        }

        Utils.toast('Acceso revocado', 'exito');
        await cargarAutorizaciones();
        render();
    }

    function etiquetaPermiso(nivel) {
        return { lectura: 'Solo lectura', edicion: 'Puede editar', admin: 'Administrador' }[nivel] || nivel;
    }

    function esc(v) {
        return (v || '').toString().replace(/"/g, '&quot;');
    }

    return { init };
})();

window.AutorizacionVet = AutorizacionVet;
