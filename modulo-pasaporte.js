// ================================================================
// MODULO-PASAPORTE.JS — Pasaporte Digital de la mascota
// Depende de: config.js, utils.js, auth.js
// Se monta en la ficha de la mascota vía Pasaporte.init(el, mascota).
// Vista de solo lectura con toda la info reunida + generación de un
// enlace/QR temporal (distinto del QR permanente del collar) para
// compartir una selección de secciones con vencimiento.
// Expone window.Pasaporte.
// ================================================================

const Pasaporte = (() => {

    const DURACIONES = [
        { valor: 1, etiqueta: '1 día' },
        { valor: 3, etiqueta: '3 días' },
        { valor: 7, etiqueta: '7 días' },
        { valor: 30, etiqueta: '30 días' }
    ];

    const SECCIONES = [
        { id: 'vacunas', etiqueta: 'Vacunas' },
        { id: 'desparasitaciones', etiqueta: 'Desparasitación' },
        { id: 'medicamentos', etiqueta: 'Medicamentos' },
        { id: 'alergias', etiqueta: 'Alergias' },
        { id: 'diagnosticos', etiqueta: 'Diagnósticos / enfermedades' },
        { id: 'cirugias', etiqueta: 'Cirugías' },
        { id: 'consultas', etiqueta: 'Controles veterinarios' },
        { id: 'contactos', etiqueta: 'Contactos (dueño, veterinario, emergencia)' }
    ];

    let contenedor = null;
    let mascota = null;
    let datos = {};
    let compartidos = [];
    let formCompartirAbierto = false;

    async function init(el, m) {
        contenedor = el;
        mascota = m;
        el.innerHTML = `<div class="estado-vacio"><p>Cargando pasaporte...</p></div>`;
        await cargarTodo();
        render();
    }

    async function cargarTodo() {
        const [vacunas, desparasitaciones, medicamentos, alergias, diagnosticos, cirugias, consultas, compartidosData] = await Promise.all([
            consultar('mascotas_vacunas', 'fecha'),
            consultar('mascotas_desparasitaciones', 'fecha'),
            consultar('mascotas_medicamentos', 'created_at'),
            consultar('mascotas_alergias', 'created_at'),
            consultar('mascotas_diagnosticos', 'fecha'),
            consultar('mascotas_cirugias', 'fecha'),
            consultar('mascotas_consultas', 'fecha'),
            db.from('mascotas_pasaporte_compartido').select('*').eq('mascota_id', mascota.id).gt('expira_at', new Date().toISOString()).order('created_at', { ascending: false })
        ]);
        datos = { vacunas, desparasitaciones, medicamentos, alergias, diagnosticos, cirugias, consultas };
        compartidos = compartidosData.data || [];
    }

    async function consultar(tabla, orden) {
        const { data, error } = await db.from(tabla).select('*').eq('mascota_id', mascota.id).order(orden, { ascending: false });
        if (error) {
            Utils.toast(`No se pudo cargar ${tabla}: ` + error.message, 'error');
            return [];
        }
        return data || [];
    }

    function render() {
        const perfil = window.appData.perfil;
        const edad = Utils.calcularEdadMascota(mascota.fecha_nacimiento, mascota.especie);

        contenedor.innerHTML = `
            <div class="card pasaporte-card">
                <div class="pasaporte-cabecera">
                    <div class="dashboard-card-foto">
                        ${mascota.foto_url ? `<img src="${mascota.foto_url}" alt="${esc(mascota.nombre)}">` : `<span>${mascota.especie === 'perro' ? '🐶' : mascota.especie === 'gato' ? '🐱' : '🐾'}</span>`}
                    </div>
                    <div>
                        <h2>${esc(mascota.nombre)}</h2>
                        <p class="dashboard-card-sub">${esc(mascota.raza) || capitalizar(mascota.especie)} · ${etiquetaSexo(mascota.sexo)} · ${Utils.textoEdad(edad)}</p>
                    </div>
                </div>

                <div class="pasaporte-grid">
                    ${dato('Peso', mascota.peso_actual ? mascota.peso_actual + ' kg' : '—')}
                    ${dato('Color', mascota.color || '—')}
                    ${dato('Microchip', mascota.microchip || 'Sin registrar')}
                    ${dato('Nacimiento', mascota.fecha_nacimiento ? Utils.formatearFecha(mascota.fecha_nacimiento) : '—')}
                </div>

                <h4 class="seccion-titulo">Salud</h4>
                ${seccionLista('Vacunas', datos.vacunas.map((v) => `${v.nombre} · ${Utils.formatearFecha(v.fecha)}`))}
                ${seccionLista('Desparasitación', datos.desparasitaciones.map((d) => `${d.tipo === 'interna' ? 'Interna' : 'Externa'}${d.producto ? ' · ' + d.producto : ''} · ${Utils.formatearFecha(d.fecha)}`))}
                ${seccionLista('Medicamentos', datos.medicamentos.map((m2) => `${m2.nombre}${m2.dosis ? ' · ' + m2.dosis : ''}${m2.recordatorio_activo ? ' (activo)' : ''}`))}
                ${seccionLista('Alergias', datos.alergias.map((a) => `${a.nombre}${a.severidad ? ' · ' + a.severidad : ''}`))}
                ${seccionLista('Diagnósticos / enfermedades', datos.diagnosticos.map((d) => `${d.nombre} · ${Utils.formatearFecha(d.fecha)}${d.estado ? ' · ' + d.estado : ''}`))}
                ${seccionLista('Cirugías', datos.cirugias.map((c) => `${c.nombre} · ${Utils.formatearFecha((c.fecha || '').slice(0, 10))}`))}
                ${seccionLista('Controles veterinarios', datos.consultas.map((c) => `${c.motivo || 'Consulta'} · ${Utils.formatearFecha((c.fecha || '').slice(0, 10))}`))}

                <h4 class="seccion-titulo">Contactos</h4>
                <div class="pasaporte-grid">
                    ${dato('Dueño', `${perfil.nombre || ''} ${perfil.apellido || ''}`.trim() || '—')}
                    ${dato('Teléfono', perfil.telefono || '—')}
                    ${dato('Contacto de emergencia', perfil.contacto_emergencia_nombre ? `${perfil.contacto_emergencia_nombre}${perfil.contacto_emergencia_telefono ? ' · ' + perfil.contacto_emergencia_telefono : ''}` : '—')}
                </div>
            </div>

            <div class="card pasaporte-compartir-card">
                <h3 class="seccion-titulo">Compartir ficha</h3>
                <p class="qr-descripcion">Genera un enlace temporal (con vencimiento) para compartir la información de ${esc(mascota.nombre)} con alguien puntual, como un cuidador o un veterinario nuevo.</p>

                ${compartidos.length ? `
                    <div class="historial-lista pasaporte-compartidos-lista">
                        ${compartidos.map((c) => `
                            <div class="historial-fila">
                                <div class="historial-fila-info">
                                    <strong>Enlace generado ${Utils.formatearFecha((c.created_at || '').slice(0, 10))}</strong>
                                    <span class="historial-fila-sub">Vence: ${Utils.formatearFecha((c.expira_at || '').slice(0, 10))}</span>
                                </div>
                                <button type="button" class="btn-secundario btn-copiar-pasaporte" data-token="${c.token}">Copiar enlace</button>
                                <button type="button" class="btn-peligro btn-revocar-pasaporte" data-id="${c.id}">Revocar</button>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}

                <button type="button" class="btn-primario btn-ancho-auto" id="btnAbrirCompartir">${formCompartirAbierto ? 'Cancelar' : '🔗 Generar nuevo enlace'}</button>

                ${formCompartirAbierto ? `
                    <div class="pasaporte-form-compartir">
                        <div class="field-group">
                            <label>Vence en</label>
                            <div class="input-wrap">
                                <select id="pasDuracion">
                                    ${DURACIONES.map((d) => `<option value="${d.valor}">${d.etiqueta}</option>`).join('')}
                                </select>
                            </div>
                        </div>
                        <div class="pasaporte-secciones">
                            ${SECCIONES.map((s) => `<label class="check-inline"><input type="checkbox" class="pas-seccion-check" data-seccion="${s.id}" checked> ${s.etiqueta}</label>`).join('')}
                        </div>
                        <div class="field-msg" id="pasaporteMensaje"></div>
                        <button type="button" class="btn-primario btn-ancho-auto" id="btnGenerarEnlace">Generar enlace</button>
                    </div>
                ` : ''}

                <div id="pasaporteResultado"></div>
            </div>
        `;
        wireEventos();
    }

    function dato(etiqueta, valor) {
        return `<div class="sos-item"><span class="sos-etiqueta">${etiqueta}</span><span>${esc(valor)}</span></div>`;
    }

    function seccionLista(titulo, items) {
        if (!items.length) return '';
        return `
            <div class="pasaporte-seccion">
                <strong class="pasaporte-seccion-titulo">${titulo}</strong>
                <ul class="pasaporte-seccion-lista">${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
            </div>
        `;
    }

    function wireEventos() {
        document.getElementById('btnAbrirCompartir').addEventListener('click', () => {
            formCompartirAbierto = !formCompartirAbierto;
            render();
        });

        const btnGenerar = document.getElementById('btnGenerarEnlace');
        if (btnGenerar) btnGenerar.addEventListener('click', generarEnlace);

        document.querySelectorAll('.btn-copiar-pasaporte').forEach((btn) => {
            btn.addEventListener('click', () => copiarEnlace(btn.dataset.token));
        });

        document.querySelectorAll('.btn-revocar-pasaporte').forEach((btn) => {
            btn.addEventListener('click', () => revocarEnlace(btn.dataset.id));
        });
    }

    async function generarEnlace() {
        const btn = document.getElementById('btnGenerarEnlace');
        const mensaje = document.getElementById('pasaporteMensaje');
        const dias = Number(document.getElementById('pasDuracion').value);

        const secciones = {};
        document.querySelectorAll('.pas-seccion-check').forEach((chk) => { secciones[chk.dataset.seccion] = chk.checked; });

        const expiraAt = new Date(Date.now() + dias * 86400000).toISOString();

        Utils.setLoading(btn, true);
        const { data, error } = await db.from('mascotas_pasaporte_compartido')
            .insert({ mascota_id: mascota.id, secciones, expira_at: expiraAt, creado_por: window.appData.usuario.id })
            .select()
            .single();
        Utils.setLoading(btn, false);

        if (error) {
            mensaje.textContent = error.message;
            mensaje.className = 'field-msg msg-error';
            return;
        }

        Utils.toast('Enlace generado', 'exito');
        formCompartirAbierto = false;
        await cargarTodo();
        render();
        mostrarResultado(data.token);
    }

    function mostrarResultado(token) {
        const url = urlPasaporte(token);
        const qrImg = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(url)}`;
        document.getElementById('pasaporteResultado').innerHTML = `
            <div class="qr-contenido">
                <img src="${qrImg}" alt="QR del pasaporte compartido" class="qr-imagen">
                <div class="qr-acciones">
                    <input type="text" readonly value="${url}" class="qr-link-input" id="pasaporteLinkInput">
                    <button type="button" class="btn-secundario" id="btnCopiarNuevoPasaporte">Copiar enlace</button>
                </div>
            </div>
        `;
        document.getElementById('btnCopiarNuevoPasaporte').addEventListener('click', () => {
            const input = document.getElementById('pasaporteLinkInput');
            input.select();
            navigator.clipboard?.writeText(input.value).then(() => Utils.toast('Enlace copiado', 'exito'));
        });
    }

    function urlPasaporte(token) {
        return `${window.location.origin}/pasaporte.html?t=${token}`;
    }

    function copiarEnlace(token) {
        const url = urlPasaporte(token);
        if (navigator.clipboard) {
            navigator.clipboard.writeText(url).then(() => Utils.toast('Enlace copiado', 'exito'));
        }
    }

    async function revocarEnlace(id) {
        if (!confirm('¿Revocar este enlace? Dejará de funcionar de inmediato.')) return;

        const { error } = await db.from('mascotas_pasaporte_compartido').delete().eq('id', id);
        if (error) {
            Utils.toast('No se pudo revocar: ' + error.message, 'error');
            return;
        }

        Utils.toast('Enlace revocado', 'exito');
        await cargarTodo();
        render();
    }

    function etiquetaSexo(sexo) {
        return { macho: 'Macho', hembra: 'Hembra' }[sexo] || 'Sexo sin registrar';
    }

    function capitalizar(s) {
        return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
    }

    function esc(v) {
        return (v || '').toString().replace(/"/g, '&quot;');
    }

    return { init };
})();

window.Pasaporte = Pasaporte;
