// ================================================================
// MODULO-ADMIN.JS — Aprobación de cuentas (panel-admin, solo rol admin)
// Depende de: config.js, utils.js, auth.js
// Expone window.Admin
// ================================================================

const Admin = (() => {

    let contenedorActual = null;
    let perfiles = [];
    let filtro = 'pendiente';

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

        return `
            <div class="admin-fila" data-id="${p.id}">
                <div class="admin-fila-info">
                    <strong>${esc(nombreCompleto)}</strong>
                    <span class="admin-fila-correo">${esc(p.correo)}</span>
                    ${ubicacion ? `<span class="admin-fila-ubicacion">${esc(ubicacion)}</span>` : ''}
                    <span class="admin-fila-fecha">Registrado: ${Utils.formatearFecha((p.created_at || '').slice(0, 10))}</span>
                </div>
                <span class="badge-estado badge-${p.estado_cuenta}">${ETIQUETAS_ESTADO[p.estado_cuenta] || p.estado_cuenta}</span>
                <div class="admin-fila-acciones">
                    ${esUnoMismo ? '<span class="admin-fila-tu">(tú)</span>' : accionesPara(p)}
                </div>
            </div>
        `;
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
