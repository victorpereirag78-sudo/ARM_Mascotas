// ================================================================
// MODULO-DASHBOARD.JS — Resumen de mascotas (panel-dashboard)
// Depende de: config.js, utils.js, auth.js, modulo-mascota.js
//   (reutiliza Mascota.cargarMascotas() para no duplicar la query)
// Expone window.Dashboard
// ================================================================

const Dashboard = (() => {

    async function init(el) {
        el.innerHTML = `<div class="estado-vacio"><p>Cargando...</p></div>`;
        const mascotas = await Mascota.cargarMascotas();
        el.innerHTML = plantilla(mascotas);
        wireEventos(el);
    }

    function plantilla(mascotas) {
        const nombre = window.appData.perfil?.nombre || '';
        const saludo = `<h2 class="dashboard-saludo">Hola${nombre ? ', ' + esc(nombre) : ''} 👋</h2>`;

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
                    <span class="pendiente-item">💉 Próxima vacuna: se activará en el módulo Clínico</span>
                    <span class="pendiente-item">🗓️ Próximo control: se activará en el módulo Agenda</span>
                </div>

                <button class="btn-secundario btn-ver-ficha" data-id="${m.id}">Ver ficha completa</button>
            </div>
        `;
    }

    function wireEventos(el) {
        const btnIr = el.querySelector('#btnIrAMascotas');
        if (btnIr) btnIr.addEventListener('click', () => irAPanel('panel-mascotas'));

        el.querySelectorAll('.btn-ver-ficha').forEach((btn) => {
            btn.addEventListener('click', () => irAPanel('panel-mascotas'));
        });
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
