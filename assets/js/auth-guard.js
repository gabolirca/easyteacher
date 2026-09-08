import { supabase } from './supabase-client.js';

// Confirma que hay una sesión activa Y que esa persona es un profesor.
// Si no, la manda de vuelta al login. Se usa al inicio de cada página protegida.
export async function requireProfesor() {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    window.location.href = 'login.html';
    return null;
  }

  const { data: profesor, error } = await supabase
    .from('profesores')
        .select('id, nombre, correo, tipo_maestro, avatar_url, modo_participacion, etiqueta_examenes, etiqueta_tareas, etiqueta_participacion')
    .eq('id', session.user.id)
    .maybeSingle();

  if (error || !profesor) {
    // Sesión válida pero sin perfil de profesor (ej. es un alumno) — no debería
    // estar aquí, lo regresamos al login.
    await supabase.auth.signOut();
    window.location.href = 'login.html';
    return null;
  }

  return profesor;
}