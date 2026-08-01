// ================================================================
// UTILS.JS — Helpers puros y utilidades de UI compartidas
// Depende de: config.js (db, BUCKET_*)
// Expone window.Utils
// ================================================================

const Utils = (() => {

    // ── Fechas (parseo seguro, evita el desfase por UTC) ─────────
    // Mismo patrón que ARMUniversal: nunca usar `new Date('YYYY-MM-DD')`
    // directo, porque el motor lo interpreta en UTC y puede correr el
    // día en zonas horarias negativas respecto a UTC.
    function partesFecha(fechaISO) {
        if (!fechaISO) return null;
        const [a, m, d] = fechaISO.split('-').map(Number);
        if (!a || !m || !d) return null;
        return { anio: a, mes: m, dia: d };
    }

    function hoyISO() {
        const h = new Date();
        return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`;
    }

    function formatearFecha(fechaISO) {
        const p = partesFecha(fechaISO);
        if (!p) return '—';
        return `${String(p.dia).padStart(2, '0')}-${String(p.mes).padStart(2, '0')}-${p.anio}`;
    }

    // ── Edad de mascota + edad humana equivalente ────────────────
    // Fórmula veterinaria no lineal para perro/gato:
    // año 1 ≈ 15 años humanos, año 2 suma ≈9 (total 24), cada año
    // siguiente suma ≈4. 'otro' no tiene equivalencia (retorna null).
    function calcularEdadMascota(fechaNacimientoISO, especie) {
        const p = partesFecha(fechaNacimientoISO);
        if (!p) return { anios: null, meses: null, edadHumanaEquivalente: null };

        const hoy = new Date();
        const nacimiento = new Date(p.anio, p.mes - 1, p.dia);

        let anios = hoy.getFullYear() - p.anio;
        let meses = hoy.getMonth() - (p.mes - 1);
        if (hoy.getDate() < p.dia) meses--;
        if (meses < 0) { anios--; meses += 12; }
        if (anios < 0) anios = 0;

        let edadHumanaEquivalente = null;
        if (ESPECIES_CON_EDAD_HUMANA.includes(especie)) {
            if (anios <= 0) {
                const diasVividos = Math.max(0, Math.floor((hoy - nacimiento) / 86400000));
                edadHumanaEquivalente = Math.round((diasVividos / 365.25) * 15);
            } else if (anios === 1) {
                edadHumanaEquivalente = 15;
            } else if (anios === 2) {
                edadHumanaEquivalente = 24;
            } else {
                edadHumanaEquivalente = 24 + (anios - 2) * 4;
            }
        }

        return { anios, meses, edadHumanaEquivalente };
    }

    function textoEdad({ anios, meses }) {
        if (anios === null) return 'Edad desconocida';
        if (anios === 0) return meses === 1 ? '1 mes' : `${meses} meses`;
        const partAnios = anios === 1 ? '1 año' : `${anios} años`;
        if (!meses) return partAnios;
        const partMeses = meses === 1 ? '1 mes' : `${meses} meses`;
        return `${partAnios}, ${partMeses}`;
    }

    function diasParaCumpleanos(fechaNacimientoISO) {
        const p = partesFecha(fechaNacimientoISO);
        if (!p) return null;
        const hoy = new Date();
        let proximo = new Date(hoy.getFullYear(), p.mes - 1, p.dia);
        proximo.setHours(0, 0, 0, 0);
        const hoySinHora = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
        if (proximo < hoySinHora) proximo = new Date(hoy.getFullYear() + 1, p.mes - 1, p.dia);
        return Math.round((proximo - hoySinHora) / 86400000);
    }

    // ── Validación ────────────────────────────────────────────────
    function esEmailValido(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
    }

    // ── UI: toasts ────────────────────────────────────────────────
    let contenedorToast = null;
    function mostrarToast(mensaje, tipo = 'info') {
        if (!contenedorToast) {
            contenedorToast = document.createElement('div');
            contenedorToast.className = 'toast-contenedor';
            document.body.appendChild(contenedorToast);
        }
        const el = document.createElement('div');
        el.className = `toast toast-${tipo}`;
        el.textContent = mensaje;
        contenedorToast.appendChild(el);
        requestAnimationFrame(() => el.classList.add('toast-visible'));
        setTimeout(() => {
            el.classList.remove('toast-visible');
            setTimeout(() => el.remove(), 300);
        }, 3500);
    }

    // ── UI: estado de carga en botones ───────────────────────────
    function setLoadingBtn(btn, cargando, textoCarga = 'Guardando...') {
        if (!btn) return;
        if (cargando) {
            btn.dataset.textoOriginal = btn.dataset.textoOriginal || btn.textContent;
            btn.textContent = textoCarga;
            btn.disabled = true;
            btn.classList.add('btn-cargando');
        } else {
            btn.textContent = btn.dataset.textoOriginal || btn.textContent;
            btn.disabled = false;
            btn.classList.remove('btn-cargando');
        }
    }

    // ── Storage: subir archivo a un bucket ───────────────────────
    // Retorna { ok, url, error }. `carpeta` es el primer segmento del
    // path (id de perfil o de mascota) que exigen las políticas RLS
    // de storage.objects.
    async function subirArchivo(bucket, carpeta, file) {
        try {
            const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
            const nombreArchivo = `${Date.now()}.${ext}`;
            const ruta = `${carpeta}/${nombreArchivo}`;

            const { error: errorSubida } = await db.storage.from(bucket).upload(ruta, file, {
                cacheControl: '3600',
                upsert: false
            });
            if (errorSubida) return { ok: false, error: errorSubida.message };

            const { data } = db.storage.from(bucket).getPublicUrl(ruta);
            return { ok: true, url: data.publicUrl, ruta };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    }

    // ── Tema claro/oscuro (persistido en localStorage) ───────────
    const CLAVE_TEMA = 'arm_mascotas_tema';

    function temaActual() {
        return document.documentElement.getAttribute('data-theme')
            || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    }

    function inicializarTema(btnTema) {
        const guardado = localStorage.getItem(CLAVE_TEMA);
        if (guardado) document.documentElement.setAttribute('data-theme', guardado);
        if (btnTema) {
            actualizarIconoTema(btnTema);
            btnTema.addEventListener('click', () => {
                const nuevo = temaActual() === 'dark' ? 'light' : 'dark';
                document.documentElement.setAttribute('data-theme', nuevo);
                localStorage.setItem(CLAVE_TEMA, nuevo);
                actualizarIconoTema(btnTema);
            });
        }
    }

    function actualizarIconoTema(btnTema) {
        btnTema.textContent = temaActual() === 'dark' ? '☀️' : '🌙';
    }

    return {
        hoy: hoyISO,
        formatearFecha,
        calcularEdadMascota,
        textoEdad,
        diasParaCumpleanos,
        esEmailValido,
        toast: mostrarToast,
        setLoading: setLoadingBtn,
        subirArchivo,
        inicializarTema
    };
})();
