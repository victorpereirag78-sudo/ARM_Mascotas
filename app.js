// ================================================================
// APP.JS — Bootstrap del shell autenticado (app.html)
// Depende de: config.js, utils.js, auth.js, modulo-*.js
// ================================================================

// Íconos de línea (24x24, trazo currentColor): heredan el color del ítem
// activo/inactivo y se ven igual en claro y oscuro.
const ICONOS_NAV = {
    "home": "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M3 10.5 12 3l9 7.5\"/><path d=\"M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5\"/></svg>",
    "paw": "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><circle class=\"relleno\" cx=\"5.5\" cy=\"11\" r=\"1.7\"/><circle class=\"relleno\" cx=\"18.5\" cy=\"11\" r=\"1.7\"/><circle class=\"relleno\" cx=\"9.2\" cy=\"6.2\" r=\"1.8\"/><circle class=\"relleno\" cx=\"14.8\" cy=\"6.2\" r=\"1.8\"/><path d=\"M12 11.5c-3.2 0-6 3.1-6 5.6 0 1.8 1.5 2.9 3.1 2.9 1.2 0 1.8-.7 2.9-.7s1.7.7 2.9.7c1.6 0 3.1-1.1 3.1-2.9 0-2.5-2.8-5.6-6-5.6z\"/></svg>",
    "clinica": "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M4 21V8.5L12 3l8 5.5V21\"/><path d=\"M2.5 21h19\"/><path d=\"M12 10.5v5M9.5 13h5\"/></svg>",
    "agenda": "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><rect x=\"3\" y=\"4.5\" width=\"18\" height=\"16.5\" rx=\"2.5\"/><path d=\"M3 9.5h18M8 3v3M16 3v3\"/></svg>",
    "perfil": "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"8\" r=\"4\"/><path d=\"M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7\"/></svg>",
    "compartir": "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><circle cx=\"9\" cy=\"8\" r=\"3.5\"/><path d=\"M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6\"/><path d=\"M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.5c2.2.6 3.5 2.5 3.5 5.5\"/></svg>",
    "pacientes": "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M11 2v2M5 2v2M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1\"/><path d=\"M8 15a6 6 0 0 0 12 0v-3\"/><circle cx=\"20\" cy=\"10\" r=\"2\"/></svg>",
    "admin": "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M12 3 4.5 6v5.5c0 4.6 3.1 8.1 7.5 9.5 4.4-1.4 7.5-4.9 7.5-9.5V6z\"/><path d=\"m9 12 2 2 4-4\"/></svg>"
};

const PANELES = [
    { id: 'panel-dashboard', icono: ICONOS_NAV.home, etiqueta: 'Inicio', modulo: () => window.Dashboard },
    { id: 'panel-mascotas', icono: ICONOS_NAV.paw, etiqueta: 'Mis mascotas', corta: 'Mascotas', modulo: () => window.Mascota },
    { id: 'panel-veterinaria', icono: ICONOS_NAV.clinica, etiqueta: 'Mi veterinaria', corta: 'Veterinaria', modulo: () => window.VetApp },
    { id: 'panel-agenda', icono: ICONOS_NAV.agenda, etiqueta: 'Agenda', modulo: () => window.Agenda },
    { id: 'panel-perfil', icono: ICONOS_NAV.perfil, etiqueta: 'Mi perfil', corta: 'Perfil', modulo: () => window.Perfil },
    { id: 'panel-compartir', icono: ICONOS_NAV.compartir, etiqueta: 'Compartir', modulo: () => window.Compartir },
    { id: 'panel-veterinario', icono: ICONOS_NAV.pacientes, etiqueta: 'Mis pacientes', corta: 'Pacientes', modulo: () => window.Veterinario },
    { id: 'panel-admin', icono: ICONOS_NAV.admin, etiqueta: 'Administración', corta: 'Admin', modulo: () => window.Admin }
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

    // Instalar la app: con el aviso nativo del navegador si existe (Chrome,
    // Edge, Android); si no (iPhone, otros), la guía paso a paso.
    document.getElementById('btnInstalarApp').addEventListener('click', async () => {
        if (window.PWAInstalar && PWAInstalar.puedeInstalarAhora()) await PWAInstalar.instalar();
        else window.location.href = '/instalar.html';
    });

    const destinoVet = parametros.get('vet');
    if (['presupuestos', 'reservar', 'encuestas', 'consentimientos', 'citas', 'privacidad'].includes(destinoVet)) sessionStorage.setItem('arm_vet_seccion', destinoVet);
    if (parametros.get('mascota')) {
        sessionStorage.setItem('arm_abrir_mascota', parametros.get('mascota'));
        sessionStorage.setItem('arm_abrir_mascota_vet', '1');
    }
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
        btnMovil.innerHTML = `<span class="nav-icono">${p.icono}</span><span>${p.corta || p.etiqueta}</span>`;
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
