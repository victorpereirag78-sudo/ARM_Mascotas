// ================================================================
// MODULO-MASCOTA.JS — CRUD de mascotas (panel-mascotas)
// Depende de: config.js, utils.js, auth.js
// Expone window.Mascota (incluye cargarMascotas(), reutilizado por
// modulo-dashboard.js y modulo-compartir.js para no repetir la query)
// ================================================================

const Mascota = (() => {

    let vista = 'lista';       // 'lista' | 'formulario'
    let editando = null;       // fila de mascota en edición, o null si es alta
    let contenedorActual = null;

    async function init(el) {
        contenedorActual = el;
        vista = 'lista';
        editando = null;
        await cargarMascotas();
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

    function render() {
        if (!contenedorActual) return;
        contenedorActual.innerHTML = vista === 'lista' ? plantillaLista() : plantillaFormulario(editando);
        wireEventos();
    }

    // ── Vista lista ──────────────────────────────────────────────
    function plantillaLista() {
        const mascotas = window.appData.mascotas || [];
        const tarjetas = mascotas.map(tarjetaMascota).join('');
        return `
            <div class="mascota-toolbar">
                <button class="btn-primario btn-ancho-auto" id="btnNuevaMascota">+ Agregar mascota</button>
            </div>
            ${mascotas.length ? `<div class="mascota-grid">${tarjetas}</div>` : plantillaEstadoVacio()}
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
        const emojiEspecie = m.especie === 'perro' ? '🐶' : m.especie === 'gato' ? '🐱' : '🐾';
        return `
            <div class="mascota-card" data-id="${m.id}">
                <div class="mascota-card-foto">
                    ${m.foto_url ? `<img src="${m.foto_url}" alt="${esc(m.nombre)}">` : `<span>${emojiEspecie}</span>`}
                </div>
                <div class="mascota-card-info">
                    <h3>${esc(m.nombre)}</h3>
                    <p>${esc(m.raza) || capitalizar(m.especie)} · ${Utils.textoEdad(edad)}</p>
                    <button class="btn-secundario btn-editar-mascota" data-id="${m.id}">Ver ficha</button>
                </div>
            </div>
        `;
    }

    // ── Vista formulario (alta / edición) ───────────────────────
    function plantillaFormulario(m) {
        const esEdicion = !!m;
        m = m || {};
        const edad = Utils.calcularEdadMascota(m.fecha_nacimiento, m.especie || 'perro');

        return `
            <div class="form-panel-embed">
                <button class="btn-secundario" id="btnVolverLista">← Volver a mis mascotas</button>

                ${esEdicion ? `
                    <div class="perfil-avatar-fila mascota-avatar-fila">
                        <div class="perfil-avatar" id="avatarMascotaPreview">
                            ${m.foto_url ? `<img src="${m.foto_url}" alt="${esc(m.nombre)}">` : '🐾'}
                        </div>
                        <label class="btn-secundario btn-subir-foto">
                            Cambiar foto
                            <input type="file" id="inputFotoMascota" accept="image/*" hidden>
                        </label>
                    </div>
                ` : `<p class="nota-foto">📷 Podrás agregar la foto después de crear la ficha.</p>`}

                <form id="formMascota" novalidate>
                    <h3 class="seccion-titulo">Datos básicos</h3>
                    <div class="grid-2">
                        <div class="field-group">
                            <label>Nombre *</label>
                            <div class="input-wrap"><input type="text" id="mNombre" value="${esc(m.nombre)}" required></div>
                        </div>
                        <div class="field-group">
                            <label>Especie *</label>
                            <div class="input-wrap">
                                <select id="mEspecie" required>
                                    <option value="perro" ${sel(m.especie, 'perro')}>Perro</option>
                                    <option value="gato" ${sel(m.especie, 'gato')}>Gato</option>
                                    <option value="otro" ${sel(m.especie, 'otro')}>Otro</option>
                                </select>
                            </div>
                        </div>
                        <div class="field-group">
                            <label>Raza</label>
                            <div class="input-wrap"><input type="text" id="mRaza" value="${esc(m.raza)}"></div>
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

                    <div class="field-msg" id="mascotaMensaje"></div>
                    <div class="mascota-form-acciones">
                        <button type="submit" class="btn-primario btn-ancho-auto" id="btnGuardarMascota">${esEdicion ? 'Guardar cambios' : 'Crear ficha'}</button>
                        ${esEdicion ? `<button type="button" class="btn-peligro" id="btnEliminarMascota">Eliminar mascota</button>` : ''}
                    </div>
                </form>

                ${esEdicion ? `
                    <div class="historial-wrap">
                        <h3 class="seccion-titulo historial-wrap-titulo">SOS y código QR</h3>
                        <div id="qrContenedor"></div>
                    </div>
                    <div class="historial-wrap">
                        <h3 class="seccion-titulo historial-wrap-titulo">Veterinarios autorizados</h3>
                        <div id="autorizacionVetContenedor"></div>
                    </div>
                    <div class="historial-wrap">
                        <h3 class="seccion-titulo historial-wrap-titulo">Historia de vida</h3>
                        <div id="historialContenedor"></div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    function wireEventos() {
        if (vista === 'lista') {
            document.getElementById('btnNuevaMascota').addEventListener('click', () => {
                editando = null;
                vista = 'formulario';
                render();
            });
            document.querySelectorAll('.btn-editar-mascota').forEach((btn) => {
                btn.addEventListener('click', () => {
                    editando = (window.appData.mascotas || []).find((m) => m.id === btn.dataset.id);
                    vista = 'formulario';
                    render();
                });
            });
            return;
        }

        document.getElementById('btnVolverLista').addEventListener('click', () => {
            vista = 'lista';
            render();
        });

        document.getElementById('mFechaNacimiento').addEventListener('input', actualizarEdadEnVivo);
        document.getElementById('mEspecie').addEventListener('change', actualizarEdadEnVivo);

        document.getElementById('formMascota').addEventListener('submit', guardar);

        const inputFoto = document.getElementById('inputFotoMascota');
        if (inputFoto) inputFoto.addEventListener('change', subirFoto);

        const btnEliminar = document.getElementById('btnEliminarMascota');
        if (btnEliminar) btnEliminar.addEventListener('click', eliminar);

        const historialContenedor = document.getElementById('historialContenedor');
        if (historialContenedor && editando) {
            Historial.init(historialContenedor, editando.id);
        }

        const qrContenedor = document.getElementById('qrContenedor');
        if (qrContenedor && editando) {
            QR.init(qrContenedor, editando);
        }

        const autorizacionVetContenedor = document.getElementById('autorizacionVetContenedor');
        if (autorizacionVetContenedor && editando) {
            AutorizacionVet.init(autorizacionVetContenedor, editando.id);
        }
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
        if (editando) {
            ({ error } = await db.from('mascotas').update(datos).eq('id', editando.id));
        } else {
            ({ error } = await db.from('mascotas').insert({ ...datos, dueno_id: window.appData.usuario.id }));
        }

        Utils.setLoading(btn, false);

        if (error) {
            mensaje.textContent = /microchip/i.test(error.message) ? 'Ese microchip ya está registrado en otra mascota.' : error.message;
            mensaje.className = 'field-msg msg-error';
            return;
        }

        Utils.toast(editando ? 'Mascota actualizada' : 'Mascota creada', 'exito');
        await cargarMascotas();
        vista = 'lista';
        editando = null;
        render();
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
        document.getElementById('avatarMascotaPreview').innerHTML = `<img src="${res.url}" alt="${esc(editando.nombre)}">`;
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
