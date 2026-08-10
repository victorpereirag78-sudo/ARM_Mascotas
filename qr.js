// ================================================================
// QR.JS — Ficha pública de emergencia (qr.html), sin autenticación
// Depende de: config.js, utils.js
// Lee ?t=<qr_token> y llama a fn_ficha_publica_qr vía RPC.
// ================================================================

(async () => {
    Utils.inicializarTema(document.getElementById('btnTema'));

    const contenedor = document.getElementById('sosContenido');
    const token = new URLSearchParams(window.location.search).get('t');

    if (!token) {
        contenedor.innerHTML = plantillaError('Este enlace no incluye un código válido.');
        return;
    }

    const { data, error } = await db.rpc('fn_ficha_publica_qr', { p_token: token });

    if (error || !data || !data.length) {
        contenedor.innerHTML = plantillaError('No encontramos una mascota asociada a este código QR.');
        return;
    }

    contenedor.innerHTML = plantillaFicha(data[0]);

    function plantillaFicha(m) {
        const emojiEspecie = m.especie === 'perro' ? '🐶' : m.especie === 'gato' ? '🐱' : '🐾';
        const telefonoContacto = m.perdida_activa && m.perdida_contacto_telefono ? m.perdida_contacto_telefono : m.dueno_telefono;
        const nombreContacto = m.perdida_activa && m.perdida_contacto_nombre ? m.perdida_contacto_nombre : null;

        return `
            ${m.perdida_activa ? `
                <div class="sos-publico-banner-perdida">
                    <strong>🚨 ¡Esta mascota está perdida!</strong>
                    ${m.perdida_descripcion ? `<p>${esc(m.perdida_descripcion)}</p>` : ''}
                    ${m.perdida_ultima_ubicacion ? `<p>Última ubicación: ${esc(m.perdida_ultima_ubicacion)}</p>` : ''}
                    ${m.perdida_fecha_hora ? `<p class="sos-publico-fecha-perdida">Desde: ${formatearFechaHora(m.perdida_fecha_hora)}</p>` : ''}
                </div>
            ` : ''}

            <div class="sos-publico-foto">
                ${m.foto_url ? `<img src="${m.foto_url}" alt="${esc(m.nombre)}">` : `<span>${emojiEspecie}</span>`}
            </div>
            <h1 class="sos-publico-nombre">${esc(m.nombre)}</h1>
            <p class="sos-publico-sub">${esc(m.raza) || capitalizar(m.especie)}</p>
            <p class="sos-publico-tiene-dueno">🏠 Esta mascota tiene dueño</p>

            ${telefonoContacto ? `
                <div class="sos-publico-contactar">
                    <a class="btn-primario" href="tel:${telefonoContacto.replace(/\s+/g, '')}">📞 Llamar${nombreContacto ? ' a ' + esc(nombreContacto) : ' al dueño'}</a>
                    <a class="btn-secundario" href="https://wa.me/${soloDigitos(telefonoContacto)}" target="_blank" rel="noopener">💬 WhatsApp</a>
                </div>
            ` : ''}

            ${fila('🚨 Alergias', m.alergias && m.alergias.length ? m.alergias.map(esc).join(', ') : null)}
            ${fila('💊 Medicamentos activos', m.medicamentos_activos && m.medicamentos_activos.length ? m.medicamentos_activos.map(esc).join(', ') : null)}
            ${fila('⚠️ Condiciones especiales', m.condiciones_especiales ? esc(m.condiciones_especiales) : null)}
            ${fila('🩺 Veterinario', m.veterinario_nombre ? esc(m.veterinario_nombre) + (m.veterinario_telefono ? ' · ' + esc(m.veterinario_telefono) : '') : null)}
            ${fila('📞 Teléfono del dueño', m.dueno_telefono ? esc(m.dueno_telefono) : null)}
            ${fila('🆘 Contacto de emergencia', m.contacto_emergencia_nombre ? esc(m.contacto_emergencia_nombre) + (m.contacto_emergencia_telefono ? ' · ' + esc(m.contacto_emergencia_telefono) : '') : null)}

            <p class="sos-publico-nota">Si encontraste a ${esc(m.nombre)}, por favor contacta a su familia usando los datos disponibles arriba.</p>
        `;
    }

    function fila(etiqueta, valor) {
        if (!valor) return '';
        return `
            <div class="sos-publico-fila">
                <span class="sos-publico-etiqueta">${etiqueta}</span>
                <span class="sos-publico-valor">${valor}</span>
            </div>
        `;
    }

    function formatearFechaHora(iso) {
        if (!iso) return '';
        const fecha = Utils.formatearFecha(iso.slice(0, 10));
        const hora = iso.slice(11, 16);
        return hora ? `${fecha} ${hora}` : fecha;
    }

    function soloDigitos(tel) {
        return (tel || '').replace(/\D/g, '');
    }

    function plantillaError(texto) {
        return `
            <div class="sos-publico-foto"><span>🐾</span></div>
            <h1 class="sos-publico-nombre">Ficha no disponible</h1>
            <p class="sos-publico-sub">${texto}</p>
        `;
    }

    function capitalizar(s) {
        return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
    }

    function esc(v) {
        return (v || '').toString().replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
})();
