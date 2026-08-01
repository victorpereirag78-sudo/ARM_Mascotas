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
    }

    function plantilla(p) {
        const iniciales = ((p.nombre || '?')[0] || '?').toUpperCase();
        return `
            <div class="form-panel-embed">
                <div class="perfil-avatar-fila">
                    <div class="perfil-avatar" id="avatarPreview">
                        ${p.foto_url ? `<img src="${p.foto_url}" alt="Foto de perfil">` : iniciales}
                    </div>
                    <label class="btn-secundario btn-subir-foto">
                        Cambiar foto
                        <input type="file" id="inputFotoPerfil" accept="image/*" hidden>
                    </label>
                </div>

                <form id="formPerfil" novalidate>
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

                    <div class="field-msg" id="perfilMensaje"></div>
                    <button type="submit" class="btn-primario btn-ancho-auto" id="btnGuardarPerfil">Guardar cambios</button>
                </form>
            </div>
        `;
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
