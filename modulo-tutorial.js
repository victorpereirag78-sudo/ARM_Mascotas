// ================================================================
// MODULO-TUTORIAL.JS — Recorrido de bienvenida (primer ingreso)
// Depende de: config.js, utils.js, auth.js, app.js (irAPanel)
// Expone window.Tutorial: { iniciarSiCorresponde(), iniciar() }
//
// Resalta cada parte de la app con una tarjeta explicativa. En el
// celular apunta al menú inferior y en el computador al lateral.
// Se marca como visto por usuario (localStorage) y se puede repetir
// desde Mi perfil → Ayuda.
// ================================================================

const Tutorial = (() => {

    const VERSION = 'v1';
    let pasos = [];
    let indice = 0;
    let capa = null;

    const clave = () => `arm_tutorial_${VERSION}_${(window.appData.usuario && window.appData.usuario.id) || ''}`;

    function yaVisto() {
        try { return localStorage.getItem(clave()) === '1'; } catch (_e) { return true; }
    }
    function marcarVisto() {
        try { localStorage.setItem(clave(), '1'); } catch (_e) { /* sin almacenamiento: se vuelve a ofrecer */ }
    }

    // Elemento visible en pantalla (el menú lateral oculto en el celular no cuenta).
    function visible(el) {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth ? el : null;
    }
    function menu(panel) {
        return () => visible(document.querySelector(`.bottom-nav-item[data-panel="${panel}"]`))
            || visible(document.querySelector(`.nav-item[data-panel="${panel}"]`));
    }
    const elemento = (selector) => () => visible(document.querySelector(selector));

    function armarPasos() {
        const conVet = Auth.puedeAcceder('panel-veterinaria');
        const sinMascotas = !(window.appData.mascotas || []).length;
        return [
            { titulo: '¡Te damos la bienvenida! 🐾', texto: 'ARM Mascotas guarda la historia de vida de tus mascotas y te conecta con tu veterinaria. Te mostramos todo en menos de un minuto.' },
            { objetivo: menu('panel-dashboard'), titulo: 'Inicio', texto: 'Tu resumen del día: próximas vacunas, horas y recordatorios, y los avisos de tu veterinaria.' },
            { objetivo: elemento('#dashAccesos'), titulo: 'Accesos directos', texto: 'En un toque: reserva una hora, revisa resultados, recetas, la historia clínica y la tarjeta de vacunas.' },
            { objetivo: menu('panel-mascotas'), titulo: 'Mis mascotas', texto: 'Agrega a cada mascota y abre su ficha: salud, ficha SOS con código QR para el collar, pasaporte y más.' },
            conVet && { objetivo: menu('panel-veterinaria'), titulo: 'Mi veterinaria', texto: 'Conéctate con el código que te entrega tu clínica: verás su carpeta médica, reservarás horas y confirmarás tu asistencia.' },
            { objetivo: menu('panel-agenda'), titulo: 'Agenda', texto: 'Tus recordatorios y las fechas de la clínica en un solo lugar, ordenados por lo más urgente.' },
            { objetivo: elemento('#btnEmergencia'), titulo: 'Emergencia', texto: 'Si tu mascota tiene una urgencia, encuentra veterinarias cercanas en segundos.' },
            { objetivo: menu('panel-compartir'), titulo: 'Compartir', texto: 'Invita a tu familia o a quien cuida a tu mascota para que vea su ficha desde su propia cuenta.' },
            { objetivo: menu('panel-perfil'), titulo: 'Mi perfil y ayuda', texto: 'Tus datos, las preguntas frecuentes, la política de privacidad y este tutorial cuando quieras repetirlo.' },
            { titulo: sinMascotas ? 'Empecemos 🎉' : '¡Listo! 🎉', texto: sinMascotas ? 'Agrega tu primera mascota para comenzar su historia.' : 'Ya conoces la app. Cualquier duda, la encuentras en Mi perfil → Ayuda.',
              accion: sinMascotas ? { texto: 'Agregar mi primera mascota', fn: () => { sessionStorage.setItem('arm_nueva_mascota', '1'); irAPanel('panel-mascotas'); } } : null }
        ].filter(Boolean);
    }

    function iniciarSiCorresponde() {
        if (yaVisto()) return;
        // Espera a que el inicio termine de dibujarse (tarjetas y accesos).
        setTimeout(() => {
            const inicio = document.getElementById('panel-dashboard');
            if (inicio && !inicio.hidden) iniciar();
        }, 900);
    }

    function iniciar() {
        cerrar(false);
        pasos = armarPasos();
        indice = 0;
        capa = document.createElement('div');
        capa.className = 'tuto';
        capa.innerHTML = `
            <div class="tuto-bloqueo"></div>
            <div class="tuto-foco" hidden></div>
            <div class="tuto-card" role="dialog" aria-modal="true" aria-labelledby="tutoTitulo">
                <button class="tuto-cerrar" type="button" aria-label="Cerrar el tutorial">✕</button>
                <h3 id="tutoTitulo"></h3>
                <p class="tuto-texto"></p>
                <div class="tuto-puntos" aria-hidden="true"></div>
                <div class="tuto-acciones">
                    <span class="tuto-contador"></span>
                    <button class="btn-secundario btn-chico tuto-anterior" type="button">← Anterior</button>
                    <button class="btn-primario btn-chico tuto-siguiente" type="button">Siguiente →</button>
                </div>
                <button class="tuto-saltar" type="button">Saltar tutorial</button>
            </div>`;
        document.body.appendChild(capa);
        capa.querySelector('.tuto-cerrar').addEventListener('click', () => cerrar(true));
        capa.querySelector('.tuto-saltar').addEventListener('click', () => cerrar(true));
        capa.querySelector('.tuto-anterior').addEventListener('click', () => mostrar(indice - 1));
        capa.querySelector('.tuto-siguiente').addEventListener('click', siguiente);
        document.addEventListener('keydown', teclas);
        window.addEventListener('resize', reubicar);
        window.addEventListener('scroll', reubicar, { passive: true });
        mostrar(0);
    }

    function siguiente() {
        const paso = pasos[indice];
        if (indice < pasos.length - 1) return mostrar(indice + 1);
        cerrar(true);
        if (paso.accion) paso.accion.fn();
    }

    function teclas(e) {
        if (!capa) return;
        if (e.key === 'Escape') cerrar(true);
        else if (e.key === 'ArrowRight') siguiente();
        else if (e.key === 'ArrowLeft' && indice > 0) mostrar(indice - 1);
    }

    function mostrar(i) {
        indice = Math.max(0, Math.min(i, pasos.length - 1));
        const paso = pasos[indice];
        const ultimo = indice === pasos.length - 1;
        capa.querySelector('#tutoTitulo').textContent = paso.titulo;
        capa.querySelector('.tuto-texto').textContent = paso.texto;
        capa.querySelector('.tuto-contador').textContent = `${indice + 1} de ${pasos.length}`;
        capa.querySelector('.tuto-puntos').innerHTML = pasos.map((_p, k) => `<span class="${k === indice ? 'activo' : ''}"></span>`).join('');
        capa.querySelector('.tuto-anterior').hidden = indice === 0;
        capa.querySelector('.tuto-siguiente').textContent = ultimo ? (paso.accion ? paso.accion.texto : 'Terminar') : indice === 0 ? 'Comenzar →' : 'Siguiente →';
        capa.querySelector('.tuto-saltar').hidden = ultimo;
        const objetivo = paso.objetivo && paso.objetivo();
        if (objetivo && objetivo.closest('.app-contenido')) objetivo.scrollIntoView({ block: 'center' });
        setTimeout(reubicar, objetivo ? 260 : 0);
        capa.querySelector('.tuto-siguiente').focus({ preventScroll: true });
    }

    // Ubica el foco sobre el elemento y la tarjeta abajo o arriba de él.
    function reubicar() {
        if (!capa) return;
        const paso = pasos[indice];
        const objetivo = paso.objetivo && paso.objetivo();
        const foco = capa.querySelector('.tuto-foco');
        const card = capa.querySelector('.tuto-card');
        const margen = 12;
        if (!objetivo) {
            foco.hidden = true;
            capa.classList.add('tuto-centrado');
            card.style.left = card.style.top = '';
            return;
        }
        capa.classList.remove('tuto-centrado');
        const r = objetivo.getBoundingClientRect();
        const pad = 6;
        foco.hidden = false;
        Object.assign(foco.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
        const cw = card.offsetWidth;
        const ch = card.offsetHeight;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let top = r.bottom + pad + margen;
        if (top + ch > vh - margen) top = r.top - pad - margen - ch;
        if (top < margen) top = Math.max(margen, Math.min(vh - ch - margen, r.top));
        // En el menú lateral, la tarjeta va a la derecha del ítem.
        let left = r.left + r.width / 2 - cw / 2;
        if (objetivo.classList.contains('nav-item')) { left = r.right + margen + pad; top = Math.max(margen, Math.min(vh - ch - margen, r.top - 20)); }
        left = Math.max(margen, Math.min(vw - cw - margen, left));
        card.style.left = `${left}px`;
        card.style.top = `${top}px`;
    }

    function cerrar(marcar) {
        if (marcar) marcarVisto();
        document.removeEventListener('keydown', teclas);
        window.removeEventListener('resize', reubicar);
        window.removeEventListener('scroll', reubicar);
        if (capa) capa.remove();
        capa = null;
    }

    return { iniciarSiCorresponde, iniciar };
})();

window.Tutorial = Tutorial;
