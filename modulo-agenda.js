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

        const [{ data: recordatorios }, { data: vacunasTodas }, { data: desparaTodas }] = await Promise.all([
            db.from('mascotas_agenda_recordatorios').select('*').in('mascota_id', ids).eq('estado', 'pendiente').order('fecha_programada', { ascending: true }),
            db.from('mascotas_vacunas').select('id, mascota_id, nombre, fecha, proxima_dosis_fecha').in('mascota_id', ids).order('fecha', { ascending: false }),
            db.from('mascotas_desparasitaciones').select('id, mascota_id, tipo, fecha, proxima_aplicacion').in('mascota_id', ids).order('fecha', { ascending: false })
        ]);

        const resultado = [];
        // Solo la última aplicación de cada vacuna/desparasitación manda: una
        // dosis antigua ya renovada no debe aparecer como vencida.
        const ultima = (filas, clave) => {
            const vistos = new Set();
            return (filas || []).filter((f) => {
                const k = f.mascota_id + '|' + (clave(f) || '').trim().toLowerCase();
                if (vistos.has(k)) return false;
                vistos.add(k);
                return true;
            });
        };
        const vacunas = ultima(vacunasTodas, (v) => v.nombre).filter((v) => v.proxima_dosis_fecha);
        const despara = ultima(desparaTodas, (d) => d.tipo).filter((d) => d.proxima_aplicacion);

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

        (await cargarDeLaClinica(nombrePorId)).forEach((it) => resultado.push(it));

        resultado.sort((a, b) => ((a.fecha || '') + (a.hora || '')).localeCompare((b.fecha || '') + (b.hora || '')));
        return resultado;
    }

    // Lo que viene de ARM Veterinaria: las horas reservadas y el próximo
    // control o vacuna que la clínica dejó programado para cada mascota.
    async function cargarDeLaClinica(nombrePorId) {
        if (!Auth.puedeAcceder('panel-veterinaria')) return [];
        const [citas, resumen] = await Promise.all([
            db.rpc('vet_app_mis_citas').then((r) => r.data || []).catch(() => []),
            db.rpc('vet_app_resumen').then((r) => r.data).catch(() => null)
        ]);
        const items = [];
        (citas || []).filter((c) => c.estado !== 'cancelada').forEach((c) => {
            const inicio = new Date(c.inicio);
            items.push({
                origen: 'cita', id: c.id, mascotaNombre: c.mascota.nombre, clinica: c.clinica.nombre,
                tipo: TIPO_CITA_AGENDA[c.tipo] || 'control',
                titulo: `Hora en ${c.clinica.nombre}: ${TIPOS_CITA[c.tipo] || 'Atención'}`,
                descripcion: [c.lugar !== c.clinica.nombre ? c.lugar : '', ESTADOS_CITA_AGENDA[c.estado] || ''].filter(Boolean).join(' · '),
                fecha: fechaLocal(inicio), hora: inicio.toTimeString().slice(0, 5)
            });
        });
        ((resumen && resumen.mascotas) || []).forEach((m) => {
            if (!m.proximo) return;
            items.push({
                origen: 'clinica', mascotaNombre: nombrePorId[m.mascota_app_id] || '', clinica: m.clinicas.map((c) => c.clinica).join(', '),
                tipo: m.proximo.tipo === 'vacuna' ? 'vacuna' : m.proximo.tipo === 'desparasitacion' ? 'desparasitacion' : 'control',
                titulo: m.proximo.titulo.replace(/^\S+\s/, ''), fecha: m.proximo.fecha
            });
        });
        return items;
    }

    const TIPOS_CITA = { consulta: 'Consulta', control: 'Control', vacunacion: 'Vacunación', cirugia: 'Cirugía', procedimiento: 'Procedimiento',
        examen: 'Examen', peluqueria: 'Peluquería', urgencia: 'Urgencia', otro: 'Atención' };
    const TIPO_CITA_AGENDA = { vacunacion: 'vacuna', control: 'control', consulta: 'control', peluqueria: 'bano' };
    const ESTADOS_CITA_AGENDA = { solicitada: 'Esperando confirmación de la clínica', reservada: 'Reservada', confirmada: 'Confirmada',
        en_espera: 'Ya estás en la clínica', en_atencion: 'En atención' };

    function fechaLocal(d) {
        const p = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    }

    // Grupos para leer la agenda de un vistazo.
    function grupoDe(fecha) {
        if (!fecha) return 'despues';
        const dias = diasDesdeHoy(fecha);
        return dias < 0 ? 'atrasados' : dias === 0 ? 'hoy' : dias <= 7 ? 'semana' : 'despues';
    }
    const GRUPOS = [['atrasados', 'Atrasados'], ['hoy', 'Hoy'], ['semana', 'Próximos 7 días'], ['despues', 'Más adelante']];

    function etiquetaOrigen(it) {
        if (it.origen === 'cita' || it.origen === 'clinica') return `<span class="agenda-origen agenda-origen-clinica">🏥 ${esc(it.clinica)}</span>`;
        if (it.origen === 'recordatorio') return '<span class="agenda-origen">Tu recordatorio</span>';
        return '<span class="agenda-origen">De su historia de vida</span>';
    }

    function filaHtml(it, compacta) {
        return `
            <div class="agenda-fila agenda-fila-${it.origen}">
                <span class="agenda-fila-icono">${(ETIQUETAS_TIPO[it.tipo] || '📌 ').split(' ')[0]}</span>
                <div class="agenda-fila-info">
                    <strong>${esc(it.titulo)}</strong>
                    <span class="agenda-fila-sub">${esc(it.mascotaNombre)}${it.descripcion ? ' · ' + esc(it.descripcion) : ''}</span>
                    ${compacta ? '' : etiquetaOrigen(it)}
                </div>
                ${estadoFecha(it.fecha, it.hora)}
                ${compacta ? '' : it.origen === 'recordatorio' ? `
                    <div class="agenda-fila-acciones">
                        <button class="btn-secundario btn-agenda-completar" data-id="${it.id}">Completar</button>
                        <button class="btn-peligro btn-agenda-eliminar" data-id="${it.id}">Eliminar</button>
                    </div>
                ` : it.origen === 'cita' ? `
                    <div class="agenda-fila-acciones">
                        <button class="btn-secundario btn-agenda-cita">Ver hora</button>
                    </div>
                ` : ''}
            </div>
        `;
    }

    // Para el inicio: lo atrasado que sigue pendiente y lo que viene.
    async function proximos(listaMascotas, cantidad) {
        const todos = await cargarItems(listaMascotas);
        return todos.filter((it) => it.origen === 'recordatorio' || it.origen === 'cita' || (it.fecha && diasDesdeHoy(it.fecha) >= 0)).slice(0, cantidad);
    }

    function render() {
        const opcionesMascota = mascotas.map((m) => `<option value="${m.id}">${esc(m.nombre)}</option>`).join('');

        const filas = GRUPOS.map(([clave, titulo]) => {
            const delGrupo = items.filter((it) => grupoDe(it.fecha) === clave);
            if (!delGrupo.length) return '';
            return `<h4 class="agenda-grupo agenda-grupo-${clave}">${titulo} <span>${delGrupo.length}</span></h4>${delGrupo.map((it) => filaHtml(it)).join('')}`;
        }).join('');

        contenedor.innerHTML = `
            <div class="form-lateral">
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
            </div>
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
        document.querySelectorAll('.btn-agenda-cita').forEach((btn) => {
            btn.addEventListener('click', verHorasEnLaClinica);
        });
    }

    function verHorasEnLaClinica() {
        sessionStorage.setItem('arm_vet_seccion', 'citas');
        irAPanel('panel-veterinaria');
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

    return { init, proximos, filaHtml, verHorasEnLaClinica };
})();

window.Agenda = Agenda;
