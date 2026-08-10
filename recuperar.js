// ================================================================
// RECUPERAR.JS — Solicitud de correo de recuperación (recuperar.html)
// Depende de: config.js, utils.js, auth.js
// ================================================================

(() => {
    Utils.inicializarTema(document.getElementById('btnTema'));

    const form = document.getElementById('recuperarForm');
    const btnEnviar = document.getElementById('btnEnviar');
    const mensajeGeneral = document.getElementById('mensajeGeneral');

    form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        limpiarErrores();

        const email = document.getElementById('email').value.trim();
        if (!Utils.esEmailValido(email)) {
            mostrarError('errEmail', 'Ingresa un correo válido.');
            return;
        }

        Utils.setLoading(btnEnviar, true, 'Enviando...');
        mensajeGeneral.textContent = '';
        mensajeGeneral.className = 'field-msg';

        const res = await Auth.solicitarRecuperacion(email);

        Utils.setLoading(btnEnviar, false);

        // Mismo mensaje exista o no la cuenta: evita que alguien use este
        // formulario para averiguar qué correos están registrados.
        mensajeGeneral.textContent = 'Si el correo está registrado, te llegará un link para crear una nueva contraseña. Revisa también SPAM/No deseados.';
        mensajeGeneral.className = 'field-msg msg-exito';
        form.reset();
    });

    function mostrarError(idSpan, texto) {
        const span = document.getElementById(idSpan);
        if (span) span.textContent = texto;
    }

    function limpiarErrores() {
        document.querySelectorAll('.field-error').forEach((el) => (el.textContent = ''));
    }
})();
