// ================================================================
// MODULO-PASAPORTE-INTL.JS — Pasaporte internacional (documento oficial)
// Depende de: config.js, utils.js
// El tutor ve el documento que su veterinaria digitalizó y publicó
// (RPC vet_app_pasaportes): datos de emisión y páginas. Puede verlo,
// descargarlo y compartirlo. Se muestra dentro del Pasaporte de la
// mascota; si no hay ninguno publicado, no se dibuja nada.
// Los archivos viven en el bucket PRIVADO vet-privado: se abren con
// enlaces firmados de pocos minutos, nunca con un enlace permanente.
// Expone window.PasaporteInternacional.
// ================================================================

const PasaporteInternacional = (() => {

    const TIPOS = {
        pasaporte: 'Pasaporte',
        certificado_zoosanitario: 'Certificado zoosanitario',
        certificado_sanitario: 'Certificado sanitario',
        otro: 'Documento'
    };
    const EXTENSIONES = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' };

    // Última respuesta por mascota: al volver a dibujar la ficha no parpadea.
    const cache = {};
    let listaActual = [];

    function esc(v) {
        return (v == null ? '' : String(v)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // Acepta fechas (AAAA-MM-DD) y marcas de tiempo (publicado_en): Utils.formatearFecha solo entiende la fecha.
    function fecha(v) {
        return v ? Utils.formatearFecha(String(v).slice(0, 10)) : '—';
    }

    async function montar(el, mascota) {
        if (!el || !mascota) return;
        if (cache[mascota.id]) pintar(el, mascota, cache[mascota.id]);
        try {
            const { data, error } = await db.rpc('vet_app_pasaportes', { p_mascota_app: mascota.id });
            if (error) throw error;
            cache[mascota.id] = Array.isArray(data) ? data : [];
        } catch (e) {
            // Sin conexión o sin acceso: no se inventa nada; si ya había una versión en caché, queda esa.
            if (!cache[mascota.id]) el.innerHTML = '';
            return;
        }
        if (el.isConnected) pintar(el, mascota, cache[mascota.id]);
    }

    function pintar(el, mascota, lista) {
        listaActual = lista;
        if (!lista.length) { el.innerHTML = ''; return; }
        el.innerHTML = `
            <section class="pasint">
                <h4 class="seccion-titulo">🛂 Pasaporte internacional</h4>
                <p class="pasint-aviso">Es el documento oficial que tu veterinaria digitalizó. ARM Mascotas solo lo muestra y lo guarda de forma privada:
                    su validez la define la autoridad que lo emitió.</p>
                ${lista.map((p, i) => tarjeta(p, i)).join('')}
            </section>
        `;
        el.querySelectorAll('[data-pasint-accion]').forEach((btn) => {
            btn.addEventListener('click', () => accion(btn, mascota));
        });
    }

    function tarjeta(p, i) {
        const archivos = Array.isArray(p.archivos) ? p.archivos : [];
        const tipo = TIPOS[p.tipo_documento] || 'Documento';
        return `
            <article class="pasint-item">
                <div class="pasint-titulo">
                    <strong>${esc(tipo)}${p.numero ? ' · N° ' + esc(p.numero) : ''}</strong>
                    ${p.timbrado ? '<span class="pasint-chip">Timbrado</span>' : ''}
                </div>
                <div class="pasaporte-grid">
                    ${dato('País de emisión', p.pais_nombre || p.pais_emision)}
                    ${dato('Fecha de emisión', fecha(p.fecha_emision))}
                    ${dato('Vencimiento', fecha(p.fecha_vencimiento))}
                    ${dato('Autoridad emisora', p.autoridad_emisora)}
                    ${p.timbrado ? dato('Fecha de timbrado', fecha(p.fecha_timbrado)) : ''}
                    ${dato('Veterinario', p.veterinario)}
                    ${dato('Clínica emisora', p.clinica_emisora || p.clinica)}
                </div>
                ${p.observaciones ? `<p class="pasint-obs">${esc(p.observaciones)}</p>` : ''}
                <p class="pasint-sub">Publicado por ${esc(p.clinica)}${p.publicado_en ? ' el ' + fecha(p.publicado_en) : ''}</p>
                ${archivos.length ? `
                    <ul class="pasint-paginas">
                        ${archivos.map((a, j) => `
                            <li>
                                <span class="pasint-pagina">${(a.mime || '').indexOf('image/') === 0 ? '🖼️' : '📄'} Página ${esc(a.pagina)}</span>
                                <button type="button" class="btn-secundario" data-pasint-accion="ver" data-p="${i}" data-a="${j}">Ver</button>
                                <button type="button" class="btn-secundario" data-pasint-accion="descargar" data-p="${i}" data-a="${j}">Descargar</button>
                            </li>
                        `).join('')}
                    </ul>
                    <button type="button" class="btn-primario btn-ancho-auto" data-pasint-accion="compartir" data-p="${i}">📤 Compartir</button>
                ` : '<p class="pasint-obs">Tu veterinaria aún no subió las páginas del documento.</p>'}
            </article>
        `;
    }

    function dato(etiqueta, valor) {
        return `<div class="sos-item"><span class="sos-etiqueta">${etiqueta}</span><span>${esc(valor || '—')}</span></div>`;
    }

    function nombreArchivo(mascota, p, a) {
        const base = `${TIPOS[p.tipo_documento] || 'Documento'}-${mascota.nombre}-pagina${a.pagina}`;
        return base.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9-]+/g, '_') + '.' + (EXTENSIONES[a.mime] || 'bin');
    }

    // Enlace firmado de pocos minutos (el bucket es privado y solo abre si la clínica lo tiene publicado).
    async function urlFirmada(ruta, opciones) {
        const { data, error } = await db.storage.from('vet-privado').createSignedUrl(ruta, opciones && opciones.download ? 300 : 600, opciones);
        if (error) throw error;
        return data.signedUrl;
    }

    async function accion(btn, mascota) {
        const p = listaActual[Number(btn.dataset.p)];
        const a = p && p.archivos ? p.archivos[Number(btn.dataset.a)] : null;
        const que = btn.dataset.pasintAccion;
        const etiqueta = btn.textContent;
        btn.disabled = true;
        try {
            if (que === 'ver' && a) {
                window.open(await urlFirmada(a.ruta), '_blank', 'noopener');
            } else if (que === 'descargar' && a) {
                const enlace = document.createElement('a');
                enlace.href = await urlFirmada(a.ruta, { download: nombreArchivo(mascota, p, a) });
                enlace.rel = 'noopener';
                document.body.appendChild(enlace);
                enlace.click();
                enlace.remove();
            } else if (que === 'compartir' && p) {
                btn.textContent = 'Preparando…';
                await compartir(mascota, p);
            }
        } catch (e) {
            if (e && e.name === 'AbortError') { /* la persona cerró el menú de compartir */ }
            else Utils.toast('No se pudo completar la acción: ' + ((e && e.message) || 'intenta de nuevo'), 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = etiqueta;
        }
    }

    // Comparte los archivos reales (no un enlace público): se descargan con enlace firmado y se pasan al menú de compartir del dispositivo.
    async function compartir(mascota, p) {
        const archivos = [];
        for (const a of p.archivos) {
            const resp = await fetch(await urlFirmada(a.ruta));
            if (!resp.ok) throw new Error('No se pudo leer el archivo');
            const blob = await resp.blob();
            archivos.push(new File([blob], nombreArchivo(mascota, p, a), { type: a.mime || blob.type }));
        }
        const datosCompartir = {
            files: archivos,
            title: `${TIPOS[p.tipo_documento] || 'Documento'} de ${mascota.nombre}`,
            text: `${TIPOS[p.tipo_documento] || 'Documento'} de ${mascota.nombre}`
        };
        if (navigator.canShare && navigator.canShare({ files: archivos }) && navigator.share) {
            await navigator.share(datosCompartir);
            return;
        }
        Utils.toast('Este dispositivo no permite compartir archivos desde la app: usa "Descargar" y envíalo desde tu galería o archivos.', 'info');
    }

    return { montar };
})();

window.PasaporteInternacional = PasaporteInternacional;
