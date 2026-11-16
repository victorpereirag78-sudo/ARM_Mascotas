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
    let stickers = [];
    const MAX_STICKERS = 12;
    const MAX_PESO_FOTO = 8 * 1024 * 1024;
    let formCompartirAbierto = false;

    async function init(el, m) {
        contenedor = el;
        mascota = m;
        el.innerHTML = `<div class="estado-vacio"><p>Cargando pasaporte...</p></div>`;
        await cargarTodo();
        render();
    }

    async function cargarTodo() {
        const [vacunas, desparasitaciones, medicamentos, alergias, diagnosticos, cirugias, consultas, compartidosData, stickersData] = await Promise.all([
            consultar('mascotas_vacunas', 'fecha'),
            consultar('mascotas_desparasitaciones', 'fecha'),
            consultar('mascotas_medicamentos', 'created_at'),
            consultar('mascotas_alergias', 'created_at'),
            consultar('mascotas_diagnosticos', 'fecha'),
            consultar('mascotas_cirugias', 'fecha'),
            consultar('mascotas_consultas', 'fecha'),
            db.from('mascotas_pasaporte_compartido').select('*').eq('mascota_id', mascota.id).gt('expira_at', new Date().toISOString()).order('created_at', { ascending: false }),
            db.from('mascotas_pasaporte_stickers').select('*').eq('mascota_id', mascota.id).order('created_at', { ascending: true })
        ]);
        datos = { vacunas, desparasitaciones, medicamentos, alergias, diagnosticos, cirugias, consultas };
        compartidos = compartidosData.data || [];
        stickers = stickersData.data || [];
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
                        ${mascota.foto_url ? `<img src="${mascota.foto_url}" alt="${esc(mascota.nombre)}">` : `<span>${Utils.emojiEspecie(mascota)}</span>`}
                    </div>
                    <div>
                        <h2>${esc(mascota.nombre)}</h2>
                        <p class="dashboard-card-sub">${esc(mascota.raza) || capitalizar(mascota.especie)} · ${etiquetaSexo(mascota.sexo)} · ${Utils.textoEdad(edad)}</p>
                    </div>
                </div>

                <div id="pasaporteInternacional"></div>

                <div class="pasaporte-grid">
                    ${dato('Peso', mascota.peso_actual ? mascota.peso_actual + ' kg' : '—')}
                    ${dato('Color', mascota.color || '—')}
                    ${dato('Microchip', mascota.microchip || 'Sin registrar')}
                    ${dato('Nacimiento', mascota.fecha_nacimiento ? Utils.formatearFecha(mascota.fecha_nacimiento) : '—')}
                </div>

                <h4 class="seccion-titulo">Vacunas: stickers y antirrábica</h4>
                <div class="pasaporte-vacunas-extra">
                    <div class="field-group">
                        <label for="pasSerieAntirrabica">Serie vacuna antirrábica</label>
                        <div class="pasaporte-serie-fila">
                            <div class="input-wrap">
                                <input type="text" id="pasSerieAntirrabica" maxlength="60" autocomplete="off"
                                    placeholder="N.º de serie que trae el sticker" value="${esc(mascota.serie_antirrabica)}">
                            </div>
                            <button type="button" class="btn-secundario" id="btnGuardarSerie">Guardar</button>
                        </div>
                    </div>

                    <p class="qr-descripcion">Sube la foto de los stickers de las vacunas (los autoadhesivos del carnet) para tenerlos siempre a mano.</p>
                    ${stickers.length ? `
                        <div class="pasaporte-stickers">
                            ${stickers.map((s) => `
                                <figure class="pasaporte-sticker">
                                    <a href="${esc(s.url)}" target="_blank" rel="noopener" title="Ver en grande">
                                        <img src="${esc(s.url)}" alt="Stickers de vacunas de ${esc(mascota.nombre)}" loading="lazy">
                                    </a>
                                    <figcaption>${Utils.formatearFecha((s.created_at || '').slice(0, 10))}</figcaption>
                                    <button type="button" class="pasaporte-sticker-quitar btn-quitar-sticker" data-id="${s.id}" aria-label="Eliminar foto">✕</button>
                                </figure>
                            `).join('')}
                        </div>
                    ` : ''}
                    ${stickers.length < MAX_STICKERS ? `
                        <label class="btn-secundario btn-ancho-auto pasaporte-subir" id="pasSubirEtiqueta">
                            📷 Subir foto de stickers
                            <input type="file" id="pasStickerArchivo" accept="image/*" hidden>
                        </label>
                    ` : `<p class="qr-descripcion">Llegaste al máximo de ${MAX_STICKERS} fotos. Elimina alguna para subir otra.</p>`}
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
        // Pasaporte internacional (documento oficial publicado por la clínica): solo aparece si hay uno.
        if (window.PasaporteInternacional) PasaporteInternacional.montar(document.getElementById('pasaporteInternacional'), mascota);
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

        document.getElementById('btnGuardarSerie').addEventListener('click', guardarSerie);
        const archivo = document.getElementById('pasStickerArchivo');
        if (archivo) archivo.addEventListener('change', subirSticker);
        document.querySelectorAll('.btn-quitar-sticker').forEach((btn) => {
            btn.addEventListener('click', () => quitarSticker(btn.dataset.id));
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

    async function guardarSerie() {
        const btn = document.getElementById('btnGuardarSerie');
        const serie = document.getElementById('pasSerieAntirrabica').value.trim() || null;

        Utils.setLoading(btn, true);
        const { error } = await db.from('mascotas').update({ serie_antirrabica: serie }).eq('id', mascota.id);
        Utils.setLoading(btn, false);
        if (error) {
            Utils.toast('No se pudo guardar la serie: ' + error.message, 'error');
            return;
        }
        mascota.serie_antirrabica = serie;
        Utils.toast(serie ? 'Serie antirrábica guardada' : 'Serie antirrábica eliminada', 'exito');
    }

    async function subirSticker(ev) {
        const file = ev.target.files[0];
        ev.target.value = '';
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            Utils.toast('Elige una imagen (foto de los stickers).', 'error');
            return;
        }
        if (file.size > MAX_PESO_FOTO) {
            Utils.toast('La foto pesa más de 8 MB. Toma otra con menos resolución.', 'error');
            return;
        }

        const etiqueta = document.getElementById('pasSubirEtiqueta');
        etiqueta.classList.add('btn-cargando');
        const res = await Utils.subirArchivo(BUCKET_FOTOS_MASCOTAS, `${mascota.id}/stickers`, file);
        if (!res.ok) {
            etiqueta.classList.remove('btn-cargando');
            Utils.toast('No se pudo subir la foto: ' + res.error, 'error');
            return;
        }

        const { error } = await db.from('mascotas_pasaporte_stickers')
            .insert({ mascota_id: mascota.id, url: res.url, ruta: res.ruta, subido_por: window.appData.usuario.id });
        if (error) {
            // La fila no quedó: se retira el archivo para no dejarlo huérfano.
            await db.storage.from(BUCKET_FOTOS_MASCOTAS).remove([res.ruta]);
            etiqueta.classList.remove('btn-cargando');
            Utils.toast('No se pudo guardar la foto: ' + error.message, 'error');
            return;
        }

        Utils.toast('Foto de stickers guardada', 'exito');
        await cargarTodo();
        render();
    }

    async function quitarSticker(id) {
        const sticker = stickers.find((s) => s.id === id);
        if (!sticker || !confirm('¿Eliminar esta foto de stickers?')) return;

        const { error } = await db.from('mascotas_pasaporte_stickers').delete().eq('id', id);
        if (error) {
            Utils.toast('No se pudo eliminar: ' + error.message, 'error');
            return;
        }
        if (sticker.ruta) await db.storage.from(BUCKET_FOTOS_MASCOTAS).remove([sticker.ruta]);

        Utils.toast('Foto eliminada', 'exito');
        await cargarTodo();
        render();
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
