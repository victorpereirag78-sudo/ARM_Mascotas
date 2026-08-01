// ================================================================
// REGISTRO.JS — Lógica del alta de dueño (registro.html)
// Depende de: config.js, utils.js, auth.js
// ================================================================

(() => {
    Utils.inicializarTema(document.getElementById('btnTema'));

    const form = document.getElementById('registroForm');
    const btnRegistrar = document.getElementById('btnRegistrar');
    const mensajeGeneral = document.getElementById('mensajeGeneral');

    Auth.restaurarSesion().then((res) => {
        if (res.ok) window.location.href = 'app.html';
    });

    form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        limpiarErrores();

        const correo = document.getElementById('correo').value.trim();
        const password = document.getElementById('password').value;
        const nombre = document.getElementById('nombre').value.trim();
        const apellido = document.getElementById('apellido').value.trim();

        let valido = true;
        if (!Utils.esEmailValido(correo)) { mostrarError('errCorreo', 'Ingresa un correo válido.'); valido = false; }
        if (password.length < 6) { mostrarError('errPassword', 'Mínimo 6 caracteres.'); valido = false; }
        if (!nombre) { mostrarError('errNombre', 'Campo requerido.'); valido = false; }
        if (!apellido) { mostrarError('errApellido', 'Campo requerido.'); valido = false; }
        if (!valido) return;

        Utils.setLoading(btnRegistrar, true, 'Creando cuenta...');
        mensajeGeneral.textContent = '';
        mensajeGeneral.className = 'field-msg';

        const res = await Auth.registrarDueno({
            email: correo,
            password,
            nombre,
            apellido,
            telefono: valor('telefono'),
            whatsapp: valor('whatsapp'),
            direccion: valor('direccion'),
            ciudad: valor('ciudad'),
            region: valor('region'),
            pais: valor('pais'),
            contacto_emergencia_nombre: valor('contactoEmergenciaNombre'),
            contacto_emergencia_telefono: valor('contactoEmergenciaTelefono')
        });

        Utils.setLoading(btnRegistrar, false);

        if (!res.ok) {
            mensajeGeneral.textContent = res.error;
            mensajeGeneral.className = 'field-msg msg-error';
            return;
        }

        mensajeGeneral.textContent = '¡Cuenta creada! Redirigiendo...';
        mensajeGeneral.className = 'field-msg msg-exito';
        setTimeout(() => (window.location.href = 'app.html'), 900);
    });

    function valor(id) {
        const el = document.getElementById(id);
        return el ? el.value.trim() || null : null;
    }

    function mostrarError(idSpan, texto) {
        const span = document.getElementById(idSpan);
        if (span) span.textContent = texto;
    }

    function limpiarErrores() {
        document.querySelectorAll('.field-error').forEach((el) => (el.textContent = ''));
    }
})();
