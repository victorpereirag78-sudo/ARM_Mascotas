// ================================================================
// MODULO-DASHBOARD.JS — Resumen de mascotas (panel-dashboard)
// Depende de: config.js, utils.js, auth.js, modulo-mascota.js
//   (reutiliza Mascota.cargarMascotas() para no duplicar la query)
// Expone window.Dashboard
// ================================================================

const Dashboard = (() => {

    let pendientesPorMascota = {};

    async function init(el) {
        el.innerHTML = `<div class="estado-vacio"><p>Cargando...</p></div>`;
        const mascotas = await Mascota.cargarMascotas();
        pendientesPorMascota = await cargarPendientes(mascotas.map((m) => m.id));
        el.innerHTML = plantilla(mascotas);
        wireEventos(el);
    }

    async function cargarPendientes(idsMascotas) {
        const resultado = {};
        idsMascotas.forEach((id) => (resultado[id] = { proximaVacuna: null, proximaDesparasitacion: null, gastoAnio: 0 }));
        if (!idsMascotas.length) return resultado;

        const hoy = Utils.hoy();
        const anioActual = new Date().getFullYear().toString();

        const [{ data: vacunas }, { data: despara }, { data: gastos }] = await Promise.all([
            db.from('mascotas_vacunas').select('mascota_id, proxima_dosis_fecha').in('mascota_id', idsMascotas).gte('proxima_dosis_fecha', hoy).order('proxima_dosis_fecha', { ascending: true }),
            db.from('mascotas_desparasitaciones').select('mascota_id, proxima_aplicacion').in('mascota_id', idsMascotas).gte('proxima_aplicacion', hoy).order('proxima_aplicacion', { ascending: true }),
            db.from('mascotas_gastos').select('mascota_id, monto, fecha').in('mascota_id', idsMascotas).gte('fecha', `${anioActual}-01-01`)
        ]);

        (vacunas || []).forEach((v) => {
            if (!resultado[v.mascota_id].proximaVacuna) resultado[v.mascota_id].proximaVacuna = v.proxima_dosis_fecha;
        });
        (despara || []).forEach((d) => {
            if (!resultado[d.mascota_id].proximaDesparasitacion) resultado[d.mascota_id].proximaDesparasitacion = d.proxima_aplicacion;
        });
        (gastos || []).forEach((g) => {
            resultado[g.mascota_id].gastoAnio += Number(g.monto);
        });

        return resultado;
    }

    function plantilla(mascotas) {
        const nombre = window.appData.perfil?.nombre || '';
        const saludo = `
            <div class="dashboard-cabecera">
                <h2 class="dashboard-saludo">Hola${nombre ? ', ' + esc(nombre) : ''} 👋</h2>
                <button class="btn-secundario" id="btnIrAgenda">🗓️ Ver agenda completa</button>
            </div>
        `;

        if (!mascotas.length) {
            return `
                ${saludo}
                <div class="estado-vacio">
                    <span class="estado-vacio-icono">🐾</span>
                    <p>Todavía no tienes mascotas registradas.</p>
                    <button class="btn-primario btn-ancho-auto" id="btnIrAMascotas">Agregar mi primera mascota</button>
                </div>
            `;
        }

        const tarjetas = mascotas.map(tarjetaResumen).join('');
        return `${saludo}<div class="dashboard-grid">${tarjetas}</div>`;
    }

    function tarjetaResumen(m) {
        const edad = Utils.calcularEdadMascota(m.fecha_nacimiento, m.especie);
        const dias = Utils.diasParaCumpleanos(m.fecha_nacimiento);
        const emojiEspecie = m.especie === 'perro' ? '🐶' : m.especie === 'gato' ? '🐱' : '🐾';
        const pendientes = pendientesPorMascota[m.id] || { proximaVacuna: null, proximaDesparasitacion: null, gastoAnio: 0 };

        return `
            <div class="card dashboard-card" data-id="${m.id}">
                <div class="dashboard-card-cabecera">
                    <div class="dashboard-card-foto">
                        ${m.foto_url ? `<img src="${m.foto_url}" alt="${esc(m.nombre)}">` : `<span>${emojiEspecie}</span>`}
                    </div>
                    <div>
                        <h3>${esc(m.nombre)}</h3>
                        <p class="dashboard-card-sub">${esc(m.raza) || capitalizar(m.especie)}</p>
                    </div>
                </div>

                <div class="dashboard-card-datos">
                    <div class="dato">
                        <span class="dato-etiqueta">Edad</span>
                        <span class="dato-valor">${Utils.textoEdad(edad)}</span>
                    </div>
                    ${edad.edadHumanaEquivalente !== null ? `
                        <div class="dato">
                            <span class="dato-etiqueta">Edad humana</span>
                            <span class="dato-valor">${edad.edadHumanaEquivalente} años</span>
                        </div>
                    ` : ''}
                    <div class="dato">
                        <span class="dato-etiqueta">Peso</span>
                        <span class="dato-valor">${m.peso_actual ? m.peso_actual + ' kg' : '—'}</span>
                    </div>
                    <div class="dato">
                        <span class="dato-etiqueta">Cumpleaños</span>
                        <span class="dato-valor">${dias === null ? '—' : dias === 0 ? '¡Hoy! 🎉' : `en ${dias} días`}</span>
                    </div>
                </div>

                <div class="dashboard-card-pendientes">
                    <span class="pendiente-item">💉 Próxima vacuna: ${textoPendiente(pendientes.proximaVacuna)}</span>
                    <span class="pendiente-item">🐛 Próxima desparasitación: ${textoPendiente(pendientes.proximaDesparasitacion)}</span>
                    <span class="pendiente-item">💰 Gastos ${new Date().getFullYear()}: $${pendientes.gastoAnio.toLocaleString('es-CL')}</span>
                </div>

                <button class="btn-secundario btn-ver-ficha" data-id="${m.id}">Ver ficha completa</button>
            </div>
        `;
    }

    function wireEventos(el) {
        const btnIr = el.querySelector('#btnIrAMascotas');
        if (btnIr) btnIr.addEventListener('click', () => irAPanel('panel-mascotas'));

        const btnAgenda = el.querySelector('#btnIrAgenda');
        if (btnAgenda) btnAgenda.addEventListener('click', () => irAPanel('panel-agenda'));

        el.querySelectorAll('.btn-ver-ficha').forEach((btn) => {
            btn.addEventListener('click', () => irAPanel('panel-mascotas'));
        });
    }

    function textoPendiente(fechaISO) {
        return fechaISO ? Utils.formatearFecha(fechaISO) : 'Sin registro';
    }

    function capitalizar(s) {
        return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
    }

    function esc(v) {
        return (v || '').toString().replace(/"/g, '&quot;');
    }

    return { init };
})();

window.Dashboard = Dashboard;
