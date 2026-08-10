// ================================================================
// MODULO-ADMIN.JS — Aprobación de cuentas (panel-admin, solo rol admin)
// Depende de: config.js, utils.js, auth.js
// Expone window.Admin
// ================================================================

const Admin = (() => {

    let contenedorActual = null;
    let perfiles = [];
    let filtro = 'pendiente';
    let formVeterinarioAbierto = null; // id de perfil con el form de "convertir en veterinario" abierto

    const ETIQUETAS_ESTADO = {
        pendiente: 'Pendiente',
        aprobado: 'Aprobado',
        rechazado: 'Rechazado',
        suspendido: 'Suspendido'
    };

    async function init(el) {
        contenedorActual = el;
        el.innerHTML = `<div class="estado-vacio"><p>Cargando...</p></div>`;
        await cargarPerfiles();
        render();
    }

    async function cargarPerfiles() {
        const { data, error } = await db
            .from('mascotas_perfiles')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            Utils.toast('No se pudieron cargar las cuentas: ' + error.message, 'error');
            perfiles = [];
            return;
        }
        perfiles = data;
    }

    function render() {
        const visibles = filtro === 'todos' ? perfiles : perfiles.filter((p) => p.estado_cuenta === filtro);

        contenedorActual.innerHTML = `
            <div class="admin-tabs" id="adminTabs">
                ${tabBoton('pendiente', 'Pendientes')}
                ${tabBoton('aprobado', 'Aprobadas')}
                ${tabBoton('rechazado', 'Rechazadas')}
                ${tabBoton('suspendido', 'Suspendidas')}
                ${tabBoton('todos', 'Todas')}
            </div>
            ${visibles.length ? `<div class="admin-lista">${visibles.map(filaPerfil).join('')}</div>` : plantillaEstadoVacio()}
        `;
        wireEventos();
    }

    function tabBoton(valor, etiqueta) {
        const conteo = valor === 'todos' ? perfiles.length : perfiles.filter((p) => p.estado_cuenta === valor).length;
        return `<button class="admin-tab ${filtro === valor ? 'activo' : ''}" data-filtro="${valor}">${etiqueta} (${conteo})</button>`;
    }

    function plantillaEstadoVacio() {
        return `
            <div class="estado-vacio">
                <span class="estado-vacio-icono">🛡️</span>
                <p>No hay cuentas en este estado.</p>
            </div>
        `;
    }

    function filaPerfil(p) {
        const esUnoMismo = p.id === window.appData.usuario.id;
        const nombreCompleto = `${p.nombre || ''} ${p.apellido || ''}`.trim() || p.correo;
        const ubicacion = [p.ciudad, p.region, p.pais].filter(Boolean).join(', ');
        const puedeConvertirVet = !esUnoMismo && p.estado_cuenta === 'aprobado' && p.rol === 'dueno';

        return `
            <div class="admin-fila" data-id="${p.id}">
                <div class="admin-fila-info">
                    <strong>${esc(nombreCompleto)}</strong>
                    <span class="admin-fila-correo">${esc(p.correo)}</span>
                    ${ubicacion ? `<span class="admin-fila-ubicacion">${esc(ubicacion)}</span>` : ''}
                    <span class="admin-fila-fecha">Registrado: ${Utils.formatearFecha((p.created_at || '').slice(0, 10))} · Rol: ${etiquetaRol(p.rol)}</span>
                </div>
                <span class="badge-estado badge-${p.estado_cuenta}">${ETIQUETAS_ESTADO[p.estado_cuenta] || p.estado_cuenta}</span>
                <div class="admin-fila-acciones">
                    ${esUnoMismo ? '<span class="admin-fila-tu">(tú)</span>' : accionesPara(p)}
                    ${puedeConvertirVet ? `<button class="btn-secundario btn-toggle-vet" data-id="${p.id}">Convertir en veterinario</button>` : ''}
                    <button class="btn-secundario btn-enviar-reset" data-correo="${esc(p.correo)}">Enviar reset de contraseña</button>
                </div>
            </div>
            ${formVeterinarioAbierto === p.id ? formConvertirVet(p) : ''}
        `;
    }

    function formConvertirVet(p) {
        return `
            <div class="card admin-form-vet" data-id="${p.id}">
                <h4 class="seccion-titulo">Datos profesionales de ${esc(p.nombre) || 'este usuario'}</h4>
                <form id="formVeterinario" data-id="${p.id}" class="grid-2" novalidate>
                    <div class="field-group"><label>N° de colegiatura</label><div class="input-wrap"><input type="text" id="vetColegiatura"></div></div>
                    <div class="field-group"><label>Especialidad</label><div class="input-wrap"><input type="text" id="vetEspecialidad" placeholder="Ej: Medicina general"></div></div>
                    <div class="field-group field-ancho-completo"><label>Teléfono</label><div class="input-wrap"><input type="text" id="vetTelefono" value="${esc(p.telefono)}"></div></div>
                    <div class="field-msg field-ancho-completo" id="vetAdminMensaje"></div>
                    <button type="submit" class="btn-primario btn-ancho-auto field-ancho-completo">Crear perfil de veterinario</button>
                </form>
            </div>
        `;
    }

    function etiquetaRol(rol) {
        return { dueno: 'Dueño', veterinario: 'Veterinario', clinica: 'Clínica', admin: 'Admin' }[rol] || rol;
    }

    function accionesPara(p) {
        const botones = [];
        if (p.estado_cuenta === 'pendiente') {
            botones.push(btnAccion(p.id, 'aprobado', 'Aprobar', 'btn-primario'));
            botones.push(btnAccion(p.id, 'rechazado', 'Rechazar', 'btn-peligro'));
        } else if (p.estado_cuenta === 'aprobado') {
            botones.push(btnAccion(p.id, 'suspendido', 'Suspender', 'btn-peligro'));
        } else if (p.estado_cuenta === 'rechazado' || p.estado_cuenta === 'suspendido') {
            botones.push(btnAccion(p.id, 'aprobado', 'Aprobar', 'btn-primario'));
        }
        return botones.join('');
    }

    function btnAccion(id, nuevoEstado, etiqueta, clase) {
        return `<button class="${clase} btn-ancho-auto btn-cambiar-estado" data-id="${id}" data-estado="${nuevoEstado}">${etiqueta}</button>`;
    }

    function wireEventos() {
        document.querySelectorAll('.admin-tab').forEach((btn) => {
            btn.addEventListener('click', () => {
                filtro = btn.dataset.filtro;
                render();
            });
        });

        document.querySelectorAll('.btn-cambiar-estado').forEach((btn) => {
            btn.addEventListener('click', () => cambiarEstado(btn.dataset.id, btn.dataset.estado));
        });

        document.querySelectorAll('.btn-enviar-reset').forEach((btn) => {
            btn.addEventListener('click', () => enviarReset(btn));
        });

        document.querySelectorAll('.btn-toggle-vet').forEach((btn) => {
            btn.addEventListener('click', () => {
                formVeterinarioAbierto = formVeterinarioAbierto === btn.dataset.id ? null : btn.dataset.id;
                render();
            });
        });

        const formVet = document.getElementById('formVeterinario');
        if (formVet) formVet.addEventListener('submit', convertirEnVeterinario);
    }

    async function convertirEnVeterinario(ev) {
        ev.preventDefault();
        const perfilId = ev.target.dataset.id;
        const perfil = perfiles.find((p) => p.id === perfilId);
        const mensaje = document.getElementById('vetAdminMensaje');
        const btn = ev.target.querySelector('button[type="submit"]');

        Utils.setLoading(btn, true);

        const { error: errorRol } = await db
            .from('mascotas_perfiles')
            .update({ rol: 'veterinario' })
            .eq('id', perfilId);

        if (errorRol) {
            Utils.setLoading(btn, false);
            mensaje.textContent = errorRol.message;
            mensaje.className = 'field-msg msg-error field-ancho-completo';
            return;
        }

        const { error: errorVet } = await db.from('mascotas_veterinarios').insert({
            perfil_id: perfilId,
            nombre: perfil.nombre || '',
            apellido: perfil.apellido,
            numero_colegiatura: valor('vetColegiatura'),
            especialidad: valor('vetEspecialidad'),
            telefono: valor('vetTelefono'),
            correo: perfil.correo
        });

        Utils.setLoading(btn, false);

        if (errorVet) {
            mensaje.textContent = errorVet.message;
            mensaje.className = 'field-msg msg-error field-ancho-completo';
            return;
        }

        Utils.toast(`${perfil.correo} ahora es veterinario`, 'exito');
        formVeterinarioAbierto = null;
        await cargarPerfiles();
        render();
    }

    function valor(id) {
        const el = document.getElementById(id);
        return el ? el.value.trim() || null : null;
    }

    async function enviarReset(btn) {
        const correo = btn.dataset.correo;
        if (!confirm(`¿Enviar correo de recuperación de contraseña a ${correo}?`)) return;

        Utils.setLoading(btn, true, 'Enviando...');
        const res = await Auth.solicitarRecuperacion(correo);
        Utils.setLoading(btn, false);

        if (!res.ok) {
            Utils.toast('No se pudo enviar: ' + res.error, 'error');
            return;
        }
        Utils.toast(`Correo de recuperación enviado a ${correo}`, 'exito');
    }

    async function cambiarEstado(id, nuevoEstado) {
        const confirmaciones = {
            rechazado: '¿Rechazar esta solicitud de acceso?',
            suspendido: '¿Suspender el acceso de esta cuenta?'
        };
        if (confirmaciones[nuevoEstado] && !confirm(confirmaciones[nuevoEstado])) return;

        const { error } = await db.from('mascotas_perfiles').update({ estado_cuenta: nuevoEstado }).eq('id', id);
        if (error) {
            Utils.toast('No se pudo actualizar: ' + error.message, 'error');
            return;
        }

        Utils.toast('Cuenta actualizada', 'exito');
        await cargarPerfiles();
        render();
    }

    function esc(v) {
        return (v || '').toString().replace(/"/g, '&quot;');
    }

    return { init };
})();

window.Admin = Admin;
