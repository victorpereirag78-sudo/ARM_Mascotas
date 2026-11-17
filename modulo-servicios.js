// ================================================================
// MODULO-SERVICIOS.JS — Servicios para mi mascota (panel-servicios)
// Depende de: config.js, utils.js, auth.js, modulo-veterinaria.js (VetApp)
//
// Paseadores, adiestradores y crematorios aprobados por ARM. Todo pasa por
// las funciones srv_app_* de la base (nunca por tablas):
//   · srv_app_buscar(p_f)                    búsqueda (país, ciudad, tipo, texto, precio)
//   · srv_app_ficha(p_id)                    perfil público (sin teléfono ni documentos)
//   · srv_app_horas_libres(p_servicio, p_fecha)
//   · srv_app_reservar(p_d)                  solicitud con consentimiento y ficha mínima
//   · srv_app_mis_reservas / srv_app_cancelar_reserva / srv_app_evaluar
// Las veterinarias y peluquerías siguen en "Mi veterinaria".
// Expone window.Servicios.
// ================================================================

const Servicios = (() => {
    const { h, rpc } = VetApp;

    const TIPOS = { '': 'Todos', paseador: 'Paseadores', adiestrador: 'Adiestradores', crematorio: 'Crematorios' };
    const ICONO = { paseador: '🦮', adiestrador: '🎓', crematorio: '🕊️' };
    const ETIQUETA_TIPO = { paseador: 'Paseador/a', adiestrador: 'Adiestrador/a', crematorio: 'Crematorio' };
    const MODALIDAD = { domicilio: 'A domicilio', local: 'En el local', ambas: 'Domicilio y local' };
    const FORMATO = { individual: 'Individual', grupal: 'Grupal', personalizado: 'Personalizado', recurrente: 'Recurrente' };
    const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const ESTADOS = {
        pendiente: ['Esperando respuesta', 'vet-chip-aviso'], confirmada: ['Confirmada', 'vet-chip-ok'], rechazada: ['Rechazada', ''],
        cancelada: ['Cancelada', ''], finalizada: ['Realizada', 'vet-chip-ok'], vencida: ['Sin respuesta', '']
    };

    let contenedor = null;
    let vista = 'buscar';
    let filtros = { tipo: '', ciudad: '', texto: '', precio_max: '' };
    let mascotas = [];

    const dinero = (n, moneda) => {
        const v = Number(n) || 0;
        try { return new Intl.NumberFormat('es-CL', { style: 'currency', currency: moneda || 'CLP', maximumFractionDigits: 0 }).format(v); }
        catch (_e) { return `$${Math.round(v).toLocaleString('es-CL')}`; }
    };
    const chip = (txt, clase) => `<span class="vet-chip ${clase || ''}">${h(txt)}</span>`;
    const cuando = (iso) => new Date(iso).toLocaleString('es-CL', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
    function mensaje(el, txt, error) { if (!el) return; el.textContent = txt || ''; el.className = `field-msg${error ? ' msg-error' : ''}`; }

    async function urlFoto(ruta) {
        if (!ruta) return null;
        const { data } = await db.storage.from('vet-privado').createSignedUrl(ruta, 3600);
        return data ? data.signedUrl : null;
    }

    async function init(el) {
        contenedor = el;
        try { mascotas = (await db.from('mascotas').select('id, nombre, especie').eq('activo', true).order('nombre')).data || []; } catch (_e) { mascotas = []; }
        await pintar();
    }

    function pestanas() {
        return `<div class="srv-pestanas" role="tablist">
            <button role="tab" class="${vista === 'buscar' ? 'activa' : ''}" data-vista="buscar">Buscar</button>
            <button role="tab" class="${vista === 'reservas' ? 'activa' : ''}" data-vista="reservas">Mis reservas</button></div>`;
    }

    async function pintar() {
        contenedor.innerHTML = `${pestanas()}<div id="srvCuerpo"><div class="estado-vacio"><p>Cargando…</p></div></div>`;
        contenedor.querySelectorAll('[data-vista]').forEach((b) => b.addEventListener('click', () => { vista = b.dataset.vista; pintar(); }));
        const cuerpo = contenedor.querySelector('#srvCuerpo');
        if (vista === 'reservas') await pintarReservas(cuerpo); else await pintarBusqueda(cuerpo);
    }

    // ── Buscar ───────────────────────────────────────────────────
    async function pintarBusqueda(cuerpo) {
        cuerpo.innerHTML = `
            <section class="card vet-seccion">
                <div class="srv-tipos">${Object.entries(TIPOS).map(([k, v]) => `<button class="srv-tipo ${filtros.tipo === k ? 'activo' : ''}" data-tipo="${k}">${k ? ICONO[k] + ' ' : ''}${v}</button>`).join('')}</div>
                <div class="srv-filtros">
                    <div class="input-wrap"><input type="text" id="srvCiudad" placeholder="Ciudad o comuna" value="${h(filtros.ciudad)}" maxlength="80"></div>
                    <div class="input-wrap"><input type="text" id="srvTexto" placeholder="¿Qué necesitas? (paseo, obediencia…)" value="${h(filtros.texto)}" maxlength="80"></div>
                    <div class="input-wrap"><input type="number" id="srvPrecio" placeholder="Precio máximo" min="0" value="${h(filtros.precio_max)}"></div>
                    <button class="btn-primario btn-ancho-auto" id="srvBuscar">Buscar</button>
                </div>
                <p class="vet-nota">¿Buscas una veterinaria o peluquería? Están en <a href="#" id="srvIrVet">Mi veterinaria</a>.</p>
            </section>
            <div id="srvResultados"><div class="estado-vacio"><p>Buscando…</p></div></div>`;
        cuerpo.querySelectorAll('[data-tipo]').forEach((b) => b.addEventListener('click', () => { leerFiltros(); filtros.tipo = b.dataset.tipo; pintarBusqueda(cuerpo); }));
        cuerpo.querySelector('#srvBuscar').addEventListener('click', () => { leerFiltros(); cargarResultados(cuerpo); });
        cuerpo.querySelector('#srvIrVet').addEventListener('click', (e) => { e.preventDefault(); if (typeof irAPanel === 'function') irAPanel('panel-veterinaria'); });
        await cargarResultados(cuerpo);
    }

    function leerFiltros() {
        const v = (id) => (contenedor.querySelector(id) || {}).value || '';
        filtros.ciudad = v('#srvCiudad').trim(); filtros.texto = v('#srvTexto').trim(); filtros.precio_max = v('#srvPrecio').trim();
    }

    async function cargarResultados(cuerpo) {
        const cont = cuerpo.querySelector('#srvResultados');
        cont.innerHTML = '<div class="estado-vacio"><p>Buscando…</p></div>';
        let lista;
        try {
            lista = await rpc('srv_app_buscar', { p_f: {
                tipo: filtros.tipo || null, ciudad: filtros.ciudad || null, texto: filtros.texto || null, precio_max: filtros.precio_max ? Number(filtros.precio_max) : null } });
        } catch (e) { cont.innerHTML = `<p class="field-msg msg-error">${h(e.message)}</p>`; return; }
        if (!lista.length) {
            cont.innerHTML = '<div class="card estado-vacio"><p>Aún no hay profesionales que coincidan. Prueba con otra ciudad o quita algún filtro.</p></div>';
            return;
        }
        cont.innerHTML = `<ul class="srv-lista">${lista.map((p) => `
            <li><button class="srv-tarjeta" data-id="${h(p.id)}">
                <span class="srv-foto" data-foto="${h(p.foto || '')}">${ICONO[p.tipo] || '🐾'}</span>
                <span class="srv-info">
                    <span class="srv-nombre">${h(p.nombre)}${p.destacado ? ' ' + chip('⭐ Destacado', 'vet-chip-aviso') : ''}</span>
                    <span class="vet-nota">${h(ETIQUETA_TIPO[p.tipo])} · ${h([p.ciudad, p.region].filter(Boolean).join(', '))}</span>
                    <span class="srv-resumen">${h(p.descripcion || '')}</span>
                    <span class="srv-pie">${p.rating ? `⭐ ${p.rating} (${p.evaluaciones})` : 'Sin evaluaciones'}${p.desde != null ? ` · desde ${dinero(p.desde, p.moneda)}` : ''}</span>
                </span></button></li>`).join('')}</ul>`;
        cont.querySelectorAll('.srv-tarjeta').forEach((b) => b.addEventListener('click', () => abrirFicha(b.dataset.id)));
        cont.querySelectorAll('.srv-foto[data-foto]').forEach(async (el) => {
            const ruta = el.dataset.foto; if (!ruta) return;
            const url = await urlFoto(ruta); if (url) el.innerHTML = `<img src="${h(url)}" alt="" loading="lazy">`;
        });
    }

    // ── Ficha ────────────────────────────────────────────────────
    async function abrirFicha(id) {
        const cuerpo = contenedor.querySelector('#srvCuerpo');
        cuerpo.innerHTML = '<div class="estado-vacio"><p>Cargando…</p></div>';
        let p;
        try { p = await rpc('srv_app_ficha', { p_id: id }); }
        catch (e) { cuerpo.innerHTML = `<p class="field-msg msg-error">${h(e.message)}</p><button class="btn-secundario btn-chico" id="srvAtras">Volver</button>`; cuerpo.querySelector('#srvAtras').addEventListener('click', pintar); return; }
        const horarios = DIAS.map((d, i) => {
            const t = p.horarios.filter((x) => x.dia === i).map((x) => `${x.desde}–${x.hasta}`);
            return t.length ? `<li><span>${d}</span><span>${t.join(' · ')}</span></li>` : '';
        }).join('');
        cuerpo.innerHTML = `
            <button class="btn-secundario btn-chico" id="srvAtras">← Volver</button>
            <section class="card vet-seccion srv-ficha">
                <div class="srv-fotos" id="srvFotos">${p.fotos.length ? '' : `<span class="srv-foto-grande">${ICONO[p.tipo] || '🐾'}</span>`}</div>
                <h2 class="srv-titulo">${h(p.nombre)}</h2>
                <p class="vet-nota">${h(ETIQUETA_TIPO[p.tipo])} · ${h([p.ciudad, p.region].filter(Boolean).join(', '))}${p.experiencia_anios != null ? ` · ${p.experiencia_anios} años de experiencia` : ''}</p>
                <p class="srv-resumen">${p.rating ? `⭐ ${p.rating} · ${p.evaluaciones.length} evaluaciones` : 'Aún sin evaluaciones'}</p>
                ${p.descripcion ? `<p class="vet-texto">${h(p.descripcion)}</p>` : ''}
                ${p.especialidades.length ? `<p>${p.especialidades.map((e) => chip(e)).join(' ')}</p>` : ''}
            </section>
            <section class="card vet-seccion"><h3>Servicios</h3><ul class="srv-servicios">${p.servicios.map((s) => `
                <li class="srv-servicio">
                    <div><p class="srv-nombre">${h(s.nombre)}</p>
                        <p class="vet-nota">${h(FORMATO[s.formato])}${s.formato === 'grupal' ? ` (hasta ${s.capacidad_mascotas})` : ''} · ${h(MODALIDAD[s.modalidad])}${s.duracion_min ? ` · ${s.duracion_min} min` : ''}${s.especialidad ? ` · ${h(s.especialidad)}` : ''}</p>
                        ${s.descripcion ? `<p class="vet-texto">${h(s.descripcion)}</p>` : ''}
                        ${s.tarifas.length ? `<ul class="srv-tarifas">${s.tarifas.map((t) => `<li><span>${h(t.etiqueta)}</span><span>${dinero(t.precio, p.moneda)}</span></li>`).join('')}</ul>`
                            : (s.precio != null ? `<p class="srv-precio">${dinero(s.precio, p.moneda)}</p>` : '')}</div>
                    <button class="btn-primario btn-chico" data-reservar="${h(s.id)}">Reservar</button>
                </li>`).join('')}</ul></section>
            <section class="card vet-seccion"><h3>Dónde y cuándo</h3>
                <p class="vet-texto">${p.cobertura.length ? p.cobertura.map((c) => h([c.ciudad, c.region].filter(Boolean).join(', ') + (c.radio_km ? ` (${c.radio_km} km)` : ''))).join(' · ') : 'Consulta la cobertura con el profesional.'}</p>
                ${horarios ? `<ul class="srv-horarios">${horarios}</ul>` : ''}
                <p class="vet-nota">Cancelación sin costo hasta ${p.cancelar_horas} h antes. El teléfono del profesional se muestra cuando confirma tu reserva.</p></section>
            ${p.evaluaciones.length ? `<section class="card vet-seccion"><h3>Evaluaciones</h3><ul class="srv-evals">${p.evaluaciones.map((e) => `
                <li><p>${'⭐'.repeat(e.calificacion)} <span class="vet-nota">${h(e.tutor)} · ${h(e.servicio)} · ${h(e.fecha)}</span></p>${e.comentario ? `<p class="vet-texto">${h(e.comentario)}</p>` : ''}</li>`).join('')}</ul></section>` : ''}`;
        cuerpo.querySelector('#srvAtras').addEventListener('click', pintar);
        cuerpo.querySelectorAll('[data-reservar]').forEach((b) => b.addEventListener('click', () => abrirReserva(p, p.servicios.find((s) => s.id === b.dataset.reservar))));
        if (p.fotos.length) {
            const cont = cuerpo.querySelector('#srvFotos');
            for (const f of p.fotos) {
                const url = await urlFoto(f.ruta);
                if (url) cont.insertAdjacentHTML('beforeend', `<img src="${h(url)}" alt="${h(f.descripcion || p.nombre)}" loading="lazy">`);
            }
        }
    }

    // ── Reservar ─────────────────────────────────────────────────
    async function abrirReserva(p, s) {
        const cuerpo = contenedor.querySelector('#srvCuerpo');
        const aptas = mascotas;
        if (!aptas.length) {
            cuerpo.insertAdjacentHTML('afterbegin', '<p class="field-msg msg-error">Primero registra una mascota en "Mis mascotas".</p>');
            return;
        }
        // Aviso de privacidad vigente (D-L3), si ARM ya publicó uno.
        let legal = null;
        try { legal = await rpc('srv_legal_vigente', { p_codigo: 'privacidad_servicios' }); } catch (e) { legal = null; }
        const hoy = new Date(); const min = new Date(hoy.getTime() - hoy.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
        const max = new Date(hoy.getTime() + 60 * 864e5 - hoy.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
        cuerpo.innerHTML = `
            <button class="btn-secundario btn-chico" id="srvAtras">← Volver</button>
            <section class="card vet-seccion">
                <h3>Reservar: ${h(s.nombre)}</h3><p class="vet-nota">${h(p.nombre)}${s.duracion_min ? ` · ${s.duracion_min} min` : ''}</p>
                <div class="srv-form">
                    <label>Mascota<div class="input-wrap"><select id="rMascota">${aptas.map((m) => `<option value="${h(m.id)}">${h(m.nombre)}</option>`).join('')}</select></div></label>
                    <label>Fecha<div class="input-wrap"><input type="date" id="rFecha" min="${min}" max="${max}"></div></label>
                    <label>Hora<div class="input-wrap"><select id="rHora" disabled><option>Elige una fecha</option></select></div></label>
                    ${s.modalidad === 'ambas' ? `<label>Modalidad<div class="input-wrap"><select id="rModal"><option value="domicilio">A domicilio</option><option value="local">En el local</option></select></div></label>` : ''}
                    <label id="rDirWrap" ${s.modalidad === 'local' ? 'hidden' : ''}>Dirección donde se realizará<div class="input-wrap"><input type="text" id="rDir" maxlength="250" placeholder="Calle, número, comuna"></div></label>
                    <label>Notas para el profesional (opcional)<div class="input-wrap"><textarea id="rNotas" rows="2" maxlength="500" placeholder="Carácter de tu mascota, indicaciones…"></textarea></div></label>
                    <label class="srv-consent"><input type="checkbox" id="rConsent"> Acepto que se comparta mi nombre y teléfono, y los datos básicos de mi mascota (nombre, especie, raza y peso), con ${h(p.nombre)} para coordinar este servicio. No se comparte su ficha médica.</label>
                    ${legal ? `<details class="srv-privacidad"><summary>${h(legal.titulo)}</summary><p class="vet-nota" style="white-space:pre-line">${h(legal.contenido)}</p></details>` : ''}
                    <button class="btn-primario" id="rEnviar" disabled>Solicitar reserva</button>
                    <p class="field-msg" id="rMsg"></p>
                </div>
            </section>`;
        cuerpo.querySelector('#srvAtras').addEventListener('click', () => abrirFicha(p.id));
        const q = (id) => cuerpo.querySelector(id);
        const habilitar = () => { q('#rEnviar').disabled = !(q('#rFecha').value && q('#rHora').value && q('#rConsent').checked); };
        q('#rFecha').addEventListener('change', async () => {
            const sel = q('#rHora'); sel.disabled = true; sel.innerHTML = '<option>Buscando horas…</option>';
            try {
                const horas = await rpc('srv_app_horas_libres', { p_servicio: s.id, p_fecha: q('#rFecha').value });
                sel.innerHTML = horas.length ? horas.map((x) => `<option value="${x}">${x}</option>`).join('') : '<option value="">Sin horas libres ese día</option>';
                sel.disabled = !horas.length;
            } catch (e) { sel.innerHTML = '<option value="">—</option>'; mensaje(q('#rMsg'), e.message, true); }
            habilitar();
        });
        q('#rConsent').addEventListener('change', habilitar);
        q('#rHora').addEventListener('change', habilitar);
        const modal = q('#rModal');
        if (modal) modal.addEventListener('change', () => { q('#rDirWrap').hidden = modal.value === 'local'; });
        q('#rEnviar').addEventListener('click', async () => {
            const btn = q('#rEnviar'); btn.disabled = true; mensaje(q('#rMsg'), 'Enviando…');
            const modalidad = modal ? modal.value : (s.modalidad === 'local' ? 'local' : 'domicilio');
            try {
                await rpc('srv_app_reservar', { p_d: { servicio_id: s.id, mascota_id: q('#rMascota').value, fecha: q('#rFecha').value, hora: q('#rHora').value,
                    modalidad, direccion: q('#rDir').value.trim(), notas: q('#rNotas').value.trim(), consentimiento: q('#rConsent').checked } });
                vista = 'reservas'; await pintar();
                contenedor.querySelector('#srvCuerpo').insertAdjacentHTML('afterbegin', '<p class="field-msg">✅ Solicitud enviada. El profesional la confirmará o rechazará pronto.</p>');
            } catch (e) { mensaje(q('#rMsg'), e.message, true); btn.disabled = false; }
        });
    }

    // ── Mis reservas ─────────────────────────────────────────────
    async function pintarReservas(cuerpo) {
        let lista;
        try { lista = await rpc('srv_app_mis_reservas'); } catch (e) { cuerpo.innerHTML = `<p class="field-msg msg-error">${h(e.message)}</p>`; return; }
        if (!lista.length) { cuerpo.innerHTML = '<div class="card estado-vacio"><p>Aún no reservas servicios. Busca un profesional y solicita tu primera reserva.</p></div>'; return; }
        // Novedades: reservas cuyo estado cambió desde la última vez que se miraron (el aviso push puede no haber llegado).
        let vistos = {};
        try { vistos = JSON.parse(localStorage.getItem('arm_srv_vistos') || '{}') || {}; } catch (e) { vistos = {}; }
        const hayVistos = Object.keys(vistos).length > 0;
        const cambio = (r) => hayVistos && vistos[r.id] !== r.estado && r.estado !== 'pendiente';
        const novedades = lista.filter(cambio).length;
        try { localStorage.setItem('arm_srv_vistos', JSON.stringify(Object.fromEntries(lista.map((r) => [r.id, r.estado])))); } catch (e) { /* sin almacenamiento */ }
        cuerpo.innerHTML = `${novedades ? `<p class="field-msg">🔔 ${novedades === 1 ? 'Una de tus reservas tiene novedades' : `${novedades} de tus reservas tienen novedades`}.</p>` : ''}<ul class="vet-pedidos">${lista.map((r) => {
            const e = ESTADOS[r.estado] || [r.estado, ''];
            return `<li class="vet-pedido ${['cancelada', 'rechazada', 'vencida'].includes(r.estado) ? 'cerrado' : ''}" data-id="${h(r.id)}">
                <div class="vet-pedido-cab"><div><p class="vet-pedido-titulo">${ICONO[r.tipo] || '🐾'} ${h(r.servicio)} · ${h(r.profesional)}${cambio(r) ? ' ' + chip('Novedad', 'vet-chip-aviso') : ''}</p>
                    <p class="vet-nota">${h(r.mascota)} · ${h(cuando(r.inicio))}${r.precio != null ? ` · ${dinero(r.precio, r.moneda)}` : ''}</p></div>${chip(e[0], e[1])}</div>
                ${r.direccion ? `<p class="vet-nota">📍 ${h(r.direccion)}</p>` : ''}
                ${r.telefono_profesional ? `<p class="vet-texto">📞 <a href="tel:${h(r.telefono_profesional)}">${h(r.telefono_profesional)}</a></p>` : ''}
                ${r.estado === 'vencida' ? '<p class="vet-nota">El profesional no respondió a tiempo y la hora quedó libre. Puedes elegir a otro profesional.</p>'
                    : r.motivo ? `<p class="vet-nota">${r.cancelado_por === 'profesional' ? 'El profesional canceló' : r.cancelado_por === 'tutor' ? 'Cancelaste' : 'Motivo'}: ${h(r.motivo)}</p>` : ''}
                ${r.calificacion ? `<p class="vet-nota">Tu evaluación: ${'⭐'.repeat(r.calificacion)}</p>` : ''}
                ${r.puede_evaluar ? `<div class="srv-eval"><div class="srv-estrellas">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-n="${n}" aria-label="${n} estrellas">☆</button>`).join('')}</div>
                    <div class="input-wrap"><textarea rows="2" maxlength="600" placeholder="Cuéntanos cómo te fue (opcional)"></textarea></div>
                    <button class="btn-primario btn-chico" data-evaluar disabled>Enviar evaluación</button></div>` : ''}
                ${r.puede_cancelar ? '<button class="vet-enlace" data-cancelar>Cancelar reserva</button>' : (r.estado === 'confirmada' ? `<p class="vet-nota">Pasó el plazo de cancelación (${r.cancelar_horas} h antes): contacta al profesional.</p>` : '')}
                <p class="field-msg"></p></li>`;
        }).join('')}</ul>`;
        cuerpo.querySelectorAll('.vet-pedido').forEach((li) => {
            const id = li.dataset.id; const msg = li.querySelector('.field-msg');
            const c = li.querySelector('[data-cancelar]');
            if (c) c.addEventListener('click', async () => {
                const motivo = window.prompt('¿Por qué cancelas? (opcional)');
                if (motivo === null) return;
                try { await rpc('srv_app_cancelar_reserva', { p_id: id, p_motivo: motivo || null }); pintar(); } catch (e) { mensaje(msg, e.message, true); }
            });
            let nota = 0;
            const estrellas = li.querySelectorAll('.srv-estrellas button'); const ev = li.querySelector('[data-evaluar]');
            estrellas.forEach((b) => b.addEventListener('click', () => {
                nota = Number(b.dataset.n); estrellas.forEach((x) => { x.textContent = Number(x.dataset.n) <= nota ? '★' : '☆'; }); if (ev) ev.disabled = false;
            }));
            if (ev) ev.addEventListener('click', async () => {
                ev.disabled = true;
                try { await rpc('srv_app_evaluar', { p_reserva: id, p_calificacion: nota, p_comentario: li.querySelector('textarea').value.trim() || null }); pintar(); }
                catch (e) { mensaje(msg, e.message, true); ev.disabled = false; }
            });
        });
    }

    return { init };
})();

window.Servicios = Servicios;
