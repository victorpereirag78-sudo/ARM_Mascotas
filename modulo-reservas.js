// ================================================================
// MODULO-RESERVAS.JS — Mi veterinaria: horas, encuestas,
// consentimientos y privacidad
// Depende de: utils.js, modulo-veterinaria.js (VetApp)
//
// Todo pasa por las funciones vet_app_* de la base, que validan con la
// sesión que la mascota sea del dueño:
//   · Mis horas y reservar: vet_app_mis_citas, vet_app_reservas_opciones,
//     vet_app_horas_libres, vet_app_reservar, vet_app_cancelar_cita.
//   · Encuesta después de la atención: vet_app_encuestas,
//     vet_app_responder_encuesta.
//   · Consentimientos por firmar: vet_app_consentimientos,
//     vet_app_firmar_consentimiento (con la huella del texto leído),
//     vet_app_rechazar_consentimiento.
//   · Privacidad (Ley 21.719): vet_app_privacidad, vet_app_consentir_datos,
//     vet_app_solicitar_datos.
// Expone window.VetExtra.
// ================================================================

const VetExtra = (() => {
    const { h, fecha, rpc } = VetApp;

    const TIPOS = { consulta: 'Consulta', control: 'Control', vacunacion: 'Vacunación', cirugia: 'Cirugía', procedimiento: 'Procedimiento',
        examen: 'Examen', peluqueria: 'Peluquería', urgencia: 'Urgencia', otro: 'Otro' };
    const EMOJI = { perro: '🐶', gato: '🐱', conejo: '🐰', ave: '🐦', roedor: '🐹', huron: '🐾', reptil: '🦎', otro: '🐾' };
    const ESTADOS_CITA = {
        solicitada: ['Esperando confirmación', 'vet-chip-aviso'], reservada: ['Reservada', ''], confirmada: ['Confirmada', 'vet-chip-ok'],
        en_espera: ['En la clínica', 'vet-chip-ok'], en_atencion: ['En atención', 'vet-chip-ok'], cancelada: ['Cancelada', '']
    };
    const FINALIDADES = {
        atencion: ['Atención veterinaria', 'Ficha clínica, citas, cobros y contacto por la atención.'],
        recordatorios: ['Recordatorios', 'Avisos de vacunas, controles, citas y tratamientos.'],
        comunicaciones: ['Campañas y novedades', 'Información comercial, campañas y promociones.']
    };
    const SOLICITUDES = { acceso: 'Acceso a mis datos', rectificacion: 'Corregir mis datos', supresion: 'Eliminar mis datos', oposicion: 'Oponerme a un uso',
        portabilidad: 'Copia para llevar a otra clínica', bloqueo: 'Bloqueo temporal' };

    const chip = (txt, clase) => `<span class="vet-chip ${clase || ''}">${h(txt)}</span>`;
    const cuando = (iso) => new Date(iso).toLocaleString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false });
    const diaCorto = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' });
    const duracion = (m) => (m < 60 ? `${m} min` : `${m / 60} h`.replace('.', ','));
    function mensaje(el, txt, error) { if (!el) return; el.textContent = txt || ''; el.className = `field-msg${error ? ' msg-error' : ''}`; }

    async function cargar() {
        const [citas, encuestas, consentimientos, privacidad] = await Promise.all([
            rpc('vet_app_mis_citas').catch(() => []), rpc('vet_app_encuestas').catch(() => []),
            rpc('vet_app_consentimientos').catch(() => []), rpc('vet_app_privacidad').catch(() => [])]);
        return { citas: citas || [], encuestas: encuestas || [], consentimientos: consentimientos || [], privacidad: privacidad || [] };
    }

    // ── Encuestas ────────────────────────────────────────────────
    function htmlEncuestas(lista) {
        if (!lista.length) return '';
        return `
            <section class="card vet-seccion" id="vetEncuestas">
                <div class="vet-seccion-cabecera"><h3>⭐ ¿Cómo te atendieron? <span class="vet-insignia vet-insignia-inline">${lista.length}</span></h3></div>
                <div class="vet-presu-lista">${lista.map((e) => `
                    <article class="vet-presu vet-presu-pendiente vet-encuesta" data-encuesta="${h(e.id)}">
                        <p class="vet-encuesta-titulo">${EMOJI[e.mascota.especie] || '🐾'} Atención de <b>${h(e.mascota.nombre)}</b> · ${fecha(e.fecha)}</p>
                        <p class="vet-nota">${h(e.lugar)}${e.veterinario ? ` · ${h(e.veterinario)}` : ''}</p>
                        <p class="vet-texto vet-encuesta-pregunta">¿Qué tan probable es que nos recomiendes a un amigo o familiar?</p>
                        <div class="vet-nps">${Array.from({ length: 11 }, (_, n) => `<button type="button" data-nota="${n}">${n}</button>`).join('')}</div>
                        <div class="vet-nps-extremos"><span>Nada probable</span><span>Muy probable</span></div>
                        <div class="input-wrap"><textarea rows="2" maxlength="1000" placeholder="¿Quieres contarnos algo más? (opcional)"></textarea></div>
                        <div class="vet-presu-acciones"><button class="btn-primario btn-ancho-auto" data-enviar disabled>Enviar</button></div>
                        <p class="field-msg"></p>
                    </article>`).join('')}</div>
            </section>`;
    }

    function conectarEncuestas(raiz, recargar) {
        raiz.querySelectorAll('.vet-encuesta').forEach((card) => {
            let nota = null;
            const enviar = card.querySelector('[data-enviar]');
            card.querySelectorAll('[data-nota]').forEach((b) => b.addEventListener('click', () => {
                nota = Number(b.dataset.nota);
                card.querySelectorAll('[data-nota]').forEach((x) => x.classList.toggle('activo', x === b));
                card.dataset.tono = nota >= 9 ? 'alto' : nota >= 7 ? 'medio' : 'bajo';
                card.querySelector('textarea').placeholder = nota <= 6 ? '¿Qué podríamos mejorar? (opcional)' : '¿Quieres contarnos algo más? (opcional)';
                enviar.disabled = false;
            }));
            enviar.addEventListener('click', async () => {
                Utils.setLoading(enviar, true, 'Enviando...');
                try {
                    await rpc('vet_app_responder_encuesta', { p_id: card.dataset.encuesta, p_nota: nota, p_comentario: card.querySelector('textarea').value.trim() || null });
                    Utils.toast('¡Gracias por tu opinión!', 'exito');
                    await recargar();
                } catch (e) { Utils.setLoading(enviar, false); mensaje(card.querySelector('.field-msg'), e.message, true); }
            });
        });
    }

    // ── Consentimientos ──────────────────────────────────────────
    function htmlConsentimientos(lista) {
        const pendientes = lista.filter((k) => k.estado === 'pendiente');
        const firmados = lista.filter((k) => k.estado === 'firmado');
        if (!lista.length) return '';
        return `
            <section class="card vet-seccion" id="vetConsentimientos">
                <div class="vet-seccion-cabecera"><h3>✍️ Consentimientos${pendientes.length ? ` <span class="vet-insignia vet-insignia-inline">${pendientes.length}</span>` : ''}</h3></div>
                ${pendientes.length ? `<p class="vet-texto">Tu veterinaria necesita tu autorización. Léelo con calma y fírmalo con el dedo.</p>
                    <div class="vet-presu-lista">${pendientes.map((k) => `
                        <article class="vet-presu vet-presu-pendiente vet-consent" data-consent="${h(k.id)}">
                            <div class="vet-presu-cabecera">
                                <span class="vet-preview-emoji">${EMOJI[k.mascota.especie] || '🐾'}</span>
                                <div><h4>${h(k.titulo)}</h4><p>${h(k.mascota.nombre)} · ${h(k.clinica)}</p></div>
                                ${chip('Por firmar', 'vet-chip-aviso')}
                            </div>
                            <div class="vet-presu-acciones" data-inicio><button class="btn-primario btn-ancho-auto" data-leer>Leer y firmar</button></div>
                            <div class="vet-consent-cuerpo" hidden>
                                <div class="vet-consent-texto">${h(k.texto)}</div>
                                <div class="vet-consent-campos">
                                    <div class="input-wrap"><input data-nombre placeholder="Tu nombre completo" maxlength="120" autocomplete="name"></div>
                                    <div class="input-wrap"><input data-rut placeholder="RUT (opcional)" maxlength="12"></div>
                                </div>
                                <div class="vet-firma"><canvas width="900" height="280" aria-label="Firma aquí"></canvas><span>Firma aquí con el dedo</span></div>
                                <button type="button" class="vet-enlace" data-borrar>Borrar firma</button>
                                <div class="vet-presu-acciones">
                                    <button class="btn-secundario btn-chico" data-rechazar>No firmar</button>
                                    <button class="btn-primario btn-ancho-auto" data-firmar disabled>Firmar</button>
                                </div>
                            </div>
                            <p class="field-msg"></p>
                        </article>`).join('')}</div>` : ''}
                ${firmados.length ? `<ul class="vet-presu-historial">${firmados.map((k) => `
                    <li class="vet-presu vet-presu-hist"><details>
                        <summary><span><b>${h(k.titulo)}</b><small>${h(k.mascota.nombre)} · ${h(k.clinica)} · firmado el ${fecha(k.firmado_en)}</small></span>${chip('Firmado', 'vet-chip-ok')}</summary>
                        <div class="vet-consent-texto">${h(k.texto)}</div>
                        ${k.firma ? `<img class="vet-consent-firma" src="${h(k.firma)}" alt="Firma">` : ''}
                        <p class="vet-nota">Firmado por ${h(k.firmante_nombre)} ${k.canal === 'app' ? 'en esta app' : 'en la clínica'} el ${VetApp.fechaHora(k.firmado_en)}.</p>
                    </details></li>`).join('')}</ul>` : ''}
            </section>`;
    }

    // Área de firma con el dedo; avisa con onCambio(true/false).
    function padFirma(canvas, onCambio) {
        const ctx = canvas.getContext('2d');
        ctx.lineWidth = 3.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#142a5a';
        let dibujando = false, ultimo = null, vacia = true;
        const punto = (e) => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * canvas.width, y: (e.clientY - r.top) / r.height * canvas.height }; };
        canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); canvas.setPointerCapture(e.pointerId); dibujando = true; ultimo = punto(e); });
        canvas.addEventListener('pointermove', (e) => {
            if (!dibujando) return;
            const p = punto(e);
            ctx.beginPath(); ctx.moveTo(ultimo.x, ultimo.y); ctx.lineTo(p.x, p.y); ctx.stroke(); ultimo = p;
        });
        const fin = () => { if (!dibujando) return; dibujando = false; vacia = false; canvas.parentElement.classList.add('con-firma'); onCambio(true); };
        canvas.addEventListener('pointerup', fin); canvas.addEventListener('pointercancel', fin); canvas.addEventListener('pointerleave', fin);
        return {
            borrar() { ctx.clearRect(0, 0, canvas.width, canvas.height); vacia = true; canvas.parentElement.classList.remove('con-firma'); onCambio(false); },
            png() { return vacia ? null : canvas.toDataURL('image/png'); }
        };
    }

    function conectarConsentimientos(raiz, lista, recargar) {
        raiz.querySelectorAll('.vet-consent').forEach((card) => {
            const k = lista.find((x) => x.id === card.dataset.consent);
            const msg = card.querySelector('.field-msg');
            const firmar = card.querySelector('[data-firmar]');
            const nombre = card.querySelector('[data-nombre]');
            const actualizar = (hayFirma) => { firmar.disabled = !hayFirma || nombre.value.trim().length < 3; };
            let pad = null;
            card.querySelector('[data-leer]').addEventListener('click', () => {
                card.querySelector('[data-inicio]').hidden = true;
                card.querySelector('.vet-consent-cuerpo').hidden = false;
                const perfil = window.appData.perfil || {};
                nombre.value = `${perfil.nombre || ''} ${perfil.apellido || ''}`.trim();
                pad = padFirma(card.querySelector('canvas'), actualizar);
            });
            nombre.addEventListener('input', () => actualizar(!!(pad && pad.png())));
            card.querySelector('[data-borrar]').addEventListener('click', () => pad && pad.borrar());
            firmar.addEventListener('click', async () => {
                Utils.setLoading(firmar, true, 'Firmando...');
                try {
                    await rpc('vet_app_firmar_consentimiento', { p_id: k.id, p_firma: pad.png(), p_nombre: nombre.value.trim(),
                        p_rut: card.querySelector('[data-rut]').value.trim() || null, p_hash: k.hash });
                    Utils.toast(`Firmado. ${k.clinica} ya lo tiene en la ficha de ${k.mascota.nombre}.`, 'exito');
                    await recargar();
                } catch (e) { Utils.setLoading(firmar, false); mensaje(msg, e.message, true); }
            });
            card.querySelector('[data-rechazar]').addEventListener('click', async (ev) => {
                const motivo = prompt('Si quieres, cuéntale a la clínica por qué no lo firmas:') ;
                if (motivo === null) return;
                Utils.setLoading(ev.currentTarget, true, 'Enviando...');
                try {
                    await rpc('vet_app_rechazar_consentimiento', { p_id: k.id, p_motivo: motivo || null });
                    Utils.toast('Le avisamos a la clínica.', 'info');
                    await recargar();
                } catch (e) { mensaje(msg, e.message, true); }
            });
        });
    }

    // ── Mis horas y reservar ─────────────────────────────────────
    function htmlCitas(citas, clinicas) {
        const conReservas = clinicas.filter((c) => c.reservas);
        return `
            <section class="card vet-seccion" id="vetCitas">
                <div class="vet-seccion-cabecera">
                    <h3>📅 Mis horas</h3>
                    ${conReservas.length ? '<button class="btn-primario btn-chico" data-reservar>+ Reservar hora</button>' : ''}
                </div>
                <div data-contenido>
                    ${citas.length ? `<ul class="vet-citas">${citas.map((c) => {
                        const e = ESTADOS_CITA[c.estado] || [c.estado, ''];
                        return `
                        <li class="vet-cita ${c.estado === 'cancelada' ? 'cancelada' : ''}" data-cita="${h(c.id)}">
                            <span class="vet-cita-emoji">${EMOJI[c.mascota.especie] || '🐾'}</span>
                            <div class="vet-cita-cuerpo">
                                <p class="vet-cita-cuando">${h(cuando(c.inicio))}</p>
                                <p class="vet-nota">${h(c.mascota.nombre)} · ${h(TIPOS[c.tipo] || c.tipo)}${c.veterinario ? ` · ${h(c.veterinario)}` : ''}</p>
                                <p class="vet-nota">${h(c.lugar)}${c.direccion ? ` · ${h(c.direccion)}` : ''}</p>
                                ${c.estado === 'cancelada' && c.cancelada_motivo ? `<p class="vet-nota">${h(c.cancelada_motivo)}</p>` : ''}
                            </div>
                            <div class="vet-cita-lado">
                                ${chip(e[0], e[1])}
                                ${c.puede_cancelar ? '<button class="vet-enlace" data-cancelar>Cancelar</button>' : ''}
                            </div>
                        </li>`;
                    }).join('')}</ul>`
                        : `<p class="vet-vacio">No tienes horas agendadas.${conReservas.length ? ' Reserva en línea con “Reservar hora”.' : ''}</p>`}
                    <p class="field-msg"></p>
                </div>
            </section>`;
    }

    function conectarCitas(raiz, citas, clinicas, recargar) {
        const seccion = raiz.querySelector('#vetCitas');
        if (!seccion) return;
        seccion.querySelectorAll('[data-cancelar]').forEach((b) => b.addEventListener('click', async () => {
            const c = citas.find((x) => x.id === b.closest('[data-cita]').dataset.cita);
            if (!confirm(`¿Cancelar la hora de ${c.mascota.nombre} del ${cuando(c.inicio)}?`)) return;
            try {
                await rpc('vet_app_cancelar_cita', { p_cita: c.id, p_motivo: null });
                Utils.toast('Hora cancelada. La clínica ya lo sabe.', 'info');
                await recargar();
            } catch (e) { mensaje(seccion.querySelector('.field-msg'), e.message, true); }
        }));
        const btn = seccion.querySelector('[data-reservar]');
        if (btn) btn.addEventListener('click', () => abrirReserva(seccion, clinicas.filter((c) => c.reservas), recargar));
    }

    // Asistente de reserva dentro de la sección "Mis horas".
    async function abrirReserva(seccion, clinicas, recargar) {
        const cont = seccion.querySelector('[data-contenido]');
        const btn = seccion.querySelector('[data-reservar]');
        if (btn) btn.hidden = true;
        const estado = { clinica: clinicas.length === 1 ? clinicas[0].id : null, op: null, mascota: null, servicio: null, sede: null, vet: '',
            desde: Utils.hoy(), dia: null, hora: null };
        const volver = () => recargar();

        async function pasoClinica() {
            cont.innerHTML = `
                <p class="vet-texto">¿En qué veterinaria?</p>
                <div class="vet-opciones">${clinicas.map((c) => `<button class="vet-opcion" data-id="${h(c.id)}">🏥 ${h(c.nombre)}</button>`).join('')}</div>
                <div class="vet-presu-acciones"><button class="btn-secundario btn-chico" data-volver>Volver</button></div>`;
            cont.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () => { estado.clinica = b.dataset.id; pasoServicio(); }));
            cont.querySelector('[data-volver]').addEventListener('click', volver);
        }

        async function pasoServicio() {
            cont.innerHTML = '<p class="vet-vacio">Cargando...</p>';
            try { estado.op = estado.op && estado.op.clinica.id === estado.clinica ? estado.op : await rpc('vet_app_reservas_opciones', { p_clinica: estado.clinica }); }
            catch (e) { cont.innerHTML = `<p class="field-msg msg-error">${h(e.message)}</p><div class="vet-presu-acciones"><button class="btn-secundario btn-chico" data-volver>Volver</button></div>`;
                cont.querySelector('[data-volver]').addEventListener('click', volver); return; }
            const op = estado.op;
            if (!estado.sede && op.sedes.length) estado.sede = op.sedes[0].id;
            if (!estado.mascota && op.mascotas.length === 1) estado.mascota = op.mascotas[0].paciente_id;
            const vets = op.profesionales.filter((p) => p.sedes.includes(estado.sede));
            cont.innerHTML = `
                <p class="vet-texto">Reservar en <b>${h(op.clinica.nombre)}</b>${op.mensaje ? `<br><small>${h(op.mensaje)}</small>` : ''}</p>
                ${!op.mascotas.length ? '<p class="vet-vacio">Esta clínica aún no tiene mascotas tuyas registradas. Llámala para tu primera hora.</p>' : `
                <p class="vet-etiqueta">Mascota</p>
                <div class="vet-opciones">${op.mascotas.map((m) => `<button class="vet-opcion ${estado.mascota === m.paciente_id ? 'activo' : ''}" data-mascota="${h(m.paciente_id)}">${EMOJI[m.especie] || '🐾'} ${h(m.nombre)}</button>`).join('')}</div>
                <p class="vet-etiqueta">Servicio</p>
                <div class="vet-opciones">${op.servicios.map((s) => `<button class="vet-opcion ${estado.servicio === s.tipo ? 'activo' : ''}" data-servicio="${h(s.tipo)}">${h(TIPOS[s.tipo] || s.tipo)} <small>${duracion(s.duracion)}${s.confirmacion ? ' · la clínica confirma' : ''}</small></button>`).join('')}</div>
                ${op.sedes.length > 1 ? `<p class="vet-etiqueta">Sede</p><div class="input-wrap"><select data-sede>${op.sedes.map((s) => `<option value="${h(s.id)}" ${s.id === estado.sede ? 'selected' : ''}>${h(s.nombre)} · ${h(s.direccion)}</option>`).join('')}</select></div>` : ''}
                ${vets.length > 1 ? `<p class="vet-etiqueta">Profesional (opcional)</p><div class="input-wrap"><select data-vet><option value="">El primero disponible</option>${vets.map((v) => `<option value="${h(v.id)}" ${v.id === estado.vet ? 'selected' : ''}>${h(v.nombre)}${v.especialidad ? ` · ${h(v.especialidad)}` : ''}</option>`).join('')}</select></div>` : ''}`}
                <div class="vet-presu-acciones">
                    <button class="btn-secundario btn-chico" data-volver>${clinicas.length > 1 ? 'Atrás' : 'Cancelar'}</button>
                    <button class="btn-primario btn-ancho-auto" data-seguir ${estado.mascota && estado.servicio ? '' : 'disabled'}>Ver horarios</button>
                </div>`;
            cont.querySelectorAll('[data-mascota]').forEach((b) => b.addEventListener('click', () => { estado.mascota = b.dataset.mascota; pasoServicio(); }));
            cont.querySelectorAll('[data-servicio]').forEach((b) => b.addEventListener('click', () => { estado.servicio = b.dataset.servicio; pasoServicio(); }));
            const sel = cont.querySelector('[data-sede]'); if (sel) sel.addEventListener('change', () => { estado.sede = sel.value; estado.vet = ''; pasoServicio(); });
            const sv = cont.querySelector('[data-vet]'); if (sv) sv.addEventListener('change', () => { estado.vet = sv.value; });
            cont.querySelector('[data-volver]').addEventListener('click', () => (clinicas.length > 1 ? (estado.op = null, estado.mascota = null, pasoClinica()) : volver()));
            const seguir = cont.querySelector('[data-seguir]');
            if (seguir) seguir.addEventListener('click', () => { estado.desde = Utils.hoy(); estado.hora = null; pasoHorario(); });
        }

        async function pasoHorario() {
            cont.innerHTML = '<p class="vet-vacio">Buscando horas libres...</p>';
            let dias = [];
            try { dias = await rpc('vet_app_horas_libres', { p_clinica: estado.clinica, p_sucursal: estado.sede, p_tipo: estado.servicio, p_veterinario: estado.vet || null, p_desde: estado.desde }) || []; }
            catch (e) { cont.innerHTML = `<p class="field-msg msg-error">${h(e.message)}</p>`; return; }
            if (!dias.some((d) => d.fecha === estado.dia)) estado.dia = dias.length ? dias[0].fecha : null;
            const horas = (dias.find((d) => d.fecha === estado.dia) || { horas: [] }).horas;
            const masAdelante = Utils.hoy() < estado.desde ? true : false;
            cont.innerHTML = `
                <p class="vet-texto">${h(TIPOS[estado.servicio])} · elige día y hora</p>
                ${dias.length ? `
                    <div class="vet-dias">${dias.map((d) => `<button class="vet-dia ${d.fecha === estado.dia ? 'activo' : ''}" data-dia="${h(d.fecha)}">${h(diaCorto(d.fecha))}<small>${d.horas.length} horas</small></button>`).join('')}</div>
                    <div class="vet-horas">${horas.map((x) => `<button class="vet-hora ${estado.hora && estado.hora.inicio === x.inicio ? 'activo' : ''}" data-hora="${h(x.inicio)}">${h(x.hora)}</button>`).join('')}</div>`
                    : '<p class="vet-vacio">No quedan horas libres en estos días.</p>'}
                <div class="vet-dias-nav">
                    ${masAdelante ? '<button class="vet-enlace" data-antes>← Antes</button>' : '<span></span>'}
                    <button class="vet-enlace" data-despues>Más días →</button>
                </div>
                <div class="input-wrap"><textarea data-motivo rows="2" maxlength="500" placeholder="Motivo o comentario para la clínica (opcional)"></textarea></div>
                <div class="vet-presu-acciones">
                    <button class="btn-secundario btn-chico" data-volver>Atrás</button>
                    <button class="btn-primario btn-ancho-auto" data-confirmar ${estado.hora ? '' : 'disabled'}>${estado.hora ? `Reservar ${h(estado.hora.hora)}` : 'Elige una hora'}</button>
                </div>
                <p class="field-msg"></p>`;
            cont.querySelectorAll('[data-dia]').forEach((b) => b.addEventListener('click', () => { estado.dia = b.dataset.dia; estado.hora = null; pasoHorario(); }));
            cont.querySelectorAll('[data-hora]').forEach((b) => b.addEventListener('click', () => {
                estado.hora = horas.find((x) => x.inicio === b.dataset.hora);
                cont.querySelectorAll('[data-hora]').forEach((x) => x.classList.toggle('activo', x === b));
                const ok = cont.querySelector('[data-confirmar]'); ok.disabled = false; ok.textContent = `Reservar ${estado.hora.hora}`;
            }));
            const sumar = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
            const ant = cont.querySelector('[data-antes]'); if (ant) ant.addEventListener('click', () => { estado.desde = sumar(estado.desde, -14); pasoHorario(); });
            cont.querySelector('[data-despues]').addEventListener('click', () => { estado.desde = sumar(estado.desde, 14); pasoHorario(); });
            cont.querySelector('[data-volver]').addEventListener('click', pasoServicio);
            const ok = cont.querySelector('[data-confirmar]');
            ok.addEventListener('click', async () => {
                Utils.setLoading(ok, true, 'Reservando...');
                try {
                    const r = await rpc('vet_app_reservar', { p_paciente: estado.mascota, p_sucursal: estado.sede, p_tipo: estado.servicio,
                        p_veterinario: estado.vet || null, p_inicio: estado.hora.inicio, p_motivo: cont.querySelector('[data-motivo]').value.trim() || null });
                    Utils.toast(r.estado === 'solicitada' ? 'Solicitud enviada: te avisaremos cuando la clínica la confirme.'
                        : `¡Listo! Hora confirmada para el ${cuando(r.inicio)}.`, 'exito');
                    await recargar();
                } catch (e) { Utils.setLoading(ok, false); mensaje(cont.querySelector('.field-msg'), e.message, true); }
            });
        }

        if (estado.clinica) pasoServicio(); else pasoClinica();
    }

    // ── Privacidad (Ley 21.719) ──────────────────────────────────
    function htmlPrivacidad(lista) {
        if (!lista.length) return '';
        return `
            <section class="card vet-seccion" id="vetPrivacidad">
                <div class="vet-seccion-cabecera"><h3>🔒 Tus datos personales</h3></div>
                <p class="vet-texto">Decide para qué puede usar cada veterinaria tus datos y pide una copia o su eliminación cuando quieras.</p>
                ${lista.map((p) => `
                    <details class="vet-presu vet-presu-hist vet-privacidad" data-clinica="${h(p.clinica_id)}">
                        <summary><span><b>${h(p.clinica)}</b><small>${Object.keys(FINALIDADES).filter((f) => p.finalidades && p.finalidades[f] && p.finalidades[f].otorgado).length} de 3 autorizaciones</small></span><span class="vet-chip">Ver</span></summary>
                        <details class="vet-politica"><summary>Leer la política de privacidad</summary><div class="vet-consent-texto">${h(p.politica)}</div></details>
                        <ul class="vet-finalidades">${Object.entries(FINALIDADES).map(([f, [t, d]]) => {
                            const e = p.finalidades && p.finalidades[f];
                            return `<li><label><span><b>${h(t)}</b><small>${h(d)}${e && e.otorgado && !e.vigente ? ' · aceptaste una versión anterior' : ''}</small></span>
                                <input type="checkbox" data-finalidad="${f}" ${e && e.otorgado ? 'checked' : ''}></label></li>`;
                        }).join('')}</ul>
                        <div class="vet-presu-acciones"><button class="btn-primario btn-ancho-auto" data-guardar>Guardar mis preferencias</button></div>
                        <p class="vet-etiqueta">¿Necesitas algo de tus datos?</p>
                        <div class="vet-solicitud">
                            <div class="input-wrap"><select data-tipo>${Object.entries(SOLICITUDES).map(([k, t]) => `<option value="${k}">${h(t)}</option>`).join('')}</select></div>
                            <div class="input-wrap"><textarea data-detalle rows="2" maxlength="1000" placeholder="Detalle (opcional)"></textarea></div>
                            <div class="vet-presu-acciones"><button class="btn-secundario btn-chico" data-solicitar>Enviar solicitud</button></div>
                        </div>
                        ${p.solicitudes.length ? `<ul class="vet-solicitudes">${p.solicitudes.map((s) => `<li>${h(SOLICITUDES[s.tipo] || s.tipo)} · ${fecha(s.creado_en)} ·
                            ${chip({ recibida: 'Recibida', en_proceso: 'En proceso', respondida: 'Respondida', rechazada: 'Rechazada' }[s.estado] || s.estado, s.estado === 'respondida' ? 'vet-chip-ok' : 'vet-chip-aviso')}
                            ${s.respuesta ? `<br><small>${h(s.respuesta)}</small>` : s.estado === 'recibida' || s.estado === 'en_proceso' ? `<br><small>Te responderán a más tardar el ${fecha(s.vence_el)}.</small>` : ''}</li>`).join('')}</ul>` : ''}
                        <p class="field-msg"></p>
                    </details>`).join('')}
            </section>`;
    }

    function conectarPrivacidad(raiz, recargar) {
        raiz.querySelectorAll('.vet-privacidad').forEach((box) => {
            const msg = box.querySelector(':scope > .field-msg');
            box.querySelector('[data-guardar]').addEventListener('click', async (ev) => {
                const finalidades = {};
                box.querySelectorAll('[data-finalidad]').forEach((c) => { finalidades[c.dataset.finalidad] = c.checked; });
                Utils.setLoading(ev.currentTarget, true, 'Guardando...');
                try { await rpc('vet_app_consentir_datos', { p_clinica: box.dataset.clinica, p_finalidades: finalidades }); Utils.toast('Preferencias guardadas.', 'exito'); await recargar(); }
                catch (e) { Utils.setLoading(ev.currentTarget, false); mensaje(msg, e.message, true); }
            });
            box.querySelector('[data-solicitar]').addEventListener('click', async (ev) => {
                const tipo = box.querySelector('[data-tipo]').value;
                if (tipo === 'supresion' && !confirm('Pedirás que la clínica elimine tus datos personales. La ficha clínica de tus mascotas se conserva sin tus datos. ¿Continuar?')) return;
                Utils.setLoading(ev.currentTarget, true, 'Enviando...');
                try {
                    await rpc('vet_app_solicitar_datos', { p_clinica: box.dataset.clinica, p_tipo: tipo, p_detalle: box.querySelector('[data-detalle]').value.trim() || null });
                    Utils.toast('Solicitud enviada. La clínica tiene 30 días hábiles para responder.', 'exito');
                    await recargar();
                } catch (e) { Utils.setLoading(ev.currentTarget, false); mensaje(msg, e.message, true); }
            });
        });
    }

    // Lleva la vista a una sección y la resalta.
    function mostrar(raiz, id) {
        const destino = raiz.querySelector(id);
        if (!destino) return;
        destino.scrollIntoView({ behavior: 'smooth', block: 'start' });
        destino.classList.add('vet-resaltado');
        setTimeout(() => destino.classList.remove('vet-resaltado'), 1800);
    }

    return { cargar, htmlEncuestas, htmlConsentimientos, htmlCitas, htmlPrivacidad, conectarEncuestas, conectarConsentimientos, conectarCitas,
        conectarPrivacidad, abrirReserva, mostrar };
})();

window.VetExtra = VetExtra;
