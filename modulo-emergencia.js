// ================================================================
// MODULO-EMERGENCIA.JS — Modo Emergencia Veterinaria
// Depende de: config.js, utils.js
// El markup vive fijo en app.html (#emergenciaOverlay), fuera del
// #appShell, así que este módulo se autoinicializa al cargar.
// No hace diagnósticos: solo ubica veterinarias cercanas en Google
// Maps y permite compartir la ubicación del usuario.
// Expone window.Emergencia.
// ================================================================

const Emergencia = (() => {

    function abrir() {
        document.getElementById('emergenciaOverlay').hidden = false;
        document.getElementById('emergenciaMensaje').textContent = '';
    }

    function cerrar() {
        document.getElementById('emergenciaOverlay').hidden = true;
    }

    function obtenerUbicacion() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Tu navegador no soporta geolocalización.'));
                return;
            }
            navigator.geolocation.getCurrentPosition(
                (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                () => reject(new Error('No pudimos obtener tu ubicación. Revisa los permisos de ubicación del navegador.')),
                { enableHighAccuracy: true, timeout: 10000 }
            );
        });
    }

    async function buscarVeterinariaCercana() {
        const btn = document.getElementById('btnBuscarVetCercana');
        const mensaje = document.getElementById('emergenciaMensaje');
        mensaje.textContent = '';
        mensaje.className = 'field-msg';

        Utils.setLoading(btn, true, 'Obteniendo ubicación...');
        try {
            const { lat, lng } = await obtenerUbicacion();
            const url = `https://www.google.com/maps/search/veterinaria+urgencia+24+horas/@${lat},${lng},14z`;
            window.open(url, '_blank');
        } catch (e) {
            mensaje.textContent = e.message;
            mensaje.className = 'field-msg msg-error';
        }
        Utils.setLoading(btn, false);
    }

    async function compartirUbicacion() {
        const btn = document.getElementById('btnCompartirUbicacion');
        const mensaje = document.getElementById('emergenciaMensaje');
        mensaje.textContent = '';
        mensaje.className = 'field-msg';

        Utils.setLoading(btn, true, 'Obteniendo ubicación...');
        try {
            const { lat, lng } = await obtenerUbicacion();
            const texto = `Mi ubicación actual: https://maps.google.com/?q=${lat},${lng}`;
            if (navigator.share) {
                await navigator.share({ text: texto });
            } else {
                window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank');
            }
        } catch (e) {
            if (e.name !== 'AbortError') {
                mensaje.textContent = e.message || 'No se pudo compartir la ubicación.';
                mensaje.className = 'field-msg msg-error';
            }
        }
        Utils.setLoading(btn, false);
    }

    document.getElementById('btnCerrarEmergencia').addEventListener('click', cerrar);
    document.getElementById('btnBuscarVetCercana').addEventListener('click', buscarVeterinariaCercana);
    document.getElementById('btnCompartirUbicacion').addEventListener('click', compartirUbicacion);

    return { abrir, cerrar };
})();

window.Emergencia = Emergencia;
