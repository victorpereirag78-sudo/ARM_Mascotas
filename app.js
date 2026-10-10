// ================================================================
// APP.JS — Bootstrap del shell autenticado (app.html)
// Depende de: config.js, utils.js, auth.js, modulo-*.js
// ================================================================

const PANELES = [
    { id: 'panel-dashboard', icono: '🏠', etiqueta: 'Dashboard', modulo: () => window.Dashboard },
    { id: 'panel-mascotas', icono: '🐾', etiqueta: 'Mis mascotas', modulo: () => window.Mascota },
    { id: 'panel-veterinaria', icono: '🏥', etiqueta: 'Mi veterinaria', modulo: () => window.VetApp },
    { id: 'panel-agenda', icono: '🗓️', etiqueta: 'Agenda', modulo: () => window.Agenda },
    { id: 'panel-perfil', icono: '👤', etiqueta: 'Mi perfil', modulo: () => window.Perfil },
    { id: 'panel-compartir', icono: '🤝', etiqueta: 'Compartir', modulo: () => window.Compartir },
    { id: 'panel-veterinario', icono: '🩺', etiqueta: 'Mis pacientes', modulo: () => window.Veterinario },
    { id: 'panel-admin', icono: '🛡️', etiqueta: 'Administración', modulo: () => window.Admin }
];

const MENSAJES_CUENTA_BLOQUEADA = {
    pendiente: {
        icono: '⏳',
        titulo: 'Tu cuenta está en revisión',
        mensaje: 'Un administrador debe aprobar tu registro antes de que puedas usar ARM Mascotas. Te avisaremos por correo apenas esté lista.'
    },
    rechazado: {
        icono: '🚫',
        titulo: 'Solicitud de acceso rechazada',
        mensaje: 'Tu registro no fue aprobado. Si crees que es un error, contacta al administrador que te compartió el acceso.'
    },
    suspendido: {
        icono: '⛔',
        titulo: 'Cuenta suspendida',
        mensaje: 'Tu acceso a ARM Mascotas fue suspendido. Contacta al administrador que te compartió el acceso para más información.'
    }
};

(async () => {
    const res = await Auth.restaurarSesion();
    if (!res.ok) {
        window.location.href = '/index.html';
        return;
    }

    // Enlaces de ARM Veterinaria: ?vet=vincular&codigo=… (invitación de la
    // clínica), ?vet=notificaciones&mascota=… (al tocar un push) y
    // ?vet=presupuestos (push de un presupuesto por responder) y ?vet=reservar,
    // encuestas, consentimientos, citas o privacidad (secciones de Mi veterinaria).
    const parametros = new URLSearchParams(window.location.search);
    if (parametros.get('codigo')) VetApp.guardarCodigo(parametros.get('codigo'));

    if (window.appData.perfil.estado_cuenta !== 'aprobado') {
        mostrarCuentaBloqueada(window.appData.perfil.estado_cuenta);
        return;
    }

    Utils.inicializarTema(document.getElementById('btnTema'));
    construirMenu();
    wireHeaderYSidebar();

    document.getElementById('usuarioResumen').textContent =
        `${window.appData.perfil.nombre || ''} ${window.appData.perfil.apellido || ''}`.trim() || window.appData.perfil.correo;

    document.getElementById('btnLogout').addEventListener('click', async () => {
        await Auth.logout();
        window.location.href = '/index.html';
    });

    const destinoVet = parametros.get('vet');
    if (['presupuestos', 'reservar', 'encuestas', 'consentimientos', 'citas', 'privacidad'].includes(destinoVet)) sessionStorage.setItem('arm_vet_seccion', destinoVet);
    if (parametros.get('mascota')) sessionStorage.setItem('arm_abrir_mascota', parametros.get('mascota'));
    if (parametros.toString()) history.replaceState(null, '', '/app.html');
    const quiereVet = (destinoVet && destinoVet !== 'inicio') || VetApp.leerCodigo();
    const panelInicial = (quiereVet && Auth.puedeAcceder('panel-veterinaria'))
        ? PANELES.find((p) => p.id === (parametros.get('mascota') ? 'panel-mascotas' : 'panel-veterinaria'))
        : (PANELES.find((p) => Auth.puedeAcceder(p.id)) || PANELES[0]);
    irAPanel(panelInicial.id);
    if (Auth.puedeAcceder('panel-veterinaria')) {
        VetApp.actualizarInsignia();
        VetApp.escucharEnVivo();
    }

    registrarServiceWorker();
})();

function mostrarCuentaBloqueada(estado) {
    document.getElementById('appShell').hidden = true;

    const info = MENSAJES_CUENTA_BLOQUEADA[estado] || MENSAJES_CUENTA_BLOQUEADA.pendiente;
    document.getElementById('cbIcono').textContent = info.icono;
    document.getElementById('cbTitulo').textContent = info.titulo;
    document.getElementById('cbMensaje').textContent = info.mensaje;

    const overlay = document.getElementById('cuentaBloqueada');
    overlay.hidden = false;

    // Cuenta en revisión: si su veterinaria la invitó, el código la activa.
    if (estado === 'pendiente') VetApp.ofrecerEnCuentaPendiente(overlay.querySelector('.cuenta-bloqueada-card'));

    document.getElementById('btnLogoutBloqueado').addEventListener('click', async () => {
        await Auth.logout();
        window.location.href = '/index.html';
    });
}

function panelesVisibles() {
    return PANELES.filter((p) => Auth.puedeAcceder(p.id));
}

function construirMenu() {
    const nav = document.getElementById('navPrincipal');
    const bottomNav = document.getElementById('bottomNav');
    nav.innerHTML = '';
    bottomNav.innerHTML = '';

    panelesVisibles().forEach((p) => {
        const btn = document.createElement('button');
        btn.className = 'nav-item';
        btn.dataset.panel = p.id;
        btn.innerHTML = `<span class="nav-icono">${p.icono}</span><span>${p.etiqueta}</span>`;
        btn.addEventListener('click', () => irAPanel(p.id));
        nav.appendChild(btn);

        const btnMovil = document.createElement('button');
        btnMovil.className = 'bottom-nav-item';
        btnMovil.dataset.panel = p.id;
        btnMovil.innerHTML = `<span class="nav-icono">${p.icono}</span><span>${p.etiqueta}</span>`;
        btnMovil.addEventListener('click', () => irAPanel(p.id));
        bottomNav.appendChild(btnMovil);
    });
}

async function irAPanel(idPanel) {
    document.querySelectorAll('.panel').forEach((el) => (el.hidden = true));
    document.querySelectorAll('.nav-item, .bottom-nav-item').forEach((el) => {
        el.classList.toggle('activo', el.dataset.panel === idPanel);
    });

    const panelEl = document.getElementById(idPanel);
    if (!panelEl) return;
    panelEl.hidden = false;
    document.getElementById('tituloPanel').textContent = panelEl.dataset.titulo || '';

    cerrarSidebarMovil();

    const config = PANELES.find((p) => p.id === idPanel);
    const modulo = config && config.modulo();
    if (modulo && typeof modulo.init === 'function') {
        await modulo.init(panelEl);
    }
}

function wireHeaderYSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');

    document.getElementById('btnHamburguesa').addEventListener('click', () => {
        sidebar.classList.add('abierto');
        overlay.classList.add('visible');
    });
    overlay.addEventListener('click', cerrarSidebarMovil);
}

function cerrarSidebarMovil() {
    document.getElementById('sidebar').classList.remove('abierto');
    document.getElementById('sidebarOverlay').classList.remove('visible');
}

function registrarServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
}
