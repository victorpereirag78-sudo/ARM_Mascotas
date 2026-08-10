// ================================================================
// PASAPORTE.JS — Pasaporte Digital público (pasaporte.html), sin login
// Depende de: config.js, utils.js
// Lee ?t=<token> y llama a fn_pasaporte_publico vía RPC. El enlace
// vence solo (expira_at); pasado ese momento, la función no devuelve
// filas y se muestra el aviso de "no disponible".
// ================================================================

(async () => {
    Utils.inicializarTema(document.getElementById('btnTema'));

    const contenedor = document.getElementById('pasaporteContenido');
    const token = new URLSearchParams(window.location.search).get('t');

    if (!token) {
        contenedor.innerHTML = plantillaError('Este enlace no incluye un código válido.');
        return;
    }

    const { data, error } = await db.rpc('fn_pasaporte_publico', { p_token: token });

    if (error || !data || !data.length) {
        contenedor.innerHTML = plantillaError('Este enlace no existe o ya venció. Pídele al dueño que genere uno nuevo.');
        return;
    }

    contenedor.innerHTML = plantillaPasaporte(data[0]);

    function plantillaPasaporte(m) {
        const emojiEspecie = m.especie === 'perro' ? '🐶' : m.especie === 'gato' ? '🐱' : '🐾';
        const edad = Utils.calcularEdadMascota(m.fecha_nacimiento, m.especie);

        return `
            <div class="sos-publico-foto">
                ${m.foto_url ? `<img src="${m.foto_url}" alt="${esc(m.nombre)}">` : `<span>${emojiEspecie}</span>`}
            </div>
            <h1 class="sos-publico-nombre">${esc(m.nombre)}</h1>
            <p class="sos-publico-sub">${esc(m.raza) || capitalizar(m.especie)} · ${etiquetaSexo(m.sexo)} · ${Utils.textoEdad(edad)}</p>

            <div class="pasaporte-publico-grid">
                ${dato('Peso', m.peso_actual ? m.peso_actual + ' kg' : '—')}
                ${dato('Color', m.color || '—')}
                ${dato('Microchip', m.microchip || 'Sin registrar')}
                ${dato('Nacimiento', m.fecha_nacimiento ? Utils.formatearFecha(m.fecha_nacimiento) : '—')}
            </div>

            ${seccion('💉 Vacunas', m.vacunas, (v) => `${esc(v.nombre)} · ${Utils.formatearFecha(v.fecha)}`)}
            ${seccion('🐛 Desparasitación', m.desparasitaciones, (d) => `${d.tipo === 'interna' ? 'Interna' : 'Externa'}${d.producto ? ' · ' + esc(d.producto) : ''} · ${Utils.formatearFecha(d.fecha)}`)}
            ${seccion('💊 Medicamentos', m.medicamentos, (med) => `${esc(med.nombre)}${med.dosis ? ' · ' + esc(med.dosis) : ''}${med.activo ? ' (activo)' : ''}`)}
            ${seccion('🚨 Alergias', m.alergias, (a) => `${esc(a.nombre)}${a.severidad ? ' · ' + esc(a.severidad) : ''}`)}
            ${seccion('📋 Diagnósticos / enfermedades', m.diagnosticos, (d) => `${esc(d.nombre)} · ${Utils.formatearFecha(d.fecha)}${d.estado ? ' · ' + esc(d.estado) : ''}`)}
            ${seccion('🔪 Cirugías', m.cirugias, (c) => `${esc(c.nombre)} · ${Utils.formatearFecha((c.fecha || '').slice(0, 10))}`)}
            ${seccion('🩺 Controles veterinarios', m.consultas, (c) => `${esc(c.motivo || 'Consulta')} · ${Utils.formatearFecha((c.fecha || '').slice(0, 10))}`)}

            ${m.dueno_nombre ? `
                <div class="pasaporte-publico-contactos">
                    <strong>Contactos</strong>
                    ${fila('Dueño', esc(m.dueno_nombre) + (m.dueno_telefono ? ' · ' + esc(m.dueno_telefono) : ''))}
                    ${fila('Veterinario', m.veterinario_nombre ? esc(m.veterinario_nombre) + (m.veterinario_telefono ? ' · ' + esc(m.veterinario_telefono) : '') : null)}
                    ${fila('Contacto de emergencia', m.contacto_emergencia_nombre ? esc(m.contacto_emergencia_nombre) + (m.contacto_emergencia_telefono ? ' · ' + esc(m.contacto_emergencia_telefono) : '') : null)}
                </div>
            ` : ''}
        `;
    }

    function seccion(titulo, items, formatear) {
        if (!items || !items.length) return '';
        return `
            <div class="pasaporte-publico-seccion">
                <strong>${titulo}</strong>
                <ul>${items.map((i) => `<li>${formatear(i)}</li>`).join('')}</ul>
            </div>
        `;
    }

    function dato(etiqueta, valor) {
        return `<div class="sos-item"><span class="sos-etiqueta">${etiqueta}</span><span>${esc(valor)}</span></div>`;
    }

    function fila(etiqueta, valor) {
        if (!valor) return '';
        return `<div class="sos-publico-fila"><span class="sos-publico-etiqueta">${etiqueta}</span><span class="sos-publico-valor">${valor}</span></div>`;
    }

    function plantillaError(texto) {
        return `
            <div class="sos-publico-foto"><span>🐾</span></div>
            <h1 class="sos-publico-nombre">Pasaporte no disponible</h1>
            <p class="sos-publico-sub">${texto}</p>
        `;
    }

    function etiquetaSexo(sexo) {
        return { macho: 'Macho', hembra: 'Hembra' }[sexo] || 'Sexo sin registrar';
    }

    function capitalizar(s) {
        return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
    }

    function esc(v) {
        return (v || '').toString().replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
})();
