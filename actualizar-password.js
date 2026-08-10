// ================================================================
// ACTUALIZAR-PASSWORD.JS — Define la nueva contraseña (actualizar-password.html)
// Depende de: config.js, utils.js, auth.js
// Se llega acá solo desde el link del correo de recuperación: Supabase
// pone el token de recuperación en la URL y el cliente lo detecta solo,
// disparando el evento PASSWORD_RECOVERY.
// ================================================================

(() => {
    Utils.inicializarTema(document.getElementById('btnTema'));

    const subtitulo = document.getElementById('subtitulo');
    const form = document.getElementById('passwordForm');
    const linkVolver = document.getElementById('linkVolver');
    const btnGuardar = document.getElementById('btnGuardar');
    const mensajeGeneral = document.getElementById('mensajeGeneral');

    let sesionRecuperacionLista = false;

    db.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY') {
            sesionRecuperacionLista = true;
            subtitulo.textContent = 'Ingresa tu nueva contraseña.';
            form.hidden = false;
        }
    });

    // Si el link ya expiró o no trae un token válido, nunca llega el
    // evento PASSWORD_RECOVERY — avisamos pasado un momento razonable.
    setTimeout(() => {
        if (!sesionRecuperacionLista) {
            subtitulo.textContent = 'Este link no es válido o ya expiró. Solicita uno nuevo.';
            mostrarLinkVolver('← Solicitar un nuevo link', '/recuperar.html');
        }
    }, 2500);

    form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        limpiarErrores();

        const password = document.getElementById('password').value;
        const password2 = document.getElementById('password2').value;

        let valido = true;
        if (password.length < 6) { mostrarError('errPassword', 'Mínimo 6 caracteres.'); valido = false; }
        if (password !== password2) { mostrarError('errPassword2', 'Las contraseñas no coinciden.'); valido = false; }
        if (!valido) return;

        Utils.setLoading(btnGuardar, true, 'Guardando...');
        mensajeGeneral.textContent = '';
        mensajeGeneral.className = 'field-msg';

        const res = await Auth.actualizarPassword(password);

        Utils.setLoading(btnGuardar, false);

        if (!res.ok) {
            mensajeGeneral.textContent = res.error;
            mensajeGeneral.className = 'field-msg msg-error';
            return;
        }

        await db.auth.signOut();
        form.hidden = true;
        subtitulo.textContent = '¡Contraseña actualizada! Ya puedes iniciar sesión con tu nueva contraseña.';
        mostrarLinkVolver('← Ir a iniciar sesión', '/index.html');
    });

    function mostrarLinkVolver(texto, href) {
        const a = linkVolver.querySelector('a');
        a.textContent = texto;
        a.href = href;
        linkVolver.hidden = false;
    }

    function mostrarError(idSpan, texto) {
        const span = document.getElementById(idSpan);
        if (span) span.textContent = texto;
    }

    function limpiarErrores() {
        document.querySelectorAll('.field-error').forEach((el) => (el.textContent = ''));
    }
})();
