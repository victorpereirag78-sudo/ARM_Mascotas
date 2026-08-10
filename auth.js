// ================================================================
// AUTH.JS — Autenticación de ARM Mascotas sobre Supabase Auth
// Depende de: config.js (db, ROL_MODULOS, appData)
// ================================================================

const Auth = (() => {

    // ── Registro de dueño ────────────────────────────────────────
    // 1) Crea el usuario en Supabase Auth (dispara el trigger que
    //    inserta la fila base en `mascotas_perfiles` con rol='dueno').
    // 2) Completa el resto de los campos del perfil en un segundo
    //    update, para no duplicar el formulario de alta.
    async function registrarDueno({ email, password, ...datosPerfil }) {
        const { data, error } = await db.auth.signUp({
            email,
            password,
            options: { data: { nombre: datosPerfil.nombre || '' } }
        });
        if (error) return { ok: false, error: error.message };
        if (!data.user) {
            return { ok: false, error: 'Revisa tu correo para confirmar la cuenta antes de continuar. Tambien revisa tu carpeta de NO DESEADOS' };
        }

        // Si el proyecto exige confirmación de correo, signUp() no entrega
        // sesión activa todavía (el cliente sigue siendo "anon", sin permisos
        // sobre mascotas_perfiles). Guardamos el resto del formulario y lo
        // aplicamos en el primer login, cuando ya haya sesión autenticada.
        if (!data.session) {
            localStorage.setItem(
                `armMascotas_perfilPendiente_${email}`,
                JSON.stringify({ ...datosPerfil, correo: email })
            );
            return { ok: true, usuario: data.user, pendienteConfirmacion: true };
        }

        const { error: errorPerfil } = await db
            .from('mascotas_perfiles')
            .update({ ...datosPerfil, correo: email })
            .eq('id', data.user.id);

        if (errorPerfil) return { ok: false, error: errorPerfil.message };
        return { ok: true, usuario: data.user };
    }

    // ── Login ────────────────────────────────────────────────────
    async function login(email, password) {
        const { data, error } = await db.auth.signInWithPassword({ email, password });
        if (error) return { ok: false, error: traducirErrorAuth(error.message) };

        const cargado = await cargarSesionActual();
        if (!cargado.ok) return cargado;

        return { ok: true, perfil: window.appData.perfil };
    }

    // ── Logout ───────────────────────────────────────────────────
    async function logout() {
        await db.auth.signOut();
        window.appData.usuario = null;
        window.appData.perfil = null;
        window.appData.mascotas = [];
    }

    // ── Restaurar sesión al recargar la página ──────────────────
    async function restaurarSesion() {
        const { data } = await db.auth.getSession();
        if (!data.session) return { ok: false };
        return cargarSesionActual();
    }

    async function cargarSesionActual() {
        const { data: { user } } = await db.auth.getUser();
        if (!user) return { ok: false, error: 'Sesión no válida' };

        await aplicarPerfilPendiente(user);

        const { data: perfil, error: errorPerfil } = await db
            .from('mascotas_perfiles')
            .select('*')
            .eq('id', user.id)
            .single();

        if (errorPerfil) return { ok: false, error: errorPerfil.message };

        window.appData.usuario = user;
        window.appData.perfil = perfil;
        return { ok: true, perfil };
    }

    // Completa el perfil con los datos guardados en registrarDueno() cuando
    // el registro tuvo que esperar la confirmación de correo.
    async function aplicarPerfilPendiente(user) {
        const clave = `armMascotas_perfilPendiente_${user.email}`;
        const pendiente = localStorage.getItem(clave);
        if (!pendiente) return;

        await db.from('mascotas_perfiles').update(JSON.parse(pendiente)).eq('id', user.id);
        localStorage.removeItem(clave);
    }

    // ── Permisos de menú por rol ─────────────────────────────────
    function puedeAcceder(panel) {
        const perfil = window.appData.perfil;
        if (!perfil) return false;
        const panelesRol = ROL_MODULOS[perfil.rol] || [];
        return panelesRol.includes(panel);
    }

    function traducirErrorAuth(mensaje) {
        if (/Invalid login credentials/i.test(mensaje)) return 'Correo o contraseña incorrectos.';
        if (/User already registered/i.test(mensaje)) return 'Ya existe una cuenta con ese correo.';
        if (/Password should be/i.test(mensaje)) return 'La contraseña debe tener al menos 6 caracteres.';
        return mensaje;
    }

    // ── Recuperación de contraseña ──────────────────────────────────
    // Público (no requiere sesión): Supabase envía un correo con un
    // link mágico que redirige a actualizar-password.html con una
    // sesión de recuperación ya activa.
    async function solicitarRecuperacion(email) {
        const { error } = await db.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/actualizar-password.html`
        });
        if (error) return { ok: false, error: error.message };
        return { ok: true };
    }

    // Requiere la sesión de recuperación activa (viene del link del correo).
    async function actualizarPassword(nuevaPassword) {
        const { error } = await db.auth.updateUser({ password: nuevaPassword });
        if (error) return { ok: false, error: traducirErrorAuth(error.message) };
        return { ok: true };
    }

    return {
        registrarDueno,
        login,
        logout,
        restaurarSesion,
        puedeAcceder,
        solicitarRecuperacion,
        actualizarPassword
    };
})();
