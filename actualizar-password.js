// ================================================================
// ACTUALIZAR-PASSWORD.JS — Define la nueva contraseña (actualizar-password.html)
// Depende de: config.js, utils.js, auth.js
// Se llega acá solo desde el link del correo de recuperación: Supabase
// pone el token de recuperación en la URL y el cliente lo detecta solo,
// disparando el evento PASSWORD_RECOVERY.
//
// Esta página es el punto ÚNICO de recuperación para todas las apps
// que comparten este mismo proyecto Supabase (mascotas, mi vehículo,
// emprendedores, documentos auto, taller): cada una arma su
// redirectTo con ?volver=<slug> para que, al terminar, el usuario
// pueda volver directo a la app desde la que pidió el cambio.
// ================================================================

(() => {
    Utils.inicializarTema(document.getElementById('btnTema'));

    const APPS = {
        mascotas: { nombre: 'ARM Mascotas', url: 'https://arm-mascotas.pages.dev/index.html' },
        mivehiculo: { nombre: 'Mi Vehículo', url: 'https://mi-vehiculo.pages.dev/' },
        emprendedores: { nombre: 'ARM Emprendedores', url: 'https://arm-emprendedores.pages.dev/' },
        documentosauto: { nombre: 'ARM Documentos Auto', url: 'https://arm-documentosauto.pages.dev/' },
        taller: { nombre: 'Taller App', url: 'https://tallerapp.cl/' },
        mendezc: { nombre: 'Méndez C.', url: 'https://www.mendezc.cl/' }
    };
    const appOrigen = new URLSearchParams(window.location.search).get('volver');

    const subtitulo = document.getElementById('subtitulo');
    const form = document.getElementById('passwordForm');
    const linkVolver = document.getElementById('linkVolver');
    const panelApps = document.getElementById('panelApps');
    const listaApps = document.getElementById('listaApps');
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
        subtitulo.textContent = '¡Contraseña actualizada! Elegí a qué app querés entrar:';
        mostrarPanelApps();
    });

    function mostrarLinkVolver(texto, href) {
        const a = linkVolver.querySelector('a');
        a.textContent = texto;
        a.href = href;
        linkVolver.hidden = false;
    }

    function mostrarPanelApps() {
        listaApps.innerHTML = '';

        const slugs = Object.keys(APPS)
            .sort((a, b) => (a === appOrigen ? -1 : b === appOrigen ? 1 : 0));

        slugs.forEach((slug) => {
            const app = APPS[slug];
            const a = document.createElement('a');
            a.href = app.url;
            a.textContent = `Ir a ${app.nombre}`;
            a.className = slug === appOrigen ? 'btn-app btn-app-primario' : 'btn-app';
            listaApps.appendChild(a);
        });

        panelApps.hidden = false;
    }

    function mostrarError(idSpan, texto) {
        const span = document.getElementById(idSpan);
        if (span) span.textContent = texto;
    }

    function limpiarErrores() {
        document.querySelectorAll('.field-error').forEach((el) => (el.textContent = ''));
    }
})();
