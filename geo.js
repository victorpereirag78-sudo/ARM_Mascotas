// ================================================================
// GEO.JS — País y división territorial (catálogo compartido con ARM Veterinaria)
// Depende de: config.js (cliente `db`)
// Lee los catálogos públicos vet_catalogo_paises y vet_catalogo_divisiones.
// Región y ciudad siguen siendo texto libre: el catálogo solo sugiere, nunca
// obliga (si la localidad no está o el país aún no tiene datos, se escribe a mano).
// Expone window.Geo.
// ================================================================

const Geo = (() => {
    let cachePaises = null;

    function esc(v) {
        return (v == null ? '' : String(v)).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    async function paises() {
        if (cachePaises) return cachePaises;
        try {
            const { data, error } = await db.rpc('vet_catalogo_paises', { p_todos: true });
            if (error) throw error;
            cachePaises = Array.isArray(data) ? data : [];
        } catch (e) {
            cachePaises = [];
        }
        return cachePaises;
    }

    async function divisiones(codigo, texto) {
        if (!codigo) return [];
        try {
            const { data, error } = await db.rpc('vet_catalogo_divisiones', {
                p_pais: codigo, p_parent: null, p_texto: texto || null, p_limite: texto ? 12 : 400
            });
            if (error) throw error;
            return Array.isArray(data) ? data : [];
        } catch (e) {
            return [];
        }
    }

    const norm = (s) => (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

    /**
     * Conecta un select de país con los campos de región y ciudad.
     * opciones: { selPais, inpRegion, inpCiudad, valorPais, etqRegion?, etqCiudad? }
     */
    async function enlazar(opciones) {
        const { selPais, inpRegion, inpCiudad, etqRegion, etqCiudad } = opciones;
        if (!selPais || !inpRegion || !inpCiudad) return;
        const lista = await paises();
        if (!lista.length) return; // sin catálogo: quedan los campos tal como estaban

        // valorPais '' = sin país elegido (no se asume ninguno); undefined = el que traiga el select o Chile.
        const actual = opciones.valorPais !== undefined ? opciones.valorPais : (selPais.value || 'Chile');
        const opts = lista.map((p) => `<option value="${esc(p.nombre)}" data-codigo="${esc(p.codigo)}">${esc(p.nombre)}</option>`);
        // Un país escrito antes a mano y que no está en el catálogo se conserva tal cual.
        const conocido = lista.find((p) => norm(p.nombre) === norm(actual));
        if (!conocido && actual) opts.unshift(`<option value="${esc(actual)}" data-codigo="">${esc(actual)}</option>`);
        if (!actual) opts.unshift('<option value="" data-codigo="">Selecciona tu país</option>');
        selPais.innerHTML = opts.join('');
        selPais.value = conocido ? conocido.nombre : actual;

        const idBase = selPais.id || 'geo';
        const dlRegion = document.createElement('datalist'); dlRegion.id = `${idBase}-dl-region`;
        const dlCiudad = document.createElement('datalist'); dlCiudad.id = `${idBase}-dl-ciudad`;
        selPais.parentNode.appendChild(dlRegion);
        selPais.parentNode.appendChild(dlCiudad);
        inpRegion.setAttribute('list', dlRegion.id);
        inpCiudad.setAttribute('list', dlCiudad.id);
        inpRegion.setAttribute('autocomplete', 'off');
        inpCiudad.setAttribute('autocomplete', 'off');

        const paisActual = () => lista.find((p) => p.nombre === selPais.value) || null;
        let sugeridas = [];

        async function alCambiarPais() {
            const p = paisActual();
            const niveles = (p && p.config && p.config.niveles) || [];
            if (etqRegion && niveles[0]) etqRegion.textContent = niveles[0].etiqueta;
            if (etqCiudad && niveles.length) etqCiudad.textContent = niveles[niveles.length - 1].etiqueta;
            const regiones = p ? await divisiones(p.codigo, null) : [];
            dlRegion.innerHTML = regiones.filter((r) => r.nivel === 1).map((r) => `<option value="${esc(r.nombre)}">`).join('');
            dlCiudad.innerHTML = '';
        }
        selPais.addEventListener('change', alCambiarPais);
        await alCambiarPais();

        // Sugerencias de localidad a medida que se escribe (desde 3 letras).
        let espera = null;
        inpCiudad.addEventListener('input', () => {
            clearTimeout(espera);
            const q = inpCiudad.value.trim();
            const p = paisActual();
            if (q.length < 3 || !p) { dlCiudad.innerHTML = ''; return; }
            espera = setTimeout(async () => {
                sugeridas = await divisiones(p.codigo, q);
                dlCiudad.innerHTML = sugeridas.map((r) => `<option value="${esc(r.nombre)}" label="${esc(r.ruta || '')}">`).join('');
            }, 300);
        });
        // Al elegir una sugerencia se completa la región si está vacía (es el último elemento de su ruta).
        inpCiudad.addEventListener('change', () => {
            const hallada = sugeridas.find((r) => norm(r.nombre) === norm(inpCiudad.value));
            if (hallada && hallada.ruta && !inpRegion.value.trim()) {
                const partes = hallada.ruta.split(', ');
                inpRegion.value = partes[partes.length - 1];
            }
        });
    }

    return { paises, divisiones, enlazar };
})();

window.Geo = Geo;
