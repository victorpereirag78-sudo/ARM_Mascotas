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
            return { ok: false, error: 'Revisa tu correo para confirmar la cuenta antes de continuar.' };
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

    return {
        registrarDueno,
        login,
        logout,
        restaurarSesion,
        puedeAcceder
    };
})();
