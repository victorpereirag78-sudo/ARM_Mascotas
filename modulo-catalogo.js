// ================================================================
// MODULO-CATALOGO.JS — Mi veterinaria: productos y pedidos para retirar
// Depende de: utils.js, modulo-veterinaria.js (VetApp)
//
// La clínica elige qué alimentos y accesorios muestra; el dueño los ve,
// arma un pedido y lo retira en la sede (sin pago en línea). Todo pasa
// por las funciones vet_app_* de la base:
//   · vet_app_catalogo(p_clinica)            productos visibles, con
//                                            disponibilidad por sede
//                                            (nunca la cantidad exacta).
//   · vet_app_apartar(p_clinica, p_sucursal, p_items, p_nota)
//   · vet_app_mis_apartados()                pedidos del dueño.
//   · vet_app_cancelar_apartado(p_id, p_motivo)
// Expone window.VetCatalogo.
// ================================================================

const VetCatalogo = (() => {
    const { h, fecha, rpc } = VetApp;

    const CATEGORIAS = { alimento: ['🍖', 'Alimentos'], accesorio: ['🦴', 'Accesorios'], producto: ['🧴', 'Otros'] };
    const ESTADOS = { solicitado: ['Por preparar', 'vet-chip-aviso'], listo: ['Listo para retirar', 'vet-chip-ok'], retirado: ['Retirado', ''], cancelado: ['Cancelado', ''] };
    const DISP = { disponible: ['Disponible', 'vet-chip-ok'], pocas: ['Pocas unidades', 'vet-chip-aviso'], agotado: ['Agotado', ''] };
    const MAX_UNIDADES = 10;

    const pesos = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CL')}`;
    const chip = (txt, clase) => `<span class="vet-chip ${clase || ''}">${h(txt)}</span>`;
    function mensaje(el, txt, error) { if (!el) return; el.textContent = txt || ''; el.className = `field-msg${error ? ' msg-error' : ''}`; }

    async function cargar() {
        return (await rpc('vet_app_mis_apartados').catch(() => [])) || [];
    }

    // ── Sección "Productos y pedidos" ───────────────────────────
    function htmlPedido(p) {
        const e = ESTADOS[p.estado] || [p.estado, ''];
        const vencido = p.estado === 'listo' && p.expira_en && new Date(p.expira_en) < new Date();
        return `
            <li class="vet-pedido ${p.estado === 'cancelado' || p.estado === 'retirado' ? 'cerrado' : ''}" data-pedido="${h(p.id)}">
                <div class="vet-pedido-cab">
                    <div>
                        <p class="vet-pedido-titulo">${h(p.clinica.nombre)}</p>
                        <p class="vet-nota">${fecha(p.creado_en)} · retiras en ${h(p.lugar)}${p.direccion ? ` · ${h(p.direccion)}` : ''}</p>
                    </div>
                    ${chip(vencido ? 'Plazo vencido' : e[0], vencido ? 'vet-chip-aviso' : e[1])}
                </div>
                <ul class="vet-pedido-items">${p.items.map((i) => `<li><span>${i.cantidad} × ${h(i.nombre)}</span><span>${pesos(i.cantidad * i.precio_unitario)}</span></li>`).join('')}
                    <li class="vet-pedido-total"><span>Total estimado</span><span>${pesos(p.total)}</span></li></ul>
                ${p.estado === 'listo' ? `<p class="vet-pedido-aviso">📦 Ya puedes retirarlo${p.expira_en ? ` hasta el <b>${fecha(p.expira_en)}</b>` : ''}.${p.respuesta ? ` ${h(p.respuesta)}` : ''}</p>` : ''}
                ${p.estado === 'cancelado' && p.respuesta ? `<p class="vet-nota">${p.cancelado_por === 'clinica' ? 'La clínica' : 'Tú'} lo canceló: ${h(p.respuesta)}</p>` : ''}
                ${p.estado === 'solicitado' ? '<p class="vet-nota">La clínica lo está revisando. Te avisaremos cuando esté listo.</p>' : ''}
                ${p.puede_cancelar ? '<button class="vet-enlace" data-cancelar-pedido>Cancelar pedido</button>' : ''}
            </li>`;
    }

    function html(pedidos, clinicas) {
        const conCatalogo = clinicas.filter((c) => c.catalogo);
        if (!conCatalogo.length && !pedidos.length) return '';
        return `
            <section class="card vet-seccion" id="vetCatalogo">
                <div class="vet-seccion-cabecera">
                    <h3>🛒 Productos y pedidos</h3>
                    ${conCatalogo.length ? '<button class="btn-primario btn-chico" data-ver-catalogo>Ver productos</button>' : ''}
                </div>
                <div data-contenido>
                    ${pedidos.length ? `<ul class="vet-pedidos">${pedidos.map(htmlPedido).join('')}</ul>`
                        : '<p class="vet-vacio">Mira los alimentos y accesorios de tu veterinaria, aparta lo que necesitas y retíralo en la sede cuando esté listo.</p>'}
                    <p class="field-msg"></p>
                </div>
            </section>`;
    }

    function conectar(raiz, pedidos, clinicas, recargar) {
        const seccion = raiz.querySelector('#vetCatalogo');
        if (!seccion) return;
        seccion.querySelectorAll('[data-cancelar-pedido]').forEach((b) => b.addEventListener('click', async () => {
            const p = pedidos.find((x) => x.id === b.closest('[data-pedido]').dataset.pedido);
            if (!confirm(`¿Cancelar tu pedido en ${p.clinica.nombre}?`)) return;
            b.disabled = true;
            try {
                await rpc('vet_app_cancelar_apartado', { p_id: p.id, p_motivo: null });
                Utils.toast('Pedido cancelado. La clínica ya lo sabe.', 'info');
                await recargar();
            } catch (e) { b.disabled = false; mensaje(seccion.querySelector('.field-msg'), e.message, true); }
        }));
        const btn = seccion.querySelector('[data-ver-catalogo]');
        if (btn) btn.addEventListener('click', () => abrir(seccion, clinicas.filter((c) => c.catalogo), recargar));
    }

    // ── Catálogo y pedido (dentro de la misma sección) ──────────
    async function abrir(seccion, clinicas, recargar) {
        const cont = seccion.querySelector('[data-contenido]');
        const btn = seccion.querySelector('[data-ver-catalogo]');
        if (btn) btn.hidden = true;
        const estado = { clinica: clinicas.length === 1 ? clinicas[0].id : null, cat: null, texto: '', carrito: {}, sede: null, nota: '', datos: null };
        const volver = () => recargar();
        const total = () => estado.datos.productos.reduce((s, p) => s + (estado.carrito[p.id] || 0) * Number(p.precio), 0);
        const unidades = () => Object.values(estado.carrito).reduce((s, n) => s + n, 0);
        const dispEn = (p) => (p.disponibilidad && p.disponibilidad[estado.sede]) || 'agotado';

        function pasoClinica() {
            cont.innerHTML = `
                <p class="vet-texto">¿De qué veterinaria?</p>
                <div class="vet-opciones">${clinicas.map((c) => `<button class="vet-opcion" data-id="${h(c.id)}">🏥 ${h(c.nombre)}</button>`).join('')}</div>
                <div class="vet-presu-acciones"><button class="btn-secundario btn-chico" data-volver>Volver</button></div>`;
            cont.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () => { estado.clinica = b.dataset.id; estado.datos = null; pasoCatalogo(); }));
            cont.querySelector('[data-volver]').addEventListener('click', volver);
        }

        async function pasoCatalogo() {
            if (!estado.datos) {
                cont.innerHTML = '<p class="vet-vacio">Cargando productos...</p>';
                try { estado.datos = await rpc('vet_app_catalogo', { p_clinica: estado.clinica }); estado.carrito = {}; estado.sede = null; }
                catch (e) {
                    cont.innerHTML = `<p class="field-msg msg-error">${h(e.message)}</p><div class="vet-presu-acciones"><button class="btn-secundario btn-chico" data-volver>Volver</button></div>`;
                    cont.querySelector('[data-volver]').addEventListener('click', volver);
                    return;
                }
            }
            const d = estado.datos;
            if (!estado.sede && d.sedes.length) estado.sede = d.sedes[0].id;
            const cats = [...new Set(d.productos.map((p) => p.categoria))];
            cont.innerHTML = `
                <p class="vet-texto"><b>${h(d.clinica.nombre)}</b>${d.mensaje ? `<br><small>${h(d.mensaje)}</small>` : ''}</p>
                ${d.sedes.length > 1 ? `<p class="vet-etiqueta">Retiras en</p><div class="input-wrap"><select data-sede>${d.sedes.map((s) =>
                    `<option value="${h(s.id)}" ${s.id === estado.sede ? 'selected' : ''}>${h(s.nombre)}${s.direccion ? ` · ${h(s.direccion)}` : ''}</option>`).join('')}</select></div>` : ''}
                <div class="input-wrap vet-cat-buscar"><input type="search" data-buscar placeholder="Buscar producto..." value="${h(estado.texto)}" autocomplete="off"></div>
                ${cats.length > 1 ? `<div class="vet-opciones vet-cat-chips">
                    <button class="vet-opcion ${!estado.cat ? 'activo' : ''}" data-cat="">Todo</button>
                    ${cats.map((c) => `<button class="vet-opcion ${estado.cat === c ? 'activo' : ''}" data-cat="${h(c)}">${(CATEGORIAS[c] || ['', c])[0]} ${h((CATEGORIAS[c] || ['', c])[1])}</button>`).join('')}
                </div>` : ''}
                <ul class="vet-productos" data-lista></ul>
                <p class="vet-nota">Precios con IVA incluido. La disponibilidad puede cambiar: la clínica confirma tu pedido.</p>
                <div class="vet-carrito" data-carrito></div>
                <div class="vet-presu-acciones"><button class="btn-secundario btn-chico" data-volver>${clinicas.length > 1 ? 'Atrás' : 'Cerrar'}</button></div>
                <p class="field-msg"></p>`;
            const sel = cont.querySelector('[data-sede]');
            if (sel) sel.addEventListener('change', () => { estado.sede = sel.value; pintarLista(); pintarCarrito(); });
            const inp = cont.querySelector('[data-buscar]');
            inp.addEventListener('input', () => { estado.texto = inp.value; pintarLista(); });
            cont.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => {
                estado.cat = b.dataset.cat || null;
                cont.querySelectorAll('[data-cat]').forEach((x) => x.classList.toggle('activo', x === b));
                pintarLista();
            }));
            cont.querySelector('[data-volver]').addEventListener('click', () => (clinicas.length > 1 ? (estado.datos = null, estado.clinica = null, pasoClinica()) : volver()));
            pintarLista();
            pintarCarrito();
        }

        function pintarLista() {
            const ul = cont.querySelector('[data-lista]');
            if (!ul) return;
            const t = estado.texto.trim().toLowerCase();
            const lista = estado.datos.productos.filter((p) => (!estado.cat || p.categoria === estado.cat)
                && (!t || `${p.nombre} ${p.descripcion || ''}`.toLowerCase().includes(t)));
            if (!lista.length) { ul.innerHTML = '<li class="vet-vacio">No encontramos productos con ese filtro.</li>'; return; }
            ul.innerHTML = lista.map((p) => {
                const disp = dispEn(p);
                const n = estado.carrito[p.id] || 0;
                const dd = DISP[disp] || DISP.agotado;
                return `
                    <li class="vet-producto ${disp === 'agotado' ? 'agotado' : ''}" data-producto="${h(p.id)}">
                        <span class="vet-producto-emoji">${(CATEGORIAS[p.categoria] || ['🛍️'])[0]}</span>
                        <div class="vet-producto-cuerpo">
                            <p class="vet-producto-nombre">${h(p.nombre)}</p>
                            ${p.descripcion ? `<p class="vet-nota">${h(p.descripcion)}</p>` : ''}
                            <p class="vet-producto-precio">${pesos(p.precio)}${p.unidad && p.unidad !== 'unidad' ? ` <small>por ${h(p.unidad)}</small>` : ''} ${chip(dd[0], dd[1])}</p>
                        </div>
                        <div class="vet-producto-lado">
                            ${disp === 'agotado' ? ''
                                : n ? `<div class="vet-cantidad"><button data-menos aria-label="Quitar uno">−</button><span>${n}</span><button data-mas aria-label="Agregar uno" ${n >= MAX_UNIDADES ? 'disabled' : ''}>+</button></div>`
                                    : '<button class="btn-secundario btn-chico" data-agregar>Agregar</button>'}
                        </div>
                    </li>`;
            }).join('');
            const cambiar = (id, delta) => {
                const n = Math.max(0, Math.min(MAX_UNIDADES, (estado.carrito[id] || 0) + delta));
                if (n) estado.carrito[id] = n; else delete estado.carrito[id];
                pintarLista(); pintarCarrito();
            };
            ul.querySelectorAll('[data-agregar]').forEach((b) => b.addEventListener('click', () => cambiar(b.closest('[data-producto]').dataset.producto, 1)));
            ul.querySelectorAll('[data-mas]').forEach((b) => b.addEventListener('click', () => cambiar(b.closest('[data-producto]').dataset.producto, 1)));
            ul.querySelectorAll('[data-menos]').forEach((b) => b.addEventListener('click', () => cambiar(b.closest('[data-producto]').dataset.producto, -1)));
        }

        function pintarCarrito() {
            const barra = cont.querySelector('[data-carrito]');
            if (!barra) return;
            const n = unidades();
            barra.hidden = n === 0;
            barra.innerHTML = n ? `<span><b>${n}</b> ${n === 1 ? 'producto' : 'productos'} · <b>${pesos(total())}</b></span><button class="btn-primario btn-chico" data-revisar>Revisar pedido</button>` : '';
            const b = barra.querySelector('[data-revisar]');
            if (b) b.addEventListener('click', pasoConfirmar);
        }

        function pasoConfirmar() {
            const d = estado.datos;
            const items = d.productos.filter((p) => estado.carrito[p.id]);
            const sede = d.sedes.find((s) => s.id === estado.sede);
            const agotados = items.filter((p) => dispEn(p) === 'agotado');
            cont.innerHTML = `
                <p class="vet-texto">Tu pedido en <b>${h(d.clinica.nombre)}</b></p>
                <ul class="vet-pedido-items">${items.map((p) => `<li><span>${estado.carrito[p.id]} × ${h(p.nombre)}</span><span>${pesos(estado.carrito[p.id] * p.precio)}</span></li>`).join('')}
                    <li class="vet-pedido-total"><span>Total estimado</span><span>${pesos(total())}</span></li></ul>
                <p class="vet-nota">📍 Lo retiras en <b>${h(sede ? sede.nombre : d.clinica.nombre)}</b>${sede && sede.direccion ? ` · ${h(sede.direccion)}` : ''}. Pagas al retirarlo.</p>
                <div class="input-wrap"><textarea data-nota rows="2" maxlength="300" placeholder="Comentario para la clínica (opcional)">${h(estado.nota)}</textarea></div>
                <div class="vet-presu-acciones">
                    <button class="btn-secundario btn-chico" data-atras>Seguir viendo</button>
                    <button class="btn-primario btn-ancho-auto" data-enviar ${agotados.length ? 'disabled' : ''}>Enviar pedido</button>
                </div>
                ${agotados.length ? `<p class="field-msg msg-error">${h(agotados.map((p) => p.nombre).join(', '))} ya no está disponible en esa sede. Quítalo para continuar.</p>` : '<p class="field-msg"></p>'}`;
            const nota = cont.querySelector('[data-nota]');
            nota.addEventListener('input', () => { estado.nota = nota.value; });
            cont.querySelector('[data-atras]').addEventListener('click', pasoCatalogo);
            const enviar = cont.querySelector('[data-enviar]');
            enviar.addEventListener('click', async () => {
                Utils.setLoading(enviar, true, 'Enviando...');
                try {
                    await rpc('vet_app_apartar', {
                        p_clinica: estado.clinica, p_sucursal: estado.sede,
                        p_items: items.map((p) => ({ producto_id: p.id, cantidad: estado.carrito[p.id] })),
                        p_nota: estado.nota.trim() || null
                    });
                    Utils.toast('Pedido enviado. Te avisaremos cuando esté listo para retirar.', 'exito');
                    await recargar();
                } catch (e) { Utils.setLoading(enviar, false); mensaje(cont.querySelector('.field-msg'), e.message, true); }
            });
        }

        if (estado.clinica) pasoCatalogo(); else pasoClinica();
    }

    return { cargar, html, conectar, abrir };
})();

window.VetCatalogo = VetCatalogo;
