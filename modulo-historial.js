// ================================================================
// MODULO-HISTORIAL.JS — Historia de vida de la mascota
// Depende de: config.js, utils.js, auth.js
// Se monta dentro de la ficha de la mascota (modulo-mascota.js) vía
// Historial.init(el, mascotaId). Expone window.Historial.
// Pestañas: Consultas, Vacunas, Cirugías, Diagnósticos, Medicamentos,
// Desparasitación, Alimentación, Evolución, Diario, Gastos y Línea de
// vida (auto + manual).
// ================================================================

const Historial = (() => {

    const TABS = [
        { id: 'consultas', etiqueta: '🩺 Consultas' },
        { id: 'vacunas', etiqueta: '💉 Vacunas' },
        { id: 'cirugias', etiqueta: '🔪 Cirugías' },
        { id: 'diagnosticos', etiqueta: '📋 Diagnósticos' },
        { id: 'medicamentos', etiqueta: '💊 Medicamentos' },
        { id: 'desparasitacion', etiqueta: '🐛 Desparasitación' },
        { id: 'alimentacion', etiqueta: '🍖 Alimentación' },
        { id: 'evolucion', etiqueta: '📈 Evolución' },
        { id: 'diario', etiqueta: '📔 Diario' },
        { id: 'gastos', etiqueta: '💰 Gastos' },
        { id: 'linea', etiqueta: '🕒 Línea de vida' }
    ];

    const ETIQUETAS_CATEGORIA_GASTO = {
        alimentacion: 'Alimentación', veterinario: 'Veterinario', medicamentos: 'Medicamentos',
        higiene: 'Higiene', accesorios: 'Accesorios', otro: 'Otro'
    };

    const ETIQUETAS_TIPO_DIARIO = { foto: '📷 Foto', video: '🎥 Video', nota: '📝 Nota', evento: '⭐ Evento' };

    const ICONOS_TIMELINE = {
        nacimiento: '🐣', foto: '📷', bano: '🛁', cambio_alimento: '🍖', vacuna: '💉',
        control: '🩺', urgencia: '🚨', cirugia: '🔪', medicamento: '💊', cumpleanos: '🎂',
        viaje: '✈️', cambio_peso: '⚖️', otro: '📌'
    };

    let contenedor = null;
    let mascotaId = null;
    let tabActiva = 'vacunas';
    let datos = {};

    async function init(el, idMascota) {
        contenedor = el;
        mascotaId = idMascota;
        tabActiva = 'vacunas';
        contenedor.innerHTML = `<div class="estado-vacio"><p>Cargando historial...</p></div>`;
        await cargarTodo();
        render();
    }

    async function cargarTodo() {
        const [consultas, vacunas, cirugias, diagnosticos, medicamentos, desparasitacion, alimentacion, evolucion, diario, gastos, linea] = await Promise.all([
            consultar('mascotas_consultas', 'fecha', false),
            consultar('mascotas_vacunas', 'fecha', false),
            consultar('mascotas_cirugias', 'fecha', false),
            consultar('mascotas_diagnosticos', 'fecha', false),
            consultar('mascotas_medicamentos', 'created_at', false),
            consultar('mascotas_desparasitaciones', 'fecha', false),
            consultar('mascotas_alimentacion_historial', 'vigente_desde', false),
            consultar('mascotas_evolucion_mediciones', 'fecha', true),
            consultar('mascotas_diario_entradas', 'fecha', false),
            consultar('mascotas_gastos', 'fecha', false),
            consultar('mascotas_timeline_eventos', 'fecha_evento', false)
        ]);

        let administraciones = [];
        if (medicamentos.length) {
            const { data } = await db
                .from('mascotas_medicamento_administraciones')
                .select('*')
                .in('medicamento_id', medicamentos.map((m) => m.id))
                .order('fecha_hora', { ascending: false });
            administraciones = data || [];
        }

        datos = {
            consultas, vacunas, cirugias, diagnosticos, medicamentos, desparasitacion,
            alimentacion, evolucion, diario, gastos, linea, administraciones
        };
    }

    async function consultar(tabla, orden, ascendente) {
        const { data, error } = await db
            .from(tabla)
            .select('*')
            .eq('mascota_id', mascotaId)
            .order(orden, { ascending: ascendente });

        if (error) {
            Utils.toast(`No se pudo cargar ${tabla}: ` + error.message, 'error');
            return [];
        }
        return data || [];
    }

    // ── Render ───────────────────────────────────────────────────
    function render() {
        contenedor.innerHTML = `
            <div class="historial-tabs">
                ${TABS.map((t) => `<button type="button" class="historial-tab ${tabActiva === t.id ? 'activo' : ''}" data-tab="${t.id}">${t.etiqueta}</button>`).join('')}
            </div>
            <div class="historial-panel">${renderTab(tabActiva)}</div>
        `;
        wireEventos();
    }

    function renderTab(tab) {
        switch (tab) {
            case 'consultas': return tabConsultas();
            case 'vacunas': return tabVacunas();
            case 'cirugias': return tabCirugias();
            case 'diagnosticos': return tabDiagnosticos();
            case 'medicamentos': return tabMedicamentos();
            case 'desparasitacion': return tabDesparasitacion();
            case 'alimentacion': return tabAlimentacion();
            case 'evolucion': return tabEvolucion();
            case 'diario': return tabDiario();
            case 'gastos': return tabGastos();
            case 'linea': return tabLinea();
            default: return '';
        }
    }

    function formularioTab(tab, tituloBoton, camposHtml) {
        return `
            <div class="card historial-form-card">
                <form id="historialForm" data-tab="${tab}" class="historial-form grid-2" novalidate>
                    ${camposHtml}
                    <div class="field-msg field-ancho-completo" id="historialMensaje"></div>
                    <button type="submit" class="btn-primario btn-ancho-auto field-ancho-completo">${tituloBoton}</button>
                </form>
            </div>
        `;
    }

    function plantillaVacia(texto) {
        return `<div class="estado-vacio"><span class="estado-vacio-icono">🐾</span><p>${texto}</p></div>`;
    }

    // ── Consultas ────────────────────────────────────────────────
    function tabConsultas() {
        const lista = datos.consultas;
        const filas = lista.map((c) => `
            <div class="historial-fila">
                <div class="historial-fila-info">
                    <strong>${esc(c.motivo) || 'Consulta'}</strong>
                    <span class="historial-fila-sub">${formatearFechaHora(c.fecha)}</span>
                    ${c.diagnostico ? `<span class="historial-fila-sub">Diagnóstico: ${esc(c.diagnostico)}</span>` : ''}
                    ${c.tratamiento ? `<span class="historial-fila-sub">Tratamiento: ${esc(c.tratamiento)}</span>` : ''}
                    ${c.observaciones ? `<span class="historial-fila-sub">Obs: ${esc(c.observaciones)}</span>` : ''}
                </div>
                <button class="btn-peligro btn-historial-eliminar" data-tabla="mascotas_consultas" data-id="${c.id}">Eliminar</button>
            </div>
        `).join('');

        return `
            ${formularioTab('consultas', 'Registrar consulta', `
                <div class="field-group"><label>Fecha *</label><div class="input-wrap"><input type="date" id="hConFecha" value="${Utils.hoy()}" required></div></div>
                <div class="field-group field-ancho-completo"><label>Motivo</label><div class="input-wrap"><input type="text" id="hConMotivo" placeholder="Ej: Control anual, vómitos, cojera..."></div></div>
                <div class="field-group field-ancho-completo"><label>Diagnóstico</label><div class="input-wrap"><input type="text" id="hConDiagnostico"></div></div>
                <div class="field-group field-ancho-completo"><label>Tratamiento indicado</label><div class="input-wrap"><input type="text" id="hConTratamiento"></div></div>
                <div class="field-group field-ancho-completo"><label>Observaciones</label><div class="input-wrap"><input type="text" id="hConObservaciones"></div></div>
            `)}
            ${lista.length ? `<div class="historial-lista">${filas}</div>` : plantillaVacia('Aún no hay consultas registradas.')}
        `;
    }

    async function guardarConsulta(form) {
        const payload = {
            mascota_id: mascotaId,
            fecha: valor('hConFecha') || Utils.hoy(),
            motivo: valor('hConMotivo'),
            diagnostico: valor('hConDiagnostico'),
            tratamiento: valor('hConTratamiento'),
            observaciones: valor('hConObservaciones'),
            registrado_por: window.appData.usuario.id
        };
        await insertarYRecargar('mascotas_consultas', payload, form);
    }

    // ── Cirugías ─────────────────────────────────────────────────
    function tabCirugias() {
        const lista = datos.cirugias;
        const filas = lista.map((c) => `
            <div class="historial-fila">
                <div class="historial-fila-info">
                    <strong>${esc(c.nombre)}</strong>
                    <span class="historial-fila-sub">${formatearFechaHora(c.fecha)}</span>
                    ${c.resultado ? `<span class="historial-fila-sub">Resultado: ${esc(c.resultado)}</span>` : ''}
                    ${c.complicaciones ? `<span class="historial-fila-sub">Complicaciones: ${esc(c.complicaciones)}</span>` : ''}
                    ${c.indicaciones ? `<span class="historial-fila-sub">Indicaciones: ${esc(c.indicaciones)}</span>` : ''}
                </div>
                <button class="btn-peligro btn-historial-eliminar" data-tabla="mascotas_cirugias" data-id="${c.id}">Eliminar</button>
            </div>
        `).join('');

        return `
            ${formularioTab('cirugias', 'Registrar cirugía', `
                <div class="field-group"><label>Nombre *</label><div class="input-wrap"><input type="text" id="hCirNombre" required placeholder="Ej: Esterilización"></div></div>
                <div class="field-group"><label>Fecha *</label><div class="input-wrap"><input type="date" id="hCirFecha" value="${Utils.hoy()}" required></div></div>
                <div class="field-group field-ancho-completo"><label>Resultado</label><div class="input-wrap"><input type="text" id="hCirResultado"></div></div>
                <div class="field-group field-ancho-completo"><label>Complicaciones</label><div class="input-wrap"><input type="text" id="hCirComplicaciones"></div></div>
                <div class="field-group field-ancho-completo"><label>Indicaciones post-operatorias</label><div class="input-wrap"><input type="text" id="hCirIndicaciones"></div></div>
            `)}
            ${lista.length ? `<div class="historial-lista">${filas}</div>` : plantillaVacia('Aún no hay cirugías registradas.')}
        `;
    }

    async function guardarCirugia(form) {
        const payload = {
            mascota_id: mascotaId,
            nombre: valor('hCirNombre'),
            fecha: valor('hCirFecha') || Utils.hoy(),
            resultado: valor('hCirResultado'),
            complicaciones: valor('hCirComplicaciones'),
            indicaciones: valor('hCirIndicaciones'),
            registrado_por: window.appData.usuario.id
        };
        if (!payload.nombre) return mensajeError('El nombre de la cirugía es obligatorio.');
        await insertarYRecargar('mascotas_cirugias', payload, form);
    }

    // ── Diagnósticos ─────────────────────────────────────────────
    function tabDiagnosticos() {
        const lista = datos.diagnosticos;
        const filas = lista.map((d) => `
            <div class="historial-fila">
                <div class="historial-fila-info">
                    <strong>${esc(d.nombre)}</strong>
                    <span class="historial-fila-sub">${Utils.formatearFecha(d.fecha)}${d.descripcion ? ' · ' + esc(d.descripcion) : ''}</span>
                </div>
                ${d.estado ? `<span class="badge-estado ${claseEstadoDiagnostico(d.estado)}">${etiquetaEstadoDiagnostico(d.estado)}</span>` : ''}
                <button class="btn-peligro btn-historial-eliminar" data-tabla="mascotas_diagnosticos" data-id="${d.id}">Eliminar</button>
            </div>
        `).join('');

        return `
            ${formularioTab('diagnosticos', 'Registrar diagnóstico', `
                <div class="field-group"><label>Nombre *</label><div class="input-wrap"><input type="text" id="hDiagNombre" required placeholder="Ej: Dermatitis alérgica"></div></div>
                <div class="field-group"><label>Fecha *</label><div class="input-wrap"><input type="date" id="hDiagFecha" value="${Utils.hoy()}" required></div></div>
                <div class="field-group"><label>Estado</label><div class="input-wrap"><select id="hDiagEstado">
                    <option value="activo">Activo</option>
                    <option value="en_tratamiento">En tratamiento</option>
                    <option value="resuelto">Resuelto</option>
                    <option value="cronico">Crónico</option>
                </select></div></div>
                <div class="field-group field-ancho-completo"><label>Descripción</label><div class="input-wrap"><input type="text" id="hDiagDescripcion"></div></div>
            `)}
            ${lista.length ? `<div class="historial-lista">${filas}</div>` : plantillaVacia('Aún no hay diagnósticos registrados.')}
        `;
    }

    async function guardarDiagnostico(form) {
        const payload = {
            mascota_id: mascotaId,
            nombre: valor('hDiagNombre'),
            fecha: valor('hDiagFecha') || Utils.hoy(),
            estado: valor('hDiagEstado') || 'activo',
            descripcion: valor('hDiagDescripcion'),
            registrado_por: window.appData.usuario.id
        };
        if (!payload.nombre) return mensajeError('El nombre del diagnóstico es obligatorio.');
        await insertarYRecargar('mascotas_diagnosticos', payload, form);
    }

    function etiquetaEstadoDiagnostico(estado) {
        return { activo: 'Activo', en_tratamiento: 'En tratamiento', resuelto: 'Resuelto', cronico: 'Crónico' }[estado] || estado;
    }

    function claseEstadoDiagnostico(estado) {
        return { resuelto: 'badge-aprobado', activo: 'badge-pendiente', en_tratamiento: 'badge-pendiente', cronico: 'badge-rechazado' }[estado] || '';
    }

    // ── Vacunas ──────────────────────────────────────────────────
    function tabVacunas() {
        const lista = datos.vacunas;
        const filas = lista.map((v) => `
            <div class="historial-fila">
                <div class="historial-fila-info">
                    <strong>${esc(v.nombre)}</strong>
                    <span class="historial-fila-sub">Aplicada: ${Utils.formatearFecha(v.fecha)}${v.lote ? ' · Lote ' + esc(v.lote) : ''}</span>
                </div>
                ${v.proxima_dosis_fecha ? `<div class="historial-fila-estado"><span class="historial-fila-etiqueta">Próxima dosis</span>${estadoFecha(v.proxima_dosis_fecha)}</div>` : ''}
                <button class="btn-peligro btn-historial-eliminar" data-tabla="mascotas_vacunas" data-id="${v.id}">Eliminar</button>
            </div>
        `).join('');

        return `
            ${formularioTab('vacunas', 'Registrar vacuna', `
                <div class="field-group"><label>Nombre *</label><div class="input-wrap"><input type="text" id="hVacNombre" required></div></div>
                <div class="field-group"><label>Fecha aplicada *</label><div class="input-wrap"><input type="date" id="hVacFecha" value="${Utils.hoy()}" required></div></div>
                <div class="field-group"><label>Lote</label><div class="input-wrap"><input type="text" id="hVacLote"></div></div>
                <div class="field-group"><label>Próxima dosis</label><div class="input-wrap"><input type="date" id="hVacProxima"></div></div>
            `)}
            ${lista.length ? `<div class="historial-lista">${filas}</div>` : plantillaVacia('Aún no registras vacunas.')}
        `;
    }

    async function guardarVacuna(form) {
        const payload = {
            mascota_id: mascotaId,
            nombre: valor('hVacNombre'),
            fecha: valor('hVacFecha'),
            lote: valor('hVacLote'),
            proxima_dosis_fecha: valor('hVacProxima'),
            registrado_por: window.appData.usuario.id
        };
        if (!payload.nombre || !payload.fecha) return mensajeError('Nombre y fecha son obligatorios.');
        await insertarYRecargar('mascotas_vacunas', payload, form);
    }

    // ── Medicamentos ─────────────────────────────────────────────
    function tabMedicamentos() {
        const lista = datos.medicamentos;
        const filas = lista.map((m) => {
            const ultima = (datos.administraciones || []).find((a) => a.medicamento_id === m.id);
            return `
                <div class="historial-fila">
                    <div class="historial-fila-info">
                        <strong>${esc(m.nombre)}</strong>
                        <span class="historial-fila-sub">${[esc(m.dosis), esc(m.frecuencia)].filter(Boolean).join(' · ') || 'Sin dosis registrada'}</span>
                        <span class="historial-fila-sub">${ultima ? 'Última dosis: ' + formatearFechaHora(ultima.fecha_hora) : 'Sin dosis confirmadas'}</span>
                    </div>
                    ${m.recordatorio_activo ? '<span class="badge-estado badge-aprobado">Recordatorio activo</span>' : ''}
                    <div class="historial-fila-acciones">
                        <button class="btn-secundario btn-marcar-dosis" data-id="${m.id}">Marcar dosis dada</button>
                        <button class="btn-peligro btn-historial-eliminar" data-tabla="mascotas_medicamentos" data-id="${m.id}">Eliminar</button>
                    </div>
                </div>
            `;
        }).join('');

        return `
            ${formularioTab('medicamentos', 'Registrar medicamento', `
                <div class="field-group"><label>Nombre *</label><div class="input-wrap"><input type="text" id="hMedNombre" required></div></div>
                <div class="field-group"><label>Dosis</label><div class="input-wrap"><input type="text" id="hMedDosis" placeholder="Ej: 1 comprimido"></div></div>
                <div class="field-group"><label>Frecuencia</label><div class="input-wrap"><input type="text" id="hMedFrecuencia" placeholder="Ej: Cada 12 horas"></div></div>
                <div class="field-group"><label>Duración (días)</label><div class="input-wrap"><input type="number" min="0" id="hMedDuracion"></div></div>
                <div class="field-group"><label>Fecha de inicio</label><div class="input-wrap"><input type="date" id="hMedInicio" value="${Utils.hoy()}"></div></div>
                <div class="field-group"><label class="check-inline"><input type="checkbox" id="hMedRecordatorio"> Activar recordatorio</label></div>
                <div class="field-group field-ancho-completo"><label>Observaciones</label><div class="input-wrap"><input type="text" id="hMedObs"></div></div>
            `)}
            ${lista.length ? `<div class="historial-lista">${filas}</div>` : plantillaVacia('Aún no registras medicamentos.')}
        `;
    }

    async function guardarMedicamento(form) {
        const payload = {
            mascota_id: mascotaId,
            nombre: valor('hMedNombre'),
            dosis: valor('hMedDosis'),
            frecuencia: valor('hMedFrecuencia'),
            duracion_dias: valorNumerico('hMedDuracion'),
            fecha_inicio: valor('hMedInicio'),
            recordatorio_activo: document.getElementById('hMedRecordatorio').checked,
            observaciones: valor('hMedObs'),
            registrado_por: window.appData.usuario.id
        };
        if (!payload.nombre) return mensajeError('El nombre del medicamento es obligatorio.');
        await insertarYRecargar('mascotas_medicamentos', payload, form);
    }

    async function marcarDosis(medicamentoId) {
        const { error } = await db.from('mascotas_medicamento_administraciones').insert({
            medicamento_id: medicamentoId,
            confirmado_por: window.appData.usuario.id
        });
        if (error) return Utils.toast('No se pudo registrar la dosis: ' + error.message, 'error');
        Utils.toast('Dosis registrada', 'exito');
        await cargarTodo();
        render();
    }

    // ── Desparasitación ──────────────────────────────────────────
    function tabDesparasitacion() {
        const lista = datos.desparasitacion;
        const filas = lista.map((d) => `
            <div class="historial-fila">
                <div class="historial-fila-info">
                    <strong>${d.tipo === 'interna' ? 'Interna' : 'Externa'}${d.producto ? ' · ' + esc(d.producto) : ''}</strong>
                    <span class="historial-fila-sub">Aplicada: ${Utils.formatearFecha(d.fecha)}</span>
                </div>
                ${d.proxima_aplicacion ? `<div class="historial-fila-estado"><span class="historial-fila-etiqueta">Próxima</span>${estadoFecha(d.proxima_aplicacion)}</div>` : ''}
                <button class="btn-peligro btn-historial-eliminar" data-tabla="mascotas_desparasitaciones" data-id="${d.id}">Eliminar</button>
            </div>
        `).join('');

        return `
            ${formularioTab('desparasitacion', 'Registrar desparasitación', `
                <div class="field-group"><label>Tipo *</label><div class="input-wrap"><select id="hDesTipo">
                    <option value="interna">Interna</option>
                    <option value="externa">Externa</option>
                </select></div></div>
                <div class="field-group"><label>Producto</label><div class="input-wrap"><input type="text" id="hDesProducto"></div></div>
                <div class="field-group"><label>Fecha aplicada *</label><div class="input-wrap"><input type="date" id="hDesFecha" value="${Utils.hoy()}" required></div></div>
                <div class="field-group"><label>Próxima aplicación</label><div class="input-wrap"><input type="date" id="hDesProxima"></div></div>
            `)}
            ${lista.length ? `<div class="historial-lista">${filas}</div>` : plantillaVacia('Aún no registras desparasitaciones.')}
        `;
    }

    async function guardarDesparasitacion(form) {
        const payload = {
            mascota_id: mascotaId,
            tipo: valor('hDesTipo'),
            producto: valor('hDesProducto'),
            fecha: valor('hDesFecha'),
            proxima_aplicacion: valor('hDesProxima'),
            registrado_por: window.appData.usuario.id
        };
        if (!payload.fecha) return mensajeError('La fecha de aplicación es obligatoria.');
        await insertarYRecargar('mascotas_desparasitaciones', payload, form);
    }

    // ── Alimentación ─────────────────────────────────────────────
    function tabAlimentacion() {
        const lista = datos.alimentacion;
        const filas = lista.map((a, i) => `
            <div class="historial-fila">
                <div class="historial-fila-info">
                    <strong>${esc(a.marca) || 'Sin marca'}${a.tipo ? ' · ' + esc(a.tipo) : ''}</strong>
                    <span class="historial-fila-sub">${a.cantidad_diaria ? esc(a.cantidad_diaria) + ' al día · ' : ''}Desde ${Utils.formatearFecha(a.vigente_desde)}${a.vigente_hasta ? ' hasta ' + Utils.formatearFecha(a.vigente_hasta) : ''}</span>
                    ${a.restricciones ? `<span class="historial-fila-sub">Restricciones: ${esc(a.restricciones)}</span>` : ''}
                </div>
                ${i === 0 && !a.vigente_hasta ? '<span class="badge-estado badge-aprobado">Actual</span>' : ''}
                <button class="btn-peligro btn-historial-eliminar" data-tabla="mascotas_alimentacion_historial" data-id="${a.id}">Eliminar</button>
            </div>
        `).join('');

        return `
            ${formularioTab('alimentacion', 'Registrar alimentación', `
                <div class="field-group"><label>Marca</label><div class="input-wrap"><input type="text" id="hAliMarca"></div></div>
                <div class="field-group"><label>Tipo</label><div class="input-wrap"><input type="text" id="hAliTipo" placeholder="Ej: Seco, húmedo, BARF"></div></div>
                <div class="field-group"><label>Cantidad diaria</label><div class="input-wrap"><input type="text" id="hAliCantidad" placeholder="Ej: 200 g"></div></div>
                <div class="field-group"><label>Vigente desde</label><div class="input-wrap"><input type="date" id="hAliDesde" value="${Utils.hoy()}"></div></div>
                <div class="field-group field-ancho-completo"><label>Restricciones</label><div class="input-wrap"><input type="text" id="hAliRestricciones"></div></div>
            `)}
            ${lista.length ? `<div class="historial-lista">${filas}</div>` : plantillaVacia('Aún no registras alimentación.')}
        `;
    }

    async function guardarAlimentacion(form) {
        const payload = {
            mascota_id: mascotaId,
            marca: valor('hAliMarca'),
            tipo: valor('hAliTipo'),
            cantidad_diaria: valor('hAliCantidad'),
            restricciones: valor('hAliRestricciones'),
            vigente_desde: valor('hAliDesde') || Utils.hoy(),
            registrado_por: window.appData.usuario.id
        };
        await insertarYRecargar('mascotas_alimentacion_historial', payload, form);
    }

    // ── Evolución ────────────────────────────────────────────────
    function tabEvolucion() {
        const lista = datos.evolucion; // orden ascendente por fecha
        const filas = [...lista].reverse().map((e) => `
            <div class="historial-fila">
                <div class="historial-fila-info">
                    <strong>${e.peso_kg ? e.peso_kg + ' kg' : '—'}${e.altura_cm ? ' · ' + e.altura_cm + ' cm' : ''}</strong>
                    <span class="historial-fila-sub">${Utils.formatearFecha(e.fecha)}</span>
                </div>
                <button class="btn-peligro btn-historial-eliminar" data-tabla="mascotas_evolucion_mediciones" data-id="${e.id}">Eliminar</button>
            </div>
        `).join('');

        return `
            ${graficoPeso(lista)}
            ${formularioTab('evolucion', 'Registrar medición', `
                <div class="field-group"><label>Fecha *</label><div class="input-wrap"><input type="date" id="hEvoFecha" value="${Utils.hoy()}" required></div></div>
                <div class="field-group"><label>Peso (kg)</label><div class="input-wrap"><input type="number" step="0.1" min="0" id="hEvoPeso"></div></div>
                <div class="field-group"><label>Altura (cm)</label><div class="input-wrap"><input type="number" step="0.1" min="0" id="hEvoAltura"></div></div>
            `)}
            ${lista.length ? `<div class="historial-lista">${filas}</div>` : plantillaVacia('Aún no registras mediciones de evolución.')}
        `;
    }

    function graficoPeso(mediciones) {
        const puntos = mediciones.filter((m) => m.peso_kg !== null && m.peso_kg !== undefined);
        if (puntos.length < 2) return '';

        const pesos = puntos.map((p) => Number(p.peso_kg));
        const min = Math.min(...pesos);
        const max = Math.max(...pesos);
        const rango = max - min || 1;
        const ancho = 560, alto = 120, pad = 14;

        const coords = puntos.map((p, i) => {
            const x = pad + (i / (puntos.length - 1)) * (ancho - pad * 2);
            const y = alto - pad - ((Number(p.peso_kg) - min) / rango) * (alto - pad * 2);
            return { x: x.toFixed(1), y: y.toFixed(1) };
        });

        return `
            <div class="card historial-grafico">
                <span class="historial-fila-etiqueta">Peso en el tiempo</span>
                <svg viewBox="0 0 ${ancho} ${alto}" preserveAspectRatio="none" class="grafico-svg">
                    <polyline points="${coords.map((c) => `${c.x},${c.y}`).join(' ')}" fill="none" stroke="var(--color-primario)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
                    ${coords.map((c) => `<circle cx="${c.x}" cy="${c.y}" r="3.5" fill="var(--color-primario)" />`).join('')}
                </svg>
                <div class="grafico-rango"><span>${min} kg</span><span>${max} kg</span></div>
            </div>
        `;
    }

    async function guardarEvolucion(form) {
        const payload = {
            mascota_id: mascotaId,
            fecha: valor('hEvoFecha') || Utils.hoy(),
            peso_kg: valorNumerico('hEvoPeso'),
            altura_cm: valorNumerico('hEvoAltura'),
            registrado_por: window.appData.usuario.id
        };
        if (payload.peso_kg === null && payload.altura_cm === null) return mensajeError('Ingresa al menos el peso o la altura.');
        await insertarYRecargar('mascotas_evolucion_mediciones', payload, form);
    }

    // ── Diario ───────────────────────────────────────────────────
    function tabDiario() {
        const lista = datos.diario;
        const items = lista.map((d) => `
            <div class="diario-item">
                ${d.archivo_url ? (d.tipo === 'video'
                    ? `<div class="diario-item-media"><video src="${d.archivo_url}" controls></video></div>`
                    : `<div class="diario-item-media"><img src="${d.archivo_url}" alt=""></div>`) : ''}
                <div class="diario-item-cuerpo">
                    <span class="diario-item-tipo">${ETIQUETAS_TIPO_DIARIO[d.tipo] || d.tipo}</span>
                    ${d.contenido ? `<p>${esc(d.contenido)}</p>` : ''}
                    <span class="diario-item-fecha">${formatearFechaHora(d.fecha)}</span>
                </div>
                <button class="btn-peligro btn-historial-eliminar" data-tabla="mascotas_diario_entradas" data-id="${d.id}">Eliminar</button>
            </div>
        `).join('');

        return `
            ${formularioTab('diario', 'Agregar al diario', `
                <div class="field-group"><label>Tipo</label><div class="input-wrap"><select id="hDiaTipo">
                    <option value="nota">Nota</option>
                    <option value="foto">Foto</option>
                    <option value="video">Video</option>
                    <option value="evento">Evento</option>
                </select></div></div>
                <div class="field-group"><label>Adjuntar foto/video</label><div class="input-wrap"><input type="file" id="hDiaArchivo" accept="image/*,video/*"></div></div>
                <div class="field-group field-ancho-completo"><label>Nota</label><div class="input-wrap"><input type="text" id="hDiaContenido" placeholder="¿Qué pasó hoy?"></div></div>
            `)}
            ${lista.length ? `<div class="diario-lista">${items}</div>` : plantillaVacia('Aún no hay entradas en el diario.')}
        `;
    }

    async function guardarDiario(form) {
        const tipo = valor('hDiaTipo') || 'nota';
        const contenido = valor('hDiaContenido');
        const archivo = document.getElementById('hDiaArchivo').files[0];

        if (!contenido && !archivo) return mensajeError('Escribe una nota o adjunta una foto/video.');

        const btn = form.querySelector('button[type="submit"]');
        Utils.setLoading(btn, true);

        let archivoUrl = null;
        if (archivo) {
            const res = await Utils.subirArchivo(BUCKET_FOTOS_MASCOTAS, mascotaId, archivo);
            if (!res.ok) {
                Utils.setLoading(btn, false);
                return mensajeError('No se pudo subir el archivo: ' + res.error);
            }
            archivoUrl = res.url;
        }

        const { error } = await db.from('mascotas_diario_entradas').insert({
            mascota_id: mascotaId,
            tipo,
            contenido,
            archivo_url: archivoUrl,
            autor_id: window.appData.usuario.id
        });
        Utils.setLoading(btn, false);

        if (error) return mensajeError(error.message);
        Utils.toast('Entrada agregada al diario', 'exito');
        await cargarTodo();
        render();
    }

    // ── Gastos ───────────────────────────────────────────────────
    function tabGastos() {
        const lista = datos.gastos;
        const anioActual = new Date().getFullYear().toString();
        const totalAnio = lista
            .filter((g) => (g.fecha || '').startsWith(anioActual))
            .reduce((acc, g) => acc + Number(g.monto), 0);

        const porCategoria = {};
        lista.forEach((g) => { porCategoria[g.categoria] = (porCategoria[g.categoria] || 0) + Number(g.monto); });
        const maxCategoria = Math.max(1, ...Object.values(porCategoria));

        const barras = Object.entries(porCategoria).map(([cat, monto]) => `
            <div class="gasto-barra-fila">
                <span class="gasto-barra-etiqueta">${ETIQUETAS_CATEGORIA_GASTO[cat] || cat}</span>
                <div class="gasto-barra-track"><div class="gasto-barra-fill" style="width:${((monto / maxCategoria) * 100).toFixed(0)}%"></div></div>
                <span class="gasto-barra-monto">${formatMonto(monto)}</span>
            </div>
        `).join('');

        const filas = lista.map((g) => `
            <div class="historial-fila">
                <div class="historial-fila-info">
                    <strong>${formatMonto(g.monto, g.moneda)}</strong>
                    <span class="historial-fila-sub">${ETIQUETAS_CATEGORIA_GASTO[g.categoria] || g.categoria}${g.descripcion ? ' · ' + esc(g.descripcion) : ''} · ${Utils.formatearFecha(g.fecha)}</span>
                </div>
                <button class="btn-peligro btn-historial-eliminar" data-tabla="mascotas_gastos" data-id="${g.id}">Eliminar</button>
            </div>
        `).join('');

        return `
            ${lista.length ? `
                <div class="card historial-resumen">
                    <strong>Total ${anioActual}: ${formatMonto(totalAnio)}</strong>
                    <div class="gasto-barras">${barras}</div>
                </div>
            ` : ''}
            ${formularioTab('gastos', 'Registrar gasto', `
                <div class="field-group"><label>Categoría</label><div class="input-wrap"><select id="hGasCategoria">
                    <option value="alimentacion">Alimentación</option>
                    <option value="veterinario">Veterinario</option>
                    <option value="medicamentos">Medicamentos</option>
                    <option value="higiene">Higiene</option>
                    <option value="accesorios">Accesorios</option>
                    <option value="otro" selected>Otro</option>
                </select></div></div>
                <div class="field-group"><label>Monto (CLP) *</label><div class="input-wrap"><input type="number" min="0" step="1" id="hGasMonto" required></div></div>
                <div class="field-group"><label>Fecha *</label><div class="input-wrap"><input type="date" id="hGasFecha" value="${Utils.hoy()}" required></div></div>
                <div class="field-group field-ancho-completo"><label>Descripción</label><div class="input-wrap"><input type="text" id="hGasDescripcion"></div></div>
            `)}
            ${lista.length ? `<div class="historial-lista">${filas}</div>` : plantillaVacia('Aún no registras gastos.')}
        `;
    }

    async function guardarGasto(form) {
        const monto = valorNumerico('hGasMonto');
        const payload = {
            mascota_id: mascotaId,
            categoria: valor('hGasCategoria') || 'otro',
            descripcion: valor('hGasDescripcion'),
            monto,
            fecha: valor('hGasFecha') || Utils.hoy(),
            registrado_por: window.appData.usuario.id
        };
        if (!payload.monto || payload.monto <= 0) return mensajeError('Ingresa un monto válido.');
        await insertarYRecargar('mascotas_gastos', payload, form);
    }

    // ── Línea de vida ────────────────────────────────────────────
    function tabLinea() {
        const lista = datos.linea;
        const filas = lista.map((e) => `
            <div class="linea-item">
                <span class="linea-icono">${e.icono || ICONOS_TIMELINE[e.tipo_evento] || '📌'}</span>
                <div class="linea-info">
                    <strong>${esc(e.titulo)}</strong>
                    ${e.descripcion ? `<span class="linea-descripcion">${esc(e.descripcion)}</span>` : ''}
                    <span class="linea-fecha">${formatearFechaHora(e.fecha_evento)}</span>
                </div>
                ${!e.tabla_origen ? `<button class="btn-peligro btn-historial-eliminar" data-tabla="mascotas_timeline_eventos" data-id="${e.id}">Eliminar</button>` : ''}
            </div>
        `).join('');

        return `
            ${formularioTab('linea', 'Agregar al historial', `
                <div class="field-group"><label>Tipo</label><div class="input-wrap"><select id="hLinTipo">
                    <option value="otro">Otro</option>
                    <option value="foto">Foto / recuerdo</option>
                    <option value="bano">Baño</option>
                    <option value="cambio_alimento">Cambio de alimento</option>
                    <option value="cumpleanos">Cumpleaños</option>
                    <option value="viaje">Viaje</option>
                    <option value="nacimiento">Nacimiento</option>
                </select></div></div>
                <div class="field-group"><label>Fecha *</label><div class="input-wrap"><input type="date" id="hLinFecha" value="${Utils.hoy()}" required></div></div>
                <div class="field-group field-ancho-completo"><label>Título *</label><div class="input-wrap"><input type="text" id="hLinTitulo" required></div></div>
                <div class="field-group field-ancho-completo"><label>Descripción</label><div class="input-wrap"><input type="text" id="hLinDescripcion"></div></div>
            `)}
            ${lista.length ? `<div class="linea-lista">${filas}</div>` : plantillaVacia('Todavía no hay eventos en la línea de vida.')}
        `;
    }

    async function guardarEventoManual(form) {
        const payload = {
            mascota_id: mascotaId,
            tipo_evento: valor('hLinTipo') || 'otro',
            titulo: valor('hLinTitulo'),
            descripcion: valor('hLinDescripcion'),
            fecha_evento: valor('hLinFecha') || Utils.hoy(),
            creado_por: window.appData.usuario.id
        };
        if (!payload.titulo) return mensajeError('El título es obligatorio.');
        await insertarYRecargar('mascotas_timeline_eventos', payload, form);
    }

    // ── Acciones compartidas ─────────────────────────────────────
    async function insertarYRecargar(tabla, payload, form) {
        const btn = form.querySelector('button[type="submit"]');
        Utils.setLoading(btn, true);
        const { error } = await db.from(tabla).insert(payload);
        Utils.setLoading(btn, false);

        if (error) return mensajeError(error.message);
        Utils.toast('Registro guardado', 'exito');
        await cargarTodo();
        render();
    }

    async function eliminar(tabla, id) {
        if (!confirm('¿Eliminar este registro?')) return;

        const { error } = await db.from(tabla).delete().eq('id', id);
        if (error) return Utils.toast('No se pudo eliminar: ' + error.message, 'error');

        if (tabla !== 'mascotas_timeline_eventos') {
            await db.from('mascotas_timeline_eventos').delete().eq('tabla_origen', tabla).eq('id_origen', id);
        }

        Utils.toast('Registro eliminado', 'exito');
        await cargarTodo();
        render();
    }

    function mensajeError(texto) {
        const mensaje = document.getElementById('historialMensaje');
        if (mensaje) {
            mensaje.textContent = texto;
            mensaje.className = 'field-msg msg-error field-ancho-completo';
        }
    }

    async function manejarSubmit(ev) {
        ev.preventDefault();
        const guardadores = {
            consultas: guardarConsulta,
            vacunas: guardarVacuna,
            cirugias: guardarCirugia,
            diagnosticos: guardarDiagnostico,
            medicamentos: guardarMedicamento,
            desparasitacion: guardarDesparasitacion,
            alimentacion: guardarAlimentacion,
            evolucion: guardarEvolucion,
            diario: guardarDiario,
            gastos: guardarGasto,
            linea: guardarEventoManual
        };
        const fn = guardadores[ev.target.dataset.tab];
        if (fn) await fn(ev.target);
    }

    function wireEventos() {
        document.querySelectorAll('.historial-tab').forEach((btn) => {
            btn.addEventListener('click', () => { tabActiva = btn.dataset.tab; render(); });
        });

        const form = document.getElementById('historialForm');
        if (form) form.addEventListener('submit', manejarSubmit);

        document.querySelectorAll('.btn-historial-eliminar').forEach((btn) => {
            btn.addEventListener('click', () => eliminar(btn.dataset.tabla, btn.dataset.id));
        });

        document.querySelectorAll('.btn-marcar-dosis').forEach((btn) => {
            btn.addEventListener('click', () => marcarDosis(btn.dataset.id));
        });
    }

    // ── Helpers ──────────────────────────────────────────────────
    function diasDesdeHoy(fechaISO) {
        const [a, m, d] = fechaISO.split('-').map(Number);
        const objetivo = new Date(a, m - 1, d);
        const hoy = new Date();
        const hoySinHora = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
        return Math.round((objetivo - hoySinHora) / 86400000);
    }

    function estadoFecha(fechaISO) {
        if (!fechaISO) return '';
        const dias = diasDesdeHoy(fechaISO);
        let clase = 'badge-aprobado';
        let texto = Utils.formatearFecha(fechaISO);
        if (dias < 0) {
            clase = 'badge-rechazado';
            texto = 'Vencida · ' + Utils.formatearFecha(fechaISO);
        } else if (dias <= 7) {
            clase = 'badge-pendiente';
            texto = dias === 0 ? 'Hoy' : `En ${dias} día${dias === 1 ? '' : 's'}`;
        }
        return `<span class="badge-estado ${clase}">${texto}</span>`;
    }

    function formatearFechaHora(iso) {
        if (!iso) return '';
        const fecha = Utils.formatearFecha(iso.slice(0, 10));
        const hora = iso.slice(11, 16);
        return hora ? `${fecha} ${hora}` : fecha;
    }

    function formatMonto(monto, moneda = 'CLP') {
        const num = Number(monto) || 0;
        return `$${num.toLocaleString('es-CL')}` + (moneda && moneda !== 'CLP' ? ' ' + moneda : '');
    }

    function valor(id) {
        const el = document.getElementById(id);
        return el ? el.value.trim() || null : null;
    }

    function valorNumerico(id) {
        const v = valor(id);
        return v === null ? null : Number(v);
    }

    function esc(v) {
        return (v || '').toString().replace(/"/g, '&quot;');
    }

    return { init };
})();

window.Historial = Historial;
