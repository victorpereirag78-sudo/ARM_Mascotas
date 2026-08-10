// ================================================================
// MODULO-VETERINARIO.JS — Panel del veterinario (panel-veterinario)
// Depende de: config.js, utils.js, auth.js, modulo-historial.js
// Expone window.Veterinario
// ================================================================

const Veterinario = (() => {

    let contenedor = null;
    let vista = 'lista'; // 'lista' | 'detalle'
    let miPerfilVet = null;
    let autorizaciones = [];
    let mascotaActiva = null;

    async function init(el) {
        contenedor = el;
        vista = 'lista';
        mascotaActiva = null;
        el.innerHTML = `<div class="estado-vacio"><p>Cargando...</p></div>`;

        const { data: vet, error } = await db
            .from('mascotas_veterinarios')
            .select('*')
            .eq('perfil_id', window.appData.usuario.id)
            .eq('activo', true)
            .maybeSingle();

        if (error || !vet) {
            el.innerHTML = `
                <div class="estado-vacio">
                    <span class="estado-vacio-icono">🩺</span>
                    <p>Tu cuenta todavía no tiene un perfil profesional vinculado.</p>
                    <p>Pídele al administrador de ARM Mascotas que complete tus datos de veterinario.</p>
                </div>
            `;
            return;
        }

        miPerfilVet = vet;
        await cargarAutorizaciones();
        render();
    }

    async function cargarAutorizaciones() {
        const { data, error } = await db
            .from('mascotas_autorizaciones_veterinario')
            .select('*, mascotas(id, nombre, especie, raza, foto_url, fecha_nacimiento, dueno_id, mascotas_perfiles(nombre, apellido, telefono, correo))')
            .eq('veterinario_id', miPerfilVet.id)
            .eq('activo', true)
            .order('created_at', { ascending: false });

        if (error) {
            Utils.toast('No se pudieron cargar las mascotas autorizadas: ' + error.message, 'error');
            autorizaciones = [];
            return;
        }
        autorizaciones = (data || []).filter((a) => a.mascotas);
    }

    function render() {
        contenedor.innerHTML = vista === 'lista' ? plantillaLista() : plantillaDetalle();
        wireEventos();

        if (vista === 'detalle' && mascotaActiva) {
            Historial.init(document.getElementById('vetHistorialContenedor'), mascotaActiva.id);
        }
    }

    function plantillaLista() {
        if (!autorizaciones.length) {
            return `
                <div class="estado-vacio">
                    <span class="estado-vacio-icono">🩺</span>
                    <p>Todavía no tienes mascotas autorizadas.</p>
                    <p>Pídele al dueño que te autorice desde la ficha de su mascota, con el correo <strong>${esc(miPerfilVet.correo)}</strong>.</p>
                </div>
            `;
        }

        const tarjetas = autorizaciones.map((a) => {
            const m = a.mascotas;
            const dueno = m.mascotas_perfiles;
            const emojiEspecie = m.especie === 'perro' ? '🐶' : m.especie === 'gato' ? '🐱' : '🐾';
            return `
                <div class="card vet-mascota-card" data-id="${m.id}">
                    <div class="mascota-card-foto vet-mascota-foto">
                        ${m.foto_url ? `<img src="${m.foto_url}" alt="${esc(m.nombre)}">` : `<span>${emojiEspecie}</span>`}
                    </div>
                    <div class="vet-mascota-info">
                        <h3>${esc(m.nombre)}</h3>
                        <p class="dashboard-card-sub">${esc(m.raza) || capitalizar(m.especie)}</p>
                        <p class="vet-mascota-dueno">Dueño: ${esc(`${dueno?.nombre || ''} ${dueno?.apellido || ''}`.trim())}${dueno?.telefono ? ' · ' + esc(dueno.telefono) : ''}</p>
                        <span class="badge-estado badge-aprobado">${etiquetaPermiso(a.nivel_permiso)}</span>
                    </div>
                    <button class="btn-secundario btn-vet-ver" data-id="${m.id}">Ver ficha clínica</button>
                </div>
            `;
        }).join('');

        return `<div class="mascota-grid">${tarjetas}</div>`;
    }

    function plantillaDetalle() {
        const m = mascotaActiva;
        const dueno = m.mascotas_perfiles;
        const edad = Utils.calcularEdadMascota(m.fecha_nacimiento, m.especie);

        return `
            <button class="btn-secundario" id="btnVolverLista">← Volver a mis pacientes</button>

            <div class="card vet-detalle-cabecera">
                <div class="dashboard-card-foto">
                    ${m.foto_url ? `<img src="${m.foto_url}" alt="${esc(m.nombre)}">` : `<span>${m.especie === 'perro' ? '🐶' : m.especie === 'gato' ? '🐱' : '🐾'}</span>`}
                </div>
                <div>
                    <h2>${esc(m.nombre)}</h2>
                    <p class="dashboard-card-sub">${esc(m.raza) || capitalizar(m.especie)} · ${Utils.textoEdad(edad)}</p>
                    <p class="vet-mascota-dueno">Dueño: ${esc(`${dueno?.nombre || ''} ${dueno?.apellido || ''}`.trim())} · ${esc(dueno?.telefono) || 'sin teléfono'} · ${esc(dueno?.correo)}</p>
                </div>
            </div>

            <div id="vetHistorialContenedor"></div>
        `;
    }

    function wireEventos() {
        if (vista === 'lista') {
            document.querySelectorAll('.btn-vet-ver').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const autorizacion = autorizaciones.find((a) => a.mascotas.id === btn.dataset.id);
                    mascotaActiva = autorizacion?.mascotas;
                    vista = 'detalle';
                    render();
                });
            });
            return;
        }

        document.getElementById('btnVolverLista').addEventListener('click', () => {
            vista = 'lista';
            mascotaActiva = null;
            render();
        });
    }

    function etiquetaPermiso(nivel) {
        return { lectura: 'Solo lectura', edicion: 'Puede editar', admin: 'Administrador' }[nivel] || nivel;
    }

    function capitalizar(s) {
        return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
    }

    function esc(v) {
        return (v || '').toString().replace(/"/g, '&quot;');
    }

    return { init };
})();

window.Veterinario = Veterinario;
