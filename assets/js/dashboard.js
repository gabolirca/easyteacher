import { supabase } from './supabase-client.js';
import { requireProfesor } from './auth-guard.js';

const ICONOS = ['functions', 'menu_book', 'science', 'palette', 'sports_soccer', 'public'];
const COLORES = [
  { bg: 'bg-primary-container', text: 'text-on-primary-container' },
  { bg: 'bg-secondary-container', text: 'text-on-secondary-container' },
  { bg: 'bg-tertiary-container', text: 'text-on-tertiary-container' },
];

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

async function cargarGrupos() {
  const contenedor = document.getElementById('grupos-container');

  const { data: grupos, error } = await supabase
    .from('grupos')
    .select('id, nombre, materia, grupo_alumnos(count)')
    .order('created_at', { ascending: false });

  if (error) {
    contenedor.innerHTML = `<p class="col-span-full text-error">No se pudieron cargar tus grupos: ${escapeHtml(error.message)}</p>`;
    return;
  }

  if (!grupos || grupos.length === 0) {
    contenedor.innerHTML = `
      <div class="col-span-full text-center py-12 text-on-surface-variant">
        <p class="font-body-lg text-body-lg">Aún no tienes grupos.</p>
        <p class="font-body-md text-body-md mt-1">Da clic en "+ Nuevo grupo" para crear el primero.</p>
      </div>`;
    return;
  }

  contenedor.innerHTML = grupos.map((g, i) => {
    const totalAlumnos = g.grupo_alumnos?.[0]?.count ?? 0;
    const icono = ICONOS[i % ICONOS.length];
    const color = COLORES[i % COLORES.length];
    return `
      <div class="bg-surface-container-lowest border border-outline-variant rounded-DEFAULT p-6 shadow-[0_4px_20px_rgba(0,0,0,0.05)] flex flex-col gap-6">
        <div class="flex items-start justify-between">
          <div>
            <h3 class="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">${escapeHtml(g.nombre)}</h3>
            <p class="font-body-md text-body-md text-on-surface-variant mt-1 flex items-center gap-2">
              <span class="material-symbols-outlined text-sm">group</span> ${totalAlumnos} alumnos
            </p>
          </div>
          <div class="${color.bg} ${color.text} p-2 rounded-full">
            <span class="material-symbols-outlined">${icono}</span>
          </div>
        </div>
        <button class="w-full border-2 border-primary text-primary font-button-text text-button-text py-3 rounded-full hover:bg-primary hover:text-on-primary transition-colors" data-grupo-id="${g.id}">
          Entrar
        </button>
      </div>`;
  }).join('');
}

async function init() {
  const profesor = await requireProfesor();
  if (!profesor) return;

  const primerNombre = (profesor.nombre || profesor.correo || '').split(' ')[0];
  document.getElementById('sidebar-nombre').textContent = profesor.nombre || profesor.correo;
  document.getElementById('saludo-nombre').textContent = `Buenos días, ${primerNombre}`;

  await cargarGrupos();
}

document.getElementById('btn-logout').addEventListener('click', async () => {
  await supabase.auth.signOut();
  window.location.href = 'login.html';
});

document.getElementById('btn-nuevo-grupo').addEventListener('click', () => {
  window.location.href = 'crear-grupo.html';
});

document.getElementById('btn-nueva-clase-sidebar').addEventListener('click', () => {
  window.location.href = 'crear-grupo.html';
});

init();

