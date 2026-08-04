// ================================================================
// MODULO-AGENDA.JS — Agenda inteligente (panel-agenda)
// Depende de: config.js, utils.js, auth.js, modulo-mascota.js
// Expone window.Agenda
// ================================================================

const Agenda = (() => {

    const ETIQUETAS_TIPO = {
        vacuna: '💉 Vacuna', medicamento: '💊 Medicamento', control: '🩺 Control',
        desparasitacion: '🐛 Desparasitación', bano: '🛁 Baño', corte_unas: '✂️ Corte de uñas',
        cumpleanos: '🎂 Cumpleaños', otro: '📌 Otro'
    };

    let contenedor = null;
    let mascotas = [];
    let items = [];

    async function init(el) {
        contenedor = el;
        el.innerHTML = `<div class="estado-vacio"><p>Cargando agenda...</p></div>`;
        mascotas = await Mascota.cargarMascotas();
        items = await cargarItems(mascotas);
        render();
    }

    async function cargarItems(listaMascotas) {
        const ids = listaMascotas.map((m) => m.id);
        const nombrePorId = {};
        listaMascotas.forEach((m) => (nombrePorId[m.id] = m.nombre));
        if (!ids.length) return [];

        const [{ data: recordatorios }, { data: vacunas }, { data: despara }] = await Promise.all([
            db.from('mascotas_agenda_recordatorios').select('*').in('mascota_id', ids).eq('estado', 'pendiente').order('fecha_programada', { ascending: true }),
            db.from('mascotas_vacunas').select('id, mascota_id, nombre, proxima_dosis_fecha').in('mascota_id', ids).not('proxima_dosis_fecha', 'is', null),
            db.from('mascotas_desparasitaciones').select('id, mascota_id, tipo, proxima_aplicacion').in('mascota_id', ids).not('proxima_aplicacion', 'is', null)
        ]);

        const resultado = [];

        (recordatorios || []).forEach((r) => resultado.push({
            origen: 'recordatorio', id: r.id, mascotaId: r.mascota_id, mascotaNombre: nombrePorId[r.mascota_id],
            tipo: r.tipo, titulo: r.titulo, descripcion: r.descripcion, fecha: r.fecha_programada, hora: r.hora_programada
        }));

        (vacunas || []).forEach((v) => resultado.push({
            origen: 'vacuna', mascotaId: v.mascota_id, mascotaNombre: nombrePorId[v.mascota_id],
            tipo: 'vacuna', titulo: `Próxima dosis: ${v.nombre}`, fecha: v.proxima_dosis_fecha
        }));

        (despara || []).forEach((d) => resultado.push({
            origen: 'desparasitacion', mascotaId: d.mascota_id, mascotaNombre: nombrePorId[d.mascota_id],
            tipo: 'desparasitacion', titulo: `Desparasitación ${d.tipo === 'interna' ? 'interna' : 'externa'}`, fecha: d.proxima_aplicacion
        }));

        resultado.sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
        return resultado;
    }

    function render() {
        const opcionesMascota = mascotas.map((m) => `<option value="${m.id}">${esc(m.nombre)}</option>`).join('');

        const filas = items.map((it) => `
            <div class="agenda-fila">
                <span class="agenda-fila-icono">${(ETIQUETAS_TIPO[it.tipo] || '📌 ').split(' ')[0]}</span>
                <div class="agenda-fila-info">
                    <strong>${esc(it.titulo)}</strong>
                    <span class="agenda-fila-sub">${esc(it.mascotaNombre)}${it.descripcion ? ' · ' + esc(it.descripcion) : ''}</span>
                </div>
                ${estadoFecha(it.fecha, it.hora)}
                ${it.origen === 'recordatorio' ? `
                    <div class="agenda-fila-acciones">
                        <button class="btn-secundario btn-agenda-completar" data-id="${it.id}">Completar</button>
                        <button class="btn-peligro btn-agenda-eliminar" data-id="${it.id}">Eliminar</button>
                    </div>
                ` : ''}
            </div>
        `).join('');

        contenedor.innerHTML = `
            ${mascotas.length ? `
                <div class="card historial-form-card">
                    <form id="agendaForm" class="grid-2" novalidate>
                        <div class="field-group"><label>Mascota *</label><div class="input-wrap"><select id="agMascota" required>${opcionesMascota}</select></div></div>
                        <div class="field-group"><label>Tipo</label><div class="input-wrap"><select id="agTipo">
                            <option value="control">Control</option>
                            <option value="bano">Baño</option>
                            <option value="corte_unas">Corte de uñas</option>
                            <option value="cumpleanos">Cumpleaños</option>
                            <option value="medicamento">Medicamento</option>
                            <option value="vacuna">Vacuna</option>
                            <option value="desparasitacion">Desparasitación</option>
                            <option value="otro">Otro</option>
                        </select></div></div>
                        <div class="field-group"><label>Fecha *</label><div class="input-wrap"><input type="date" id="agFecha" value="${Utils.hoy()}" required></div></div>
                        <div class="field-group"><label>Hora</label><div class="input-wrap"><input type="time" id="agHora"></div></div>
                        <div class="field-group field-ancho-completo"><label>Título *</label><div class="input-wrap"><input type="text" id="agTitulo" required></div></div>
                        <div class="field-group field-ancho-completo"><label>Descripción</label><div class="input-wrap"><input type="text" id="agDescripcion"></div></div>
                        <div class="field-msg field-ancho-completo" id="agendaMensaje"></div>
                        <button type="submit" class="btn-primario btn-ancho-auto field-ancho-completo">Agregar recordatorio</button>
                    </form>
                </div>
            ` : `<div class="estado-vacio"><span class="estado-vacio-icono">🐾</span><p>Registra una mascota primero para armar su agenda.</p></div>`}

            ${items.length ? `<div class="agenda-lista">${filas}</div>` : mascotas.length ? plantillaVacia() : ''}
        `;
        wireEventos();
    }

    function plantillaVacia() {
        return `<div class="estado-vacio"><span class="estado-vacio-icono">🗓️</span><p>No hay recordatorios ni fechas próximas pendientes.</p></div>`;
    }

    function wireEventos() {
        const form = document.getElementById('agendaForm');
        if (form) form.addEventListener('submit', guardar);

        document.querySelectorAll('.btn-agenda-completar').forEach((btn) => {
            btn.addEventListener('click', () => completar(btn.dataset.id));
        });
        document.querySelectorAll('.btn-agenda-eliminar').forEach((btn) => {
            btn.addEventListener('click', () => eliminar(btn.dataset.id));
        });
    }

    async function guardar(ev) {
        ev.preventDefault();
        const btn = document.getElementById('agendaForm').querySelector('button[type="submit"]');
        const mensaje = document.getElementById('agendaMensaje');

        const payload = {
            mascota_id: valor('agMascota'),
            tipo: valor('agTipo') || 'otro',
            titulo: valor('agTitulo'),
            descripcion: valor('agDescripcion'),
            fecha_programada: valor('agFecha'),
            hora_programada: valor('agHora'),
            creado_por: window.appData.usuario.id
        };

        if (!payload.titulo || !payload.fecha_programada) {
            mensaje.textContent = 'Título y fecha son obligatorios.';
            mensaje.className = 'field-msg msg-error field-ancho-completo';
            return;
        }

        Utils.setLoading(btn, true);
        const { error } = await db.from('mascotas_agenda_recordatorios').insert(payload);
        Utils.setLoading(btn, false);

        if (error) {
            mensaje.textContent = error.message;
            mensaje.className = 'field-msg msg-error field-ancho-completo';
            return;
        }

        Utils.toast('Recordatorio agregado', 'exito');
        items = await cargarItems(mascotas);
        render();
    }

    async function completar(id) {
        const { error } = await db.from('mascotas_agenda_recordatorios')
            .update({ estado: 'completado', completado_at: new Date().toISOString() })
            .eq('id', id);
        if (error) return Utils.toast('No se pudo completar: ' + error.message, 'error');

        Utils.toast('Recordatorio completado', 'exito');
        items = await cargarItems(mascotas);
        render();
    }

    async function eliminar(id) {
        if (!confirm('¿Eliminar este recordatorio?')) return;
        const { error } = await db.from('mascotas_agenda_recordatorios').delete().eq('id', id);
        if (error) return Utils.toast('No se pudo eliminar: ' + error.message, 'error');

        Utils.toast('Recordatorio eliminado', 'exito');
        items = await cargarItems(mascotas);
        render();
    }

    // ── Helpers ──────────────────────────────────────────────────
    function diasDesdeHoy(fechaISO) {
        const [a, m, d] = fechaISO.split('-').map(Number);
        const objetivo = new Date(a, m - 1, d);
        const hoy = new Date();
        const hoySinHora = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
        return Math.round((objetivo - hoySinHora) / 86400000);
    }

    function estadoFecha(fechaISO, hora) {
        if (!fechaISO) return '';
        const dias = diasDesdeHoy(fechaISO);
        let clase = 'badge-aprobado';
        let texto = Utils.formatearFecha(fechaISO) + (hora ? ' ' + hora.slice(0, 5) : '');
        if (dias < 0) { clase = 'badge-rechazado'; texto = 'Vencido · ' + Utils.formatearFecha(fechaISO); }
        else if (dias <= 7) { clase = 'badge-pendiente'; texto = dias === 0 ? 'Hoy' : `En ${dias} día${dias === 1 ? '' : 's'}`; }
        return `<span class="badge-estado ${clase}">${texto}</span>`;
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

window.Agenda = Agenda;
