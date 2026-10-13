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
        cargarProximos(el, mascotas);
        if (window.VetApp) VetApp.decorarDashboard(el);
        // Primer ingreso: recorrido de bienvenida (se marca como visto al cerrarlo).
        if (window.Tutorial) Tutorial.iniciarSiCorresponde();
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
                <div>
                    <h2 class="dashboard-saludo">Hola${nombre ? ', ' + esc(nombre) : ''} 👋</h2>
                    <p class="dashboard-fecha">${capitalizar(new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }))}</p>
                </div>
                <div class="dashboard-cabecera-acciones">
                    <button class="btn-emergencia-dashboard" id="btnEmergencia">🚨 Emergencia Veterinaria</button>
                </div>
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

        const puedeVet = Auth.puedeAcceder('panel-veterinaria');
        const acceso = (ir, icono, texto) => `<button class="acceso-rapido" data-ir="${ir}"><span>${icono}</span>${texto}</button>`;
        return `
            ${saludo}
            <nav class="accesos-inicio" id="dashAccesos" aria-label="Accesos directos">
                ${puedeVet ? acceso('reservar', '📅', 'Agendar hora') + acceso('horas', '🗓️', 'Mis horas') : ''}
                ${acceso('resultados', '🧪', 'Resultados')}
                ${acceso('recetas', '📄', 'Recetas')}
                ${acceso('historia', '🩺', 'Historia clínica')}
                ${acceso('vacunas', '💉', 'Vacunas')}
                ${acceso('agenda', '⏰', 'Recordatorio')}
                ${acceso('compartir', '👪', 'Compartir')}
            </nav>
            <div class="layout-lateral dashboard-layout">
                <div class="dashboard-principal">
                    <h3 class="titulo-bloque">${mascotas.length === 1 ? 'Mi mascota' : `Mis mascotas <small>${mascotas.length}</small>`}
                        <button class="enlace-accion" id="btnIrAMascotas">+ Agregar mascota</button></h3>
                    <div class="dashboard-grid">${mascotas.map(tarjetaResumen).join('')}</div>
                </div>
                <aside class="dashboard-lateral">
                    <section class="card dashboard-proximos">
                        <h3 class="titulo-bloque">🗓️ Próximos <button class="enlace-accion" id="btnIrAgenda">Ver agenda</button></h3>
                        <div id="dashProximos"><p class="dashboard-nota">Cargando...</p></div>
                    </section>
                </aside>
            </div>`;
    }

    function tarjetaResumen(m) {
        const edad = Utils.calcularEdadMascota(m.fecha_nacimiento, m.especie);
        const dias = Utils.diasParaCumpleanos(m.fecha_nacimiento);
        const emojiEspecie = m.especie === 'perro' ? '🐶' : m.especie === 'gato' ? '🐱' : '🐾';
        const pendientes = pendientesPorMascota[m.id] || { proximaVacuna: null, proximaDesparasitacion: null, gastoAnio: 0 };
        const sub = [esc(m.raza) || capitalizar(m.especie), m.sexo ? capitalizar(m.sexo) : ''].filter(Boolean).join(' · ');

        return `
            <article class="card dashboard-card" data-id="${m.id}">
                <div class="dc">
                    <div class="dashboard-card-foto dc-foto" ${m.foto_url ? `style="--foto:url('${m.foto_url}')"` : ''}>
                        ${m.foto_url ? `<img src="${m.foto_url}" alt="${esc(m.nombre)}">` : `<span>${emojiEspecie}</span>`}
                    </div>
                    <div class="dc-info">
                        <h3>${esc(m.nombre)}</h3>
                        <p class="dashboard-card-sub">${sub}</p>
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
                    </div>
                    <div class="dc-lado">
                        <div class="dashboard-card-pendientes">
                            <span class="pendiente-item">💉 Próxima vacuna: <b>${textoPendiente(pendientes.proximaVacuna)}</b></span>
                            <span class="pendiente-item">🐛 Próxima desparasitación: <b>${textoPendiente(pendientes.proximaDesparasitacion)}</b></span>
                            <span class="pendiente-item">💰 Gastos ${new Date().getFullYear()}: <b>$${pendientes.gastoAnio.toLocaleString('es-CL')}</b></span>
                        </div>
                        <button class="btn-secundario btn-ver-ficha" data-id="${m.id}">Ver ficha completa →</button>
                    </div>
                </div>
            </article>
        `;
    }

    async function cargarProximos(el, mascotas) {
        const caja = el.querySelector('#dashProximos');
        if (!caja || !window.Agenda) return;
        let lista = [];
        try { lista = await Agenda.proximos(mascotas, 6); } catch (_e) { lista = []; }
        caja.innerHTML = lista.length
            ? `<div class="dashboard-proximos-lista">${lista.map((it) => Agenda.filaHtml(it, true)).join('')}</div>`
            : '<p class="dashboard-nota">No hay fechas pendientes. Agrega recordatorios desde la agenda.</p>';
    }

    function wireEventos(el) {
        el.querySelectorAll('#btnIrAMascotas').forEach((btn) => btn.addEventListener('click', () => {
            sessionStorage.setItem('arm_nueva_mascota', '1');
            irAPanel('panel-mascotas');
        }));

        const btnAgenda = el.querySelector('#btnIrAgenda');
        if (btnAgenda) btnAgenda.addEventListener('click', () => irAPanel('panel-agenda'));

        const btnEmergencia = el.querySelector('#btnEmergencia');
        if (btnEmergencia) btnEmergencia.addEventListener('click', () => Emergencia.abrir());

        // "Ver ficha" abre la ficha de ESA mascota, no el listado.
        el.querySelectorAll('.btn-ver-ficha').forEach((btn) => {
            btn.addEventListener('click', () => {
                sessionStorage.setItem('arm_abrir_mascota', btn.dataset.id);
                irAPanel('panel-mascotas');
            });
        });

        el.querySelectorAll('.acceso-rapido').forEach((btn) => btn.addEventListener('click', () => irAcceso(btn.dataset.ir, el)));
    }

    // Resultados, recetas, historia clínica y vacunas abren la ficha de la
    // mascota en la carpeta de su veterinaria (o, sin clínica conectada,
    // en lo que registró el dueño).
    const SECCION_FICHA = {
        resultados: { vet: 'examenes', propio: null },
        recetas: { vet: 'recetas', propio: null },
        historia: { vet: 'consultas', propio: 'consultas' },
        vacunas: { vet: 'vacunas', propio: 'vacunas' }
    };

    function irAcceso(ir, el) {
        if (ir === 'reservar' || ir === 'horas') {
            sessionStorage.setItem('arm_vet_seccion', ir === 'reservar' ? 'reservar' : 'citas');
            return irAPanel('panel-veterinaria');
        }
        if (ir === 'productos') {
            sessionStorage.setItem('arm_vet_seccion', 'catalogo');
            return irAPanel('panel-veterinaria');
        }
        if (ir === 'agenda') return irAPanel('panel-agenda');
        if (ir === 'compartir') return irAPanel('panel-compartir');
        const destino = SECCION_FICHA[ir];
        if (!destino) return;
        const mascotas = window.appData.mascotas || [];
        const abrir = (m) => {
            const conClinica = ((window.appData.vetResumen && window.appData.vetResumen.mascotas) || []).some((x) => x.mascota_app_id === m.id);
            const usarPropio = !conClinica && destino.propio;
            sessionStorage.setItem('arm_abrir_mascota', m.id);
            sessionStorage.setItem('arm_abrir_pestana', usarPropio ? 'salud' : 'veterinaria');
            sessionStorage.setItem('arm_abrir_sub', usarPropio ? destino.propio : destino.vet);
            irAPanel('panel-mascotas');
        };
        if (mascotas.length === 1) return abrir(mascotas[0]);
        elegirMascota(el, mascotas, abrir);
    }

    // Con varias mascotas, pregunta de cuál.
    function elegirMascota(el, mascotas, alElegir) {
        const capa = document.createElement('div');
        capa.className = 'elegir-mascota';
        capa.innerHTML = `
            <div class="elegir-mascota-card" role="dialog" aria-modal="true" aria-label="Elige una mascota">
                <h3>¿De qué mascota?</h3>
                <div class="elegir-mascota-lista">
                    ${mascotas.map((m) => `<button type="button" data-id="${m.id}">
                        <span class="elegir-mascota-foto">${m.foto_url ? `<img src="${m.foto_url}" alt="">` : (m.especie === 'gato' ? '🐱' : m.especie === 'perro' ? '🐶' : '🐾')}</span>
                        ${esc(m.nombre)}</button>`).join('')}
                </div>
                <button type="button" class="btn-secundario elegir-mascota-cancelar">Cancelar</button>
            </div>`;
        const cerrar = () => capa.remove();
        capa.addEventListener('click', (e) => { if (e.target === capa) cerrar(); });
        capa.querySelector('.elegir-mascota-cancelar').addEventListener('click', cerrar);
        capa.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () => {
            cerrar();
            alElegir(mascotas.find((m) => m.id === b.dataset.id));
        }));
        document.body.appendChild(capa);
        capa.querySelector('[data-id]').focus();
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
