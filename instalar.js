// ================================================================
// INSTALAR.JS — Página /instalar: guía de instalación según el
// dispositivo. Depende de: utils.js, pwa-instalar.js
// ================================================================

(() => {
    const contenedor = document.getElementById('instContenido');
    const mensaje = document.getElementById('instMensaje');
    const URL_PAGINA = `${location.origin}/instalar.html`;

    const ICONO_COMPARTIR_IOS = '<svg class="inst-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M8 7l4-4 4 4"/><path d="M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8"/></svg>';
    const ICONO_MENU_ANDROID = '<svg class="inst-ico" viewBox="0 0 24 24" aria-hidden="true"><circle class="relleno" cx="12" cy="5" r="1.8"/><circle class="relleno" cx="12" cy="12" r="1.8"/><circle class="relleno" cx="12" cy="19" r="1.8"/></svg>';

    function pasos(lista) {
        return `<ol class="inst-pasos">${lista.map((p, i) => `<li><span class="inst-num">${i + 1}</span><span>${p}</span></li>`).join('')}</ol>`;
    }

    function textoCopiar() {
        return '<button class="btn-primario" id="btnCopiarEnlace" type="button">🔗 Copiar enlace para abrirlo allí</button>';
    }

    function qr() {
        const src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=10&data=${encodeURIComponent(URL_PAGINA)}`;
        return `<div class="inst-qr"><img src="${src}" alt="Código QR para abrir esta página en tu teléfono" width="180" height="180" loading="lazy"><p>Escanéalo con la cámara de tu teléfono</p></div>`;
    }

    const VISTAS = {
        instalada: () => `
            <div class="inst-estado inst-ok"><span aria-hidden="true">✅</span><div><h2>Ya la tienes instalada</h2><p>Ábrela desde el ícono de tu pantalla de inicio.</p></div></div>
            <a class="btn-primario inst-boton" href="/app.html">Abrir ARM Mascotas</a>`,

        nativa: () => `
            <h2>Un toque y listo</h2>
            <p class="inst-texto">Se agrega un ícono a tu pantalla de inicio y se abre a pantalla completa.</p>
            <button class="btn-primario inst-boton" id="btnInstalarAhora" type="button">📲 Instalar ahora</button>`,

        'ios-safari': () => `
            <h2>Instálala en tu iPhone</h2>
            ${pasos([
                `Toca el botón <b>Compartir</b> ${ICONO_COMPARTIR_IOS} en la barra de Safari.`,
                'Baja y elige <b>Agregar al inicio</b> (o "Añadir a pantalla de inicio").',
                'Toca <b>Agregar</b>. Listo: aparece el ícono de ARM Mascotas.'
            ])}
            <p class="inst-nota">En iPhone solo funciona desde Safari y con la página abierta aquí, no dentro de otra app.</p>`,

        'ios-otro': () => `
            <h2>Ábrela en Safari</h2>
            <p class="inst-texto">En iPhone y iPad, Apple solo permite instalar desde <b>Safari</b>. Copia el enlace, ábrelo en Safari y sigue los pasos.</p>
            ${textoCopiar()}`,

        'navegador-interno': () => `
            <h2>Ábrela en tu navegador</h2>
            <p class="inst-texto">Estás dentro de otra app (WhatsApp, Instagram…), que no permite instalar. Toca el menú ${ICONO_MENU_ANDROID} y elige <b>Abrir en el navegador</b>, o copia el enlace.</p>
            ${textoCopiar()}`,

        'android-manual': () => `
            <h2>Instálala en tu teléfono</h2>
            ${pasos([
                `Toca el menú ${ICONO_MENU_ANDROID} de tu navegador (arriba a la derecha).`,
                'Elige <b>Instalar aplicación</b> o <b>Agregar a la pantalla principal</b>.',
                'Confirma. El ícono de ARM Mascotas aparece en tu pantalla de inicio.'
            ])}
            <p class="inst-nota">Si no ves esa opción, abre este enlace en Google Chrome.</p>`,

        escritorio: () => `
            <h2>Instálala en tu computador o en tu teléfono</h2>
            <p class="inst-texto">En Chrome o Edge busca el ícono de <b>instalar</b> al final de la barra de direcciones. Para el teléfono, escanea este código:</p>
            ${qr()}`
    };

    function render() {
        const clave = PWAInstalar.plataforma();
        contenedor.innerHTML = (VISTAS[clave] || VISTAS.escritorio)();

        const btnInstalar = document.getElementById('btnInstalarAhora');
        if (btnInstalar) btnInstalar.addEventListener('click', async () => {
            const r = await PWAInstalar.instalar();
            if (r === 'dismissed') avisar('Sin problema: puedes instalarla cuando quieras desde esta página.');
        });
        const btnCopiarEnlace = document.getElementById('btnCopiarEnlace');
        if (btnCopiarEnlace) btnCopiarEnlace.addEventListener('click', copiar);
    }

    function avisar(texto) {
        mensaje.textContent = texto;
        mensaje.className = 'field-msg msg-exito';
    }

    async function copiar() {
        try {
            await navigator.clipboard.writeText(URL_PAGINA);
            avisar('Enlace copiado. Pégalo en tu navegador.');
        } catch (_e) {
            window.prompt('Copia este enlace:', URL_PAGINA);
        }
    }

    async function compartir() {
        if (navigator.share) {
            try {
                await navigator.share({ title: 'ARM Mascotas', text: 'Instala ARM Mascotas en tu teléfono:', url: URL_PAGINA });
                return;
            } catch (e) {
                if (e && e.name === 'AbortError') return;
            }
        }
        copiar();
    }

    Utils.inicializarTema(document.getElementById('btnTema'));
    document.getElementById('btnCopiar').addEventListener('click', copiar);
    document.getElementById('btnCompartir').addEventListener('click', compartir);
    PWAInstalar.alCambiar(render);
    render();

    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
})();
