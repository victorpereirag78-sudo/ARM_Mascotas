// ================================================================
// CONFIG.JS — Configuración global de ARM Mascotas
// Incluir PRIMERO, antes que cualquier otro script (después del
// <script> del SDK de Supabase por CDN).
// ================================================================

// ── Supabase ─────────────────────────────────────────────────────
// TODO: reemplazar por los valores reales del proyecto Supabase una
// vez creado (Project Settings → API). La anon key es pública por
// diseño: toda la protección real vive en las políticas RLS (ver
// sql/008_rls_policies.sql), nunca en ocultar esta key.
const SUPABASE_URL = 'https://rhggndoqjnlzmfxsllto.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJoZ2duZG9xam5sem1meHNsbHRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNDE5MTIsImV4cCI6MjA5MzYxNzkxMn0.sEJIK0dtWsjwf_KUBII_QQYWuoLUvoNTGXxUUEzwhCE';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Buckets de Storage ───────────────────────────────────────────
const BUCKET_AVATARES = 'avatares-perfil';
const BUCKET_FOTOS_MASCOTAS = 'fotos-mascotas';
const BUCKET_ADJUNTOS_CLINICOS = 'adjuntos-clinicos'; // reservado, módulo futuro

// ── Roles y módulos visibles por rol ─────────────────────────────
// Se cruza con Auth.puedeAcceder(panel) para armar el menú lateral.
// Los 4 roles del producto quedan definidos desde ahora aunque solo
// "dueno" tenga paneles reales en el Módulo 1.
const ROL_MODULOS = {
    'dueno': [
        'panel-dashboard',
        'panel-mascotas',
        'panel-perfil',
        'panel-compartir'
    ],
    'veterinario': [
        // Reservado — Módulo Veterinario (futuro)
    ],
    'clinica': [
        // Reservado — Módulo Clínica (futuro)
    ],
    'admin': [
        'panel-admin'
    ]
};

// ── Especies y fórmula de edad humana equivalente ────────────────
// 'otro' no tiene una fórmula generalizable de edad humana.
const ESPECIES_CON_EDAD_HUMANA = ['perro', 'gato'];

// ── Estado global de la app (poblado por auth.js tras iniciar sesión) ─
window.appData = window.appData || {
    usuario: null,   // fila de auth.users (sesión de Supabase)
    perfil: null,    // fila de la tabla mascotas_perfiles
    mascotas: []      // mascotas visibles para el usuario actual
};
