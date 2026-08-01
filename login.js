// ================================================================
// LOGIN.JS — Lógica de la pantalla de acceso (index.html)
// Depende de: config.js, utils.js, auth.js
// ================================================================

(() => {
    Utils.inicializarTema(document.getElementById('btnTema'));

    const form = document.getElementById('loginForm');
    const btnLogin = document.getElementById('btnLogin');
    const mensajeGeneral = document.getElementById('mensajeGeneral');

    // Si ya hay sesión activa, saltar directo a la app.
    Auth.restaurarSesion().then((res) => {
        if (res.ok) window.location.href = 'app.html';
    });

    form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        limpiarErrores();

        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;

        let valido = true;
        if (!Utils.esEmailValido(email)) {
            mostrarError('errEmail', 'Ingresa un correo válido.');
            valido = false;
        }
        if (!password) {
            mostrarError('errPassword', 'Ingresa tu contraseña.');
            valido = false;
        }
        if (!valido) return;

        Utils.setLoading(btnLogin, true, 'Ingresando...');
        mensajeGeneral.textContent = '';
        mensajeGeneral.className = 'field-msg';

        const res = await Auth.login(email, password);

        Utils.setLoading(btnLogin, false);

        if (!res.ok) {
            mensajeGeneral.textContent = res.error;
            mensajeGeneral.className = 'field-msg msg-error';
            return;
        }

        window.location.href = 'app.html';
    });

    function mostrarError(idSpan, texto) {
        const span = document.getElementById(idSpan);
        if (span) span.textContent = texto;
    }

    function limpiarErrores() {
        document.querySelectorAll('.field-error').forEach((el) => (el.textContent = ''));
    }
})();
