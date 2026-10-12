// ================================================================
// MODULO-PERFIL.JS — CRUD del perfil del dueño (panel-perfil)
// Depende de: config.js, utils.js, auth.js
// Expone window.Perfil
// ================================================================

const Perfil = (() => {

    function init(el) {
        const p = window.appData.perfil || {};
        el.innerHTML = plantilla(p);

        document.getElementById('inputFotoPerfil').addEventListener('change', subirFoto);
        document.getElementById('formPerfil').addEventListener('submit', guardar);
        const btnTutorial = document.getElementById('btnVerTutorial');
        if (btnTutorial) btnTutorial.addEventListener('click', async () => {
            await irAPanel('panel-dashboard');
            window.scrollTo({ top: 0 });
            setTimeout(() => window.Tutorial && Tutorial.iniciar(), 500);
        });
    }

    function plantilla(p) {
        const iniciales = ((p.nombre || '?')[0] || '?').toUpperCase();
        return `
            <div class="perfil-layout">
                <aside class="card perfil-tarjeta">
                    <div class="perfil-avatar" id="avatarPreview">
                        ${p.foto_url ? `<img src="${p.foto_url}" alt="Foto de perfil">` : iniciales}
                    </div>
                    <h2 class="perfil-nombre">${esc([p.nombre, p.apellido].filter(Boolean).join(' ')) || 'Mi perfil'}</h2>
                    <p class="perfil-correo">${esc(p.correo)}</p>
                    <label class="btn-secundario btn-subir-foto">
                        📷 Cambiar foto
                        <input type="file" id="inputFotoPerfil" accept="image/*" hidden>
                    </label>
                    <p class="perfil-ayuda">Tus datos de contacto aparecen en la ficha SOS y el pasaporte de tus mascotas, según lo que autorices en cada una.</p>
                </aside>

                <form id="formPerfil" class="card perfil-form" novalidate>
                    <div class="perfil-secciones">
                    <div class="perfil-bloque">
                    <h3 class="seccion-titulo">Datos personales</h3>
                    <div class="grid-2">
                        <div class="field-group">
                            <label>Nombre *</label>
                            <div class="input-wrap"><input type="text" id="pNombre" value="${esc(p.nombre)}" required></div>
                        </div>
                        <div class="field-group">
                            <label>Apellido *</label>
                            <div class="input-wrap"><input type="text" id="pApellido" value="${esc(p.apellido)}" required></div>
                        </div>
                        <div class="field-group">
                            <label>Correo</label>
                            <div class="input-wrap"><input type="email" id="pCorreo" value="${esc(p.correo)}" disabled></div>
                        </div>
                        <div class="field-group">
                            <label>Teléfono</label>
                            <div class="input-wrap"><input type="tel" id="pTelefono" value="${esc(p.telefono)}"></div>
                        </div>
                        <div class="field-group">
                            <label>WhatsApp</label>
                            <div class="input-wrap"><input type="tel" id="pWhatsapp" value="${esc(p.whatsapp)}"></div>
                        </div>
                    </div>

                    </div>
                    <div class="perfil-bloque">
                    <h3 class="seccion-titulo">Ubicación</h3>
                    <div class="grid-2">
                        <div class="field-group field-ancho-completo">
                            <label>Dirección</label>
                            <div class="input-wrap"><input type="text" id="pDireccion" value="${esc(p.direccion)}"></div>
                        </div>
                        <div class="field-group">
                            <label>Ciudad</label>
                            <div class="input-wrap"><input type="text" id="pCiudad" value="${esc(p.ciudad)}"></div>
                        </div>
                        <div class="field-group">
                            <label>Región</label>
                            <div class="input-wrap"><input type="text" id="pRegion" value="${esc(p.region)}"></div>
                        </div>
                        <div class="field-group">
                            <label>País</label>
                            <div class="input-wrap"><input type="text" id="pPais" value="${esc(p.pais)}"></div>
                        </div>
                    </div>

                    </div>
                    <div class="perfil-bloque">
                    <h3 class="seccion-titulo">Contacto de emergencia</h3>
                    <div class="grid-2">
                        <div class="field-group">
                            <label>Nombre</label>
                            <div class="input-wrap"><input type="text" id="pContactoNombre" value="${esc(p.contacto_emergencia_nombre)}"></div>
                        </div>
                        <div class="field-group">
                            <label>Teléfono</label>
                            <div class="input-wrap"><input type="tel" id="pContactoTelefono" value="${esc(p.contacto_emergencia_telefono)}"></div>
                        </div>
                    </div>

                    </div>
                    </div>
                    <div class="field-msg" id="perfilMensaje"></div>
                    <button type="submit" class="btn-primario btn-ancho-auto" id="btnGuardarPerfil">Guardar cambios</button>
                </form>

                ${plantillaAyuda()}
            </div>
        `;
    }

    // ── Ayuda: preguntas frecuentes, tutorial y documentos legales ──
    const PREGUNTAS = [
        ['¿Cómo conecto mi veterinaria?', 'Si tu veterinaria usa ARM Veterinaria, te entregará un código de 8 caracteres o un enlace. Entra a <b>Mi veterinaria</b>, ingresa el código y elige a qué mascota corresponde cada paciente. Desde ese momento verás su carpeta médica.'],
        ['Mi veterinaria no usa ARM Veterinaria, ¿me sirve la app?', 'Sí. Puedes llevar tú la historia de vida completa: vacunas, consultas, medicamentos, alimentación, gastos y diario, además de la agenda, la ficha SOS con código QR y el pasaporte.'],
        ['¿Cómo reservo o confirmo una hora?', 'En <b>Mi veterinaria → Mis horas</b> toca <b>Reservar hora</b> (si tu clínica tiene reservas en línea). Cuando la clínica te agenda una hora, aparece el botón <b>Confirmar asistencia</b>. También puedes cancelar con la anticipación que pida la clínica.'],
        ['¿Qué información ve mi veterinaria?', 'La clínica conectada ve tus datos de cliente y la ficha clínica que ella misma registra. Lo que anotas tú en <b>Salud</b> solo lo ven las personas y los veterinarios que autorices desde la ficha de cada mascota.'],
        ['¿Para qué sirve el código QR?', 'Para la placa del collar. Quien encuentre a tu mascota lo escanea con la cámara y ve una ficha de emergencia con solo lo que tú autorices: alergias, medicamentos, tu teléfono o un contacto. Se configura en la ficha → <b>SOS y QR</b>.'],
        ['Mi mascota se perdió, ¿qué hago?', 'Abre su ficha → <b>SOS y QR</b> → <b>Marcar como perdida</b> y registra dónde la viste por última vez. Su ficha pública mostrará el aviso para que quien la encuentre te contacte. Cuando aparezca, márcala como encontrada.'],
        ['¿Cómo comparto a mi mascota con mi familia?', 'En <b>Compartir</b> escribe el correo de la persona y elige si solo puede ver o también editar. Ella acepta la invitación desde su propia cuenta de ARM Mascotas.'],
        ['¿Cómo instalo la app en mi teléfono?', 'Toca <b>Instalar app</b> en el menú o abre <a href="/instalar.html">la guía de instalación</a>. Queda en tu pantalla de inicio como cualquier app, sin pasar por una tienda.'],
        ['No me llegan las notificaciones', 'Actívalas en <b>Mi veterinaria → Avisos de tu veterinaria</b> y acepta el permiso del navegador. En iPhone, primero instala la app en la pantalla de inicio y ábrela desde ahí.'],
        ['¿Cómo corrijo o elimino mis datos?', 'Tus datos y los de cada mascota los editas aquí y en cada ficha. Para lo que guarda una clínica, usa <b>Mi veterinaria → Tus datos personales</b>. Para cerrar tu cuenta, revisa la <a href="/privacidad.html" target="_blank" rel="noopener">política de privacidad</a>.'],
        ['¿La app tiene costo?', 'No. ARM Mascotas es gratis para los dueños de mascotas.']
    ];

    function plantillaAyuda() {
        return `
            <section class="card perfil-ayuda" id="perfilAyuda">
                <div class="perfil-ayuda-cabecera">
                    <div>
                        <h3>❓ Ayuda y preguntas frecuentes</h3>
                        <p>Respuestas rápidas sobre cómo usar ARM Mascotas.</p>
                    </div>
                    <div class="perfil-ayuda-acciones">
                        <button type="button" class="btn-secundario" id="btnVerTutorial">▶ Ver tutorial</button>
                        <a class="btn-secundario" href="/privacidad.html" target="_blank" rel="noopener">🔒 Privacidad</a>
                        <a class="btn-secundario" href="/terminos.html" target="_blank" rel="noopener">📄 Términos</a>
                    </div>
                </div>
                <div class="perfil-faq">
                    ${PREGUNTAS.map(([p, r]) => `<details><summary>${p}</summary><p>${r}</p></details>`).join('')}
                </div>
            </section>`;
    }

    async function subirFoto(ev) {
        const file = ev.target.files[0];
        if (!file) return;

        const res = await Utils.subirArchivo(BUCKET_AVATARES, window.appData.perfil.id, file);
        if (!res.ok) {
            Utils.toast('No se pudo subir la foto: ' + res.error, 'error');
            return;
        }

        const { error } = await db.from('mascotas_perfiles').update({ foto_url: res.url }).eq('id', window.appData.perfil.id);
        if (error) {
            Utils.toast('No se pudo guardar la foto: ' + error.message, 'error');
            return;
        }

        window.appData.perfil.foto_url = res.url;
        document.getElementById('avatarPreview').innerHTML = `<img src="${res.url}" alt="Foto de perfil">`;
        Utils.toast('Foto actualizada', 'exito');
    }

    async function guardar(ev) {
        ev.preventDefault();
        const btn = document.getElementById('btnGuardarPerfil');
        const mensaje = document.getElementById('perfilMensaje');

        const cambios = {
            nombre: valor('pNombre'),
            apellido: valor('pApellido'),
            telefono: valor('pTelefono'),
            whatsapp: valor('pWhatsapp'),
            direccion: valor('pDireccion'),
            ciudad: valor('pCiudad'),
            region: valor('pRegion'),
            pais: valor('pPais'),
            contacto_emergencia_nombre: valor('pContactoNombre'),
            contacto_emergencia_telefono: valor('pContactoTelefono')
        };

        if (!cambios.nombre || !cambios.apellido) {
            mensaje.textContent = 'Nombre y apellido son obligatorios.';
            mensaje.className = 'field-msg msg-error';
            return;
        }

        Utils.setLoading(btn, true);
        const { error } = await db.from('mascotas_perfiles').update(cambios).eq('id', window.appData.perfil.id);
        Utils.setLoading(btn, false);

        if (error) {
            mensaje.textContent = error.message;
            mensaje.className = 'field-msg msg-error';
            return;
        }

        Object.assign(window.appData.perfil, cambios);
        mensaje.textContent = 'Perfil actualizado.';
        mensaje.className = 'field-msg msg-exito';
        Utils.toast('Perfil actualizado', 'exito');
    }

    function valor(id) {
        const el = document.getElementById(id);
        return el ? el.value.trim() || null : null;
    }

    function esc(v) {
        return (v || '').toString().replace(/"/g, '&quot;');
    }

    return { init };
})();

window.Perfil = Perfil;
