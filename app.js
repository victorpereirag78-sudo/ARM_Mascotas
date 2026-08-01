// ================================================================
// APP.JS — Bootstrap del shell autenticado (app.html)
// Depende de: config.js, utils.js, auth.js, modulo-*.js
// ================================================================

const PANELES = [
    { id: 'panel-dashboard', icono: '🏠', etiqueta: 'Dashboard', modulo: () => window.Dashboard },
    { id: 'panel-mascotas', icono: '🐾', etiqueta: 'Mis mascotas', modulo: () => window.Mascota },
    { id: 'panel-perfil', icono: '👤', etiqueta: 'Mi perfil', modulo: () => window.Perfil },
    { id: 'panel-compartir', icono: '🤝', etiqueta: 'Compartir', modulo: () => window.Compartir }
];

(async () => {
    const res = await Auth.restaurarSesion();
    if (!res.ok) {
        window.location.href = 'index.html';
        return;
    }

    Utils.inicializarTema(document.getElementById('btnTema'));
    construirMenu();
    wireHeaderYSidebar();

    document.getElementById('usuarioResumen').textContent =
        `${window.appData.perfil.nombre || ''} ${window.appData.perfil.apellido || ''}`.trim() || window.appData.perfil.correo;

    document.getElementById('btnLogout').addEventListener('click', async () => {
        await Auth.logout();
        window.location.href = 'index.html';
    });

    const panelInicial = PANELES.find((p) => Auth.puedeAcceder(p.id)) || PANELES[0];
    irAPanel(panelInicial.id);

    registrarServiceWorker();
})();

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
        navigator.serviceWorker.register('sw.js').catch(() => {});
    }
}
