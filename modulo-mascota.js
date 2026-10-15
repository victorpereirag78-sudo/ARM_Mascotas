// ================================================================
// MODULO-MASCOTA.JS — Mis mascotas y ficha de cada mascota (panel-mascotas)
// Depende de: config.js, utils.js, auth.js
// Expone window.Mascota (incluye cargarMascotas(), reutilizado por
// modulo-dashboard.js y modulo-compartir.js para no repetir la query)
//
// Ficha: cabecera con la foto y los datos clave + pestañas. Cada
// pestaña monta su módulo recién al abrirla (Historial, CarpetaVet,
// QR + Perdida, Pasaporte, AutorizacionVet) y "Datos" es el formulario.
// ================================================================

const Mascota = (() => {

    let vista = 'lista';       // 'lista' | 'formulario'
    let editando = null;       // fila de mascota en edición, o null si es alta
    let contenedorActual = null;
    let pestana = 'salud';
    let montadas = new Set();
    let subPedida = null;      // subsección a abrir (ej. 'recetas' de la carpeta), desde los accesos del inicio

    const PESTANAS = [
        ['salud', '🩺 Salud'],
        ['veterinaria', '🏥 Veterinaria'],
        ['sos', '🆘 SOS y QR'],
        ['pasaporte', '🛂 Pasaporte'],
        ['compartir', '🩻 Veterinarios'],
        ['datos', '✏️ Datos']
    ];

    async function init(el) {
        contenedorActual = el;
        vista = 'lista';
        editando = null;
        await cargarMascotas();
        // Llegó desde el inicio o desde un aviso de la veterinaria: abrir
        // directo esa mascota (el aviso abre la pestaña de la veterinaria).
        const abrir = sessionStorage.getItem('arm_abrir_mascota');
        const desdeVet = sessionStorage.getItem('arm_abrir_mascota_vet');
        const pestanaPedida = sessionStorage.getItem('arm_abrir_pestana');
        subPedida = sessionStorage.getItem('arm_abrir_sub');
        ['arm_abrir_mascota', 'arm_abrir_mascota_vet', 'arm_abrir_pestana', 'arm_abrir_sub'].forEach((k) => sessionStorage.removeItem(k));
        if (abrir) {
            const m = (window.appData.mascotas || []).find((x) => x.id === abrir);
            if (m) abrirFicha(m, pestanaPedida || (desdeVet ? 'veterinaria' : 'salud'));
            else render();
            return;
        }
        if (sessionStorage.getItem('arm_nueva_mascota')) {
            sessionStorage.removeItem('arm_nueva_mascota');
            vista = 'formulario';
        }
        render();
    }

    async function cargarMascotas() {
        const { data, error } = await db
            .from('mascotas')
            .select('*')
            .eq('activo', true)
            .order('created_at', { ascending: false });

        if (error) {
            Utils.toast('No se pudieron cargar las mascotas: ' + error.message, 'error');
            window.appData.mascotas = [];
            return [];
        }
        window.appData.mascotas = data;
        return data;
    }

    function abrirFicha(m, pestanaInicial) {
        editando = m;
        vista = 'formulario';
        pestana = pestanaInicial || 'salud';
        render();
    }

    function render() {
        if (!contenedorActual) return;
        montadas = new Set();
        contenedorActual.innerHTML = vista === 'lista' ? plantillaLista() : editando ? plantillaFicha(editando) : plantillaAlta();
        wireEventos();
        if (vista === 'formulario' && editando) mostrarPestana(pestana);
    }

    // ── Vista lista ──────────────────────────────────────────────
    function plantillaLista() {
        const mascotas = window.appData.mascotas || [];
        return `
            <div class="mascota-toolbar">
                <p class="mascota-toolbar-texto">${mascotas.length ? `${mascotas.length} ${mascotas.length === 1 ? 'mascota registrada' : 'mascotas registradas'}` : ''}</p>
                <button class="btn-primario btn-ancho-auto" id="btnNuevaMascota">+ Agregar mascota</button>
            </div>
            ${mascotas.length ? `<div class="mascota-grid">${mascotas.map(tarjetaMascota).join('')}</div>` : plantillaEstadoVacio()}
        `;
    }

    function plantillaEstadoVacio() {
        return `
            <div class="estado-vacio">
                <span class="estado-vacio-icono">🐾</span>
                <p>Aún no registras mascotas.</p>
                <p>Presiona "Agregar mascota" para crear la primera ficha.</p>
            </div>
        `;
    }

    function tarjetaMascota(m) {
        const edad = Utils.calcularEdadMascota(m.fecha_nacimiento, m.especie);
        return `
            <article class="mascota-card" data-id="${m.id}" tabindex="0" role="button" aria-label="Abrir la ficha de ${esc(m.nombre)}">
                <div class="mascota-card-foto" ${m.foto_url ? `style="--foto:url('${m.foto_url}')"` : ''}>
                    ${m.foto_url ? `<img src="${m.foto_url}" alt="${esc(m.nombre)}">` : `<span>${Utils.emojiEspecie(m)}</span>`}
                </div>
                <div class="mascota-card-info">
                    <h3>${esc(m.nombre)}</h3>
                    <p>${esc(m.raza) || Utils.nombreEspecie(m)}${m.sexo ? ' · ' + capitalizar(m.sexo) : ''}</p>
                    <div class="mascota-card-chips">
                        <span>🎂 ${Utils.textoEdad(edad)}</span>
                        ${m.peso_actual ? `<span>⚖️ ${m.peso_actual} kg</span>` : ''}
                    </div>
                    <span class="mascota-card-ir">Ver ficha →</span>
                </div>
            </article>
        `;
    }

    // ── Alta (mascota nueva) ─────────────────────────────────────
    function plantillaAlta() {
        return `
            <div class="ficha">
                <div class="ficha-barra">
                    <button class="btn-secundario" id="btnVolverLista">← Mis mascotas</button>
                </div>
                <div class="card ficha-datos">
                    <h2 class="ficha-alta-titulo">Nueva mascota</h2>
                    <p class="nota-foto">📷 Podrás agregar la foto apenas crees la ficha.</p>
                    ${plantillaFormulario({})}
                </div>
            </div>
        `;
    }

    // ── Ficha (cabecera + pestañas) ──────────────────────────────
    function plantillaFicha(m) {
        const edad = Utils.calcularEdadMascota(m.fecha_nacimiento, m.especie);
        const dias = Utils.diasParaCumpleanos(m.fecha_nacimiento);
        const sub = [esc(m.raza), Utils.nombreEspecie(m), m.sexo ? capitalizar(m.sexo) : '', m.estado_reproductivo === 'esterilizado' ? 'Esterilizado' : '']
            .filter(Boolean).join(' · ');
        const chip = (etiqueta, valor) => (valor ? `<div class="ficha-chip"><small>${etiqueta}</small><b>${valor}</b></div>` : '');

        return `
            <div class="ficha">
                <div class="ficha-barra">
                    <button class="btn-secundario" id="btnVolverLista">← Mis mascotas</button>
                </div>

                <section class="card ficha-cabecera">
                    <div class="ficha-foto" id="avatarMascotaPreview" ${m.foto_url ? `style="--foto:url('${m.foto_url}')"` : ''}>
                        ${m.foto_url ? `<img src="${m.foto_url}" alt="${esc(m.nombre)}">` : `<span>${Utils.emojiEspecie(m)}</span>`}
                    </div>
                    <div class="ficha-identidad">
                        <h2>${esc(m.nombre)}</h2>
                        <p class="ficha-sub">${sub}</p>
                        <div class="ficha-chips">
                            ${chip('Edad', Utils.textoEdad(edad))}
                            ${chip('Edad humana', edad.edadHumanaEquivalente !== null ? `${edad.edadHumanaEquivalente} años` : '')}
                            ${chip('Peso', m.peso_actual ? `${m.peso_actual} kg` : '')}
                            ${chip('Cumpleaños', dias === null ? '' : dias === 0 ? '¡Hoy! 🎉' : `en ${dias} días`)}
                            ${chip('Microchip', esc(m.microchip))}
                        </div>
                    </div>
                    <label class="btn-secundario btn-subir-foto ficha-cambiar-foto">
                        📷 Cambiar foto
                        <input type="file" id="inputFotoMascota" accept="image/*" hidden>
                    </label>
                </section>

                <nav class="ficha-tabs" role="tablist" aria-label="Secciones de la ficha">
                    ${PESTANAS.map(([k, t]) => `<button type="button" role="tab" class="ficha-tab" data-pestana="${k}">${t}</button>`).join('')}
                </nav>

                <div class="ficha-panel" data-panel="salud" hidden>
                    <p class="ficha-panel-ayuda">Lo que tú registras: vacunas, consultas, medicamentos, alimentación, gastos y su diario.</p>
                    <div id="historialContenedor"></div>
                </div>
                <div class="ficha-panel" data-panel="veterinaria" hidden>
                    <p class="ficha-panel-ayuda">Lo que registró su veterinaria en ARM Veterinaria (solo lectura).</p>
                    <div id="carpetaVetContenedor" class="card"></div>
                </div>
                <div class="ficha-panel" data-panel="sos" hidden>
                    <div id="qrContenedor" class="grid-tarjetas"></div>
                    <h3 class="titulo-bloque ficha-subtitulo">🚨 Mascota perdida</h3>
                    <div id="perdidaContenedor"></div>
                </div>
                <div class="ficha-panel" data-panel="pasaporte" hidden>
                    <div id="pasaporteContenedor" class="grid-tarjetas"></div>
                </div>
                <div class="ficha-panel" data-panel="compartir" hidden>
                    <p class="ficha-panel-ayuda">Veterinarios que pueden ver la historia de ${esc(m.nombre)} con su cuenta de ARM Mascotas.</p>
                    <div id="autorizacionVetContenedor" class="form-lateral"></div>
                </div>
                <div class="ficha-panel" data-panel="datos" hidden>
                    <div class="card ficha-datos">${plantillaFormulario(m)}</div>
                </div>
            </div>
        `;
    }

    function mostrarPestana(clave) {
        pestana = clave;
        contenedorActual.querySelectorAll('.ficha-tab').forEach((b) => {
            const activa = b.dataset.pestana === clave;
            b.classList.toggle('activa', activa);
            b.setAttribute('aria-selected', activa ? 'true' : 'false');
        });
        contenedorActual.querySelectorAll('.ficha-panel').forEach((p) => (p.hidden = p.dataset.panel !== clave));
        montar(clave);
    }

    // Monta el módulo de la pestaña. Salud y Veterinaria se montan una vez;
    // SOS y Pasaporte se recargan cada vez porque resumen datos de las otras.
    function montar(clave) {
        if (!editando) return;
        const unaVez = ['salud', 'veterinaria', 'compartir', 'datos'].includes(clave);
        if (unaVez && montadas.has(clave)) return;
        montadas.add(clave);
        const $ = (id) => document.getElementById(id);
        const sub = subPedida;
        subPedida = null;
        if (clave === 'salud' && $('historialContenedor')) Historial.init($('historialContenedor'), editando.id, sub);
        if (clave === 'veterinaria' && $('carpetaVetContenedor') && window.CarpetaVet) CarpetaVet.init($('carpetaVetContenedor'), editando, sub);
        if (clave === 'sos') {
            if ($('qrContenedor')) QR.init($('qrContenedor'), editando);
            if ($('perdidaContenedor')) Perdida.init($('perdidaContenedor'), editando);
        }
        if (clave === 'pasaporte' && $('pasaporteContenedor')) Pasaporte.init($('pasaporteContenedor'), editando);
        if (clave === 'compartir' && $('autorizacionVetContenedor')) AutorizacionVet.init($('autorizacionVetContenedor'), editando.id);
    }

    function plantillaFormulario(m) {
        const esEdicion = !!m.id;
        const edad = Utils.calcularEdadMascota(m.fecha_nacimiento, m.especie || 'perro');
        return `
                <form id="formMascota" novalidate>
                    <div class="ficha-form-secciones">
                    <div>
                    <h3 class="seccion-titulo">Datos básicos</h3>
                    <div class="grid-2">
                        <div class="field-group">
                            <label>Nombre *</label>
                            <div class="input-wrap"><input type="text" id="mNombre" value="${esc(m.nombre)}" required></div>
                        </div>
                        <div class="field-group field-ancho">
                            <label>Especie *</label>
                            <input type="hidden" id="mEspecie" value="${esc(m.especie || 'perro')}">
                            <input type="hidden" id="mEspecieCodigo" value="${esc(m.especie_codigo || m.especie || 'perro')}">
                            <div class="especie-grid" id="mEspecieGrid" role="radiogroup" aria-label="Especie">
                                ${Object.entries(Utils.ESPECIES_CAT).map(([k, v]) => `<button type="button" class="especie-op ${(m.especie_codigo || m.especie || 'perro') === k ? 'activo' : ''}" role="radio"
                                    aria-checked="${(m.especie_codigo || m.especie || 'perro') === k}" data-especie="${k}"><span>${v[0]}</span>${v[1]}</button>`).join('')}
                            </div>
                        </div>
                        <div class="field-group">
                            <label>Raza o tipo</label>
                            <div class="input-wrap"><input type="text" id="mRaza" list="mRazaLista" value="${esc(m.raza)}" placeholder="Elige de la lista o escríbela" autocomplete="off"></div>
                            <datalist id="mRazaLista"></datalist>
                        </div>
                        <div class="field-group">
                            <label>Sexo</label>
                            <div class="input-wrap">
                                <select id="mSexo">
                                    <option value="">Sin especificar</option>
                                    <option value="macho" ${sel(m.sexo, 'macho')}>Macho</option>
                                    <option value="hembra" ${sel(m.sexo, 'hembra')}>Hembra</option>
                                </select>
                            </div>
                        </div>
                        <div class="field-group">
                            <label>Fecha de nacimiento</label>
                            <div class="input-wrap"><input type="date" id="mFechaNacimiento" value="${m.fecha_nacimiento || ''}" max="${Utils.hoy()}"></div>
                        </div>
                        <div class="field-group">
                            <label>Edad calculada</label>
                            <div class="input-wrap"><span class="edad-en-vivo" id="edadEnVivo">${Utils.textoEdad(edad)}${edad.edadHumanaEquivalente !== null ? ` · ${edad.edadHumanaEquivalente} años humanos` : ''}</span></div>
                        </div>
                    </div>
                    </div>

                    <div>
                    <h3 class="seccion-titulo">Características</h3>
                    <div class="grid-2">
                        <div class="field-group">
                            <label>Peso actual (kg)</label>
                            <div class="input-wrap"><input type="number" step="0.1" min="0" id="mPeso" value="${m.peso_actual ?? ''}"></div>
                        </div>
                        <div class="field-group">
                            <label>Color</label>
                            <div class="input-wrap"><input type="text" id="mColor" value="${esc(m.color)}"></div>
                        </div>
                        <div class="field-group">
                            <label>Estado reproductivo</label>
                            <div class="input-wrap">
                                <select id="mEstadoReproductivo">
                                    <option value="desconocido" ${sel(m.estado_reproductivo, 'desconocido')}>Desconocido</option>
                                    <option value="entero" ${sel(m.estado_reproductivo, 'entero')}>Entero</option>
                                    <option value="esterilizado" ${sel(m.estado_reproductivo, 'esterilizado')}>Esterilizado</option>
                                </select>
                            </div>
                        </div>
                        <div class="field-group">
                            <label>Microchip</label>
                            <div class="input-wrap"><input type="text" id="mMicrochip" value="${esc(m.microchip)}"></div>
                        </div>
                        <div class="field-group field-ancho-completo">
                            <label>Características físicas</label>
                            <div class="input-wrap"><input type="text" id="mCaracteristicas" value="${esc(m.caracteristicas_fisicas)}"></div>
                        </div>
                        <div class="field-group field-ancho-completo">
                            <label>Observaciones</label>
                            <div class="input-wrap"><input type="text" id="mObservaciones" value="${esc(m.observaciones)}"></div>
                        </div>
                    </div>
                    </div>
                    </div>

                    <div class="field-msg" id="mascotaMensaje"></div>
                    <div class="mascota-form-acciones">
                        <button type="submit" class="btn-primario btn-ancho-auto" id="btnGuardarMascota">${esEdicion ? 'Guardar cambios' : 'Crear ficha'}</button>
                        ${esEdicion ? `<button type="button" class="btn-peligro" id="btnEliminarMascota">Eliminar mascota</button>` : ''}
                    </div>
                </form>
        `;
    }

    function wireEventos() {
        if (vista === 'lista') {
            document.getElementById('btnNuevaMascota').addEventListener('click', () => {
                editando = null;
                vista = 'formulario';
                render();
            });
            contenedorActual.querySelectorAll('.mascota-card').forEach((card) => {
                const abrir = () => abrirFicha((window.appData.mascotas || []).find((m) => m.id === card.dataset.id), 'salud');
                card.addEventListener('click', abrir);
                card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); } });
            });
            return;
        }

        document.getElementById('btnVolverLista').addEventListener('click', () => {
            vista = 'lista';
            editando = null;
            render();
            window.scrollTo({ top: 0 });
        });

        contenedorActual.querySelectorAll('.ficha-tab').forEach((b) => b.addEventListener('click', () => mostrarPestana(b.dataset.pestana)));

        document.getElementById('mFechaNacimiento').addEventListener('input', actualizarEdadEnVivo);
        conectarEspecies();
        document.getElementById('formMascota').addEventListener('submit', guardar);

        const inputFoto = document.getElementById('inputFotoMascota');
        if (inputFoto) inputFoto.addEventListener('change', subirFoto);

        const btnEliminar = document.getElementById('btnEliminarMascota');
        if (btnEliminar) btnEliminar.addEventListener('click', eliminar);
    }

    // ── Especie y raza (catálogo compartido con la veterinaria) ──
    // Perro y gato se guardan con su enum; el resto como 'otro' más el código fino
    // (la base mantiene ambos coherentes).
    let catalogoRazas = null;
    async function cargarRazas() {
        if (catalogoRazas) return catalogoRazas;
        try {
            const { data, error } = await db.from('vet_razas').select('especie,nombre').order('nombre');
            if (error) throw error;
            catalogoRazas = data || [];
        } catch (_e) { catalogoRazas = []; } // sin catálogo (sin red): la raza se escribe a mano
        return catalogoRazas;
    }

    async function pintarRazas() {
        const lista = document.getElementById('mRazaLista');
        if (!lista) return;
        const codigo = document.getElementById('mEspecieCodigo').value;
        const razas = await cargarRazas();
        lista.innerHTML = razas.filter((r) => r.especie === codigo).map((r) => `<option value="${esc(r.nombre)}"></option>`).join('');
    }

    function conectarEspecies() {
        const grid = document.getElementById('mEspecieGrid');
        if (!grid) return;
        grid.querySelectorAll('.especie-op').forEach((b) => b.addEventListener('click', () => {
            const codigo = b.dataset.especie;
            const cambio = document.getElementById('mEspecieCodigo').value !== codigo;
            document.getElementById('mEspecieCodigo').value = codigo;
            document.getElementById('mEspecie').value = codigo === 'perro' || codigo === 'gato' ? codigo : 'otro';
            grid.querySelectorAll('.especie-op').forEach((x) => { x.classList.toggle('activo', x === b); x.setAttribute('aria-checked', x === b ? 'true' : 'false'); });
            if (cambio) document.getElementById('mRaza').value = '';
            pintarRazas();
            actualizarEdadEnVivo();
        }));
        pintarRazas();
    }

    function actualizarEdadEnVivo() {
        const fecha = document.getElementById('mFechaNacimiento').value;
        const especie = document.getElementById('mEspecie').value;
        const edad = Utils.calcularEdadMascota(fecha, especie);
        const texto = Utils.textoEdad(edad) + (edad.edadHumanaEquivalente !== null ? ` · ${edad.edadHumanaEquivalente} años humanos` : '');
        document.getElementById('edadEnVivo').textContent = texto;
    }

    async function guardar(ev) {
        ev.preventDefault();
        const btn = document.getElementById('btnGuardarMascota');
        const mensaje = document.getElementById('mascotaMensaje');

        const datos = {
            nombre: valor('mNombre'),
            especie: valor('mEspecie'),
            especie_codigo: valor('mEspecieCodigo') || valor('mEspecie'),
            raza: valor('mRaza'),
            sexo: valor('mSexo') || null,
            fecha_nacimiento: valor('mFechaNacimiento') || null,
            peso_actual: valorNumerico('mPeso'),
            color: valor('mColor'),
            estado_reproductivo: valor('mEstadoReproductivo'),
            microchip: valor('mMicrochip'),
            caracteristicas_fisicas: valor('mCaracteristicas'),
            observaciones: valor('mObservaciones')
        };

        if (!datos.nombre || !datos.especie) {
            mensaje.textContent = 'Nombre y especie son obligatorios.';
            mensaje.className = 'field-msg msg-error';
            return;
        }

        if (datos.fecha_nacimiento && datos.fecha_nacimiento > Utils.hoy()) {
            mensaje.textContent = 'La fecha de nacimiento no puede ser posterior a hoy.';
            mensaje.className = 'field-msg msg-error';
            return;
        }

        Utils.setLoading(btn, true);

        let error;
        let creada = null;
        if (editando) {
            ({ error } = await db.from('mascotas').update(datos).eq('id', editando.id));
        } else {
            ({ data: creada, error } = await db.from('mascotas').insert({ ...datos, dueno_id: window.appData.usuario.id }).select('id').maybeSingle());
        }

        Utils.setLoading(btn, false);

        if (error) {
            mensaje.textContent = /microchip/i.test(error.message) ? 'Ese microchip ya está registrado en otra mascota.' : error.message;
            mensaje.className = 'field-msg msg-error';
            return;
        }

        Utils.toast(editando ? 'Mascota actualizada' : 'Ficha creada: ya puedes agregar su foto', 'exito');
        const idFicha = editando ? editando.id : creada && creada.id;
        await cargarMascotas();
        // Sigue en la ficha (con la cabecera ya actualizada) en vez de volver al listado.
        const fila = idFicha && (window.appData.mascotas || []).find((x) => x.id === idFicha);
        if (fila) abrirFicha(fila, editando ? 'datos' : 'salud');
        else { vista = 'lista'; editando = null; render(); }
    }

    async function subirFoto(ev) {
        const file = ev.target.files[0];
        if (!file || !editando) return;

        const res = await Utils.subirArchivo(BUCKET_FOTOS_MASCOTAS, editando.id, file);
        if (!res.ok) {
            Utils.toast('No se pudo subir la foto: ' + res.error, 'error');
            return;
        }

        const { error } = await db.from('mascotas').update({ foto_url: res.url }).eq('id', editando.id);
        if (error) {
            Utils.toast('No se pudo guardar la foto: ' + error.message, 'error');
            return;
        }

        editando.foto_url = res.url;
        const foto = document.getElementById('avatarMascotaPreview');
        foto.style.setProperty('--foto', `url('${res.url}')`);
        foto.innerHTML = `<img src="${res.url}" alt="${esc(editando.nombre)}">`;
        await cargarMascotas();
        Utils.toast('Foto actualizada', 'exito');
    }

    async function eliminar() {
        if (!editando) return;
        if (!confirm(`¿Eliminar la ficha de ${editando.nombre}? Esta acción no se puede deshacer.`)) return;

        const { error } = await db.from('mascotas').update({ activo: false }).eq('id', editando.id);
        if (error) {
            Utils.toast('No se pudo eliminar: ' + error.message, 'error');
            return;
        }

        Utils.toast('Mascota eliminada', 'exito');
        await cargarMascotas();
        vista = 'lista';
        editando = null;
        render();
    }

    function valor(id) {
        const el = document.getElementById(id);
        return el ? el.value.trim() || null : null;
    }

    function valorNumerico(id) {
        const v = valor(id);
        return v === null ? null : Number(v);
    }

    function sel(actual, esperado) {
        return actual === esperado ? 'selected' : '';
    }

    function capitalizar(s) {
        return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
    }

    function esc(v) {
        return (v || '').toString().replace(/"/g, '&quot;');
    }

    return { init, cargarMascotas };
})();

window.Mascota = Mascota;
