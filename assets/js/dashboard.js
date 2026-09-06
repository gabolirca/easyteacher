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
    .eq('archivado', false)
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
              <div class="relative card-hover bg-surface-container-lowest border border-outline-variant rounded-DEFAULT p-6 shadow-[0_4px_20px_rgba(0,0,0,0.05)] flex flex-col gap-6" style="animation: popIn 0.6s cubic-bezier(0.22, 1, 0.36, 1) ${i * 0.08}s both;">
        <button class="btn-menu-grupo absolute top-4 right-4 text-on-surface-variant hover:bg-surface-container-high p-1 rounded-full transition-colors" data-grupo-id="${g.id}" aria-label="Más opciones">
          <span class="material-symbols-outlined">more_vert</span>
        </button>
        <div class="menu-grupo hidden absolute top-12 right-4 bg-surface-container-lowest border border-outline-variant rounded-DEFAULT shadow-lg z-10 overflow-hidden" data-grupo-id="${g.id}">
          <button class="btn-archivar-grupo w-full text-left px-4 py-3 text-on-surface hover:bg-surface-container-high font-body-md text-body-md flex items-center gap-2" data-grupo-id="${g.id}">
            <span class="material-symbols-outlined text-lg">archive</span> Archivar
          </button>
          <button class="btn-eliminar-grupo w-full text-left px-4 py-3 text-error hover:bg-error-container font-body-md text-body-md flex items-center gap-2" data-grupo-id="${g.id}">
            <span class="material-symbols-outlined text-lg">delete</span> Eliminar
          </button>
        </div>
        <div class="flex items-start justify-between pr-6">
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

function cerrarMenusAbiertos() {
  document.querySelectorAll('.menu-grupo').forEach((m) => m.classList.add('hidden'));
}

document.getElementById('grupos-container').addEventListener('click', async (e) => {
  const btnMenu = e.target.closest('.btn-menu-grupo');
  if (btnMenu) {
    const id = btnMenu.dataset.grupoId;
    const menu = document.querySelector(`.menu-grupo[data-grupo-id="${id}"]`);
    const yaAbierto = !menu.classList.contains('hidden');
    cerrarMenusAbiertos();
    if (!yaAbierto) menu.classList.remove('hidden');
    return;
  }

  const btnArchivar = e.target.closest('.btn-archivar-grupo');
  if (btnArchivar) {
    const id = btnArchivar.dataset.grupoId;
    cerrarMenusAbiertos();
    const { error } = await supabase.from('grupos').update({ archivado: true }).eq('id', id);
    if (error) {
      alert(`No se pudo archivar el grupo: ${error.message}`);
      return;
    }
    await cargarGrupos();
    return;
  }

  const btnEliminar = e.target.closest('.btn-eliminar-grupo');
  if (btnEliminar) {
    const id = btnEliminar.dataset.grupoId;
    cerrarMenusAbiertos();
    const confirmado = window.confirm(
      'Esto borra el grupo y TODO lo relacionado (alumnos inscritos, exámenes, tareas, calificaciones, asistencia) de forma permanente. ¿Seguro que quieres eliminarlo? Si solo quieres dejar de verlo por ahora, usa "Archivar" en vez de esto.'
    );
    if (!confirmado) return;
    const { error } = await supabase.from('grupos').delete().eq('id', id);
    if (error) {
      alert(`No se pudo eliminar el grupo: ${error.message}`);
      return;
    }
    await cargarGrupos();
  }
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.btn-menu-grupo')) cerrarMenusAbiertos();
});

async function init() {
  const profesor = await requireProfesor();
  if (!profesor) return;

  const primerNombre = (profesor.nombre || profesor.correo || '').split(' ')[0];
  document.getElementById('sidebar-nombre').textContent = profesor.nombre || profesor.correo;
  document.getElementById('saludo-nombre').textContent = `Buenos días, ${primerNombre}`;
  if (profesor.avatar_url) document.getElementById('sidebar-avatar').src = profesor.avatar_url;

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

// Botones "Entrar" de cada tarjeta de grupo (se generan dinámicamente en cargarGrupos)
document.getElementById('grupos-container').addEventListener('click', (e) => {
  const btnEntrar = e.target.closest('button:not(.btn-menu-grupo):not(.btn-archivar-grupo):not(.btn-eliminar-grupo)[data-grupo-id]');
  if (btnEntrar) {
    window.location.href = `grupo.html?id=${btnEntrar.dataset.grupoId}`;
  }
});

document.getElementById('btn-toggle-grupos-archivados').addEventListener('click', async () => {
  const cont = document.getElementById('grupos-archivados-container');
  const oculto = cont.classList.contains('hidden');

  if (oculto) {
    await cargarGruposArchivados();
    cont.classList.remove('hidden');
    cont.classList.add('grid');
    document.getElementById('btn-toggle-grupos-archivados').innerHTML = '<span class="material-symbols-outlined text-lg">unarchive</span> Ocultar archivados';
  } else {
    cont.classList.add('hidden');
    cont.classList.remove('grid');
    document.getElementById('btn-toggle-grupos-archivados').innerHTML = '<span class="material-symbols-outlined text-lg">archive</span> Ver grupos archivados';
  }
});

async function cargarGruposArchivados() {
  const cont = document.getElementById('grupos-archivados-container');
  cont.innerHTML = '<p class="col-span-full text-on-surface-variant">Cargando...</p>';

  const { data: grupos, error } = await supabase
    .from('grupos')
    .select('id, nombre, materia')
    .eq('archivado', true)
    .order('created_at', { ascending: false });

  if (error) {
    cont.innerHTML = `<p class="col-span-full text-error">No se pudieron cargar: ${escapeHtml(error.message)}</p>`;
    return;
  }

  if (!grupos || grupos.length === 0) {
    cont.innerHTML = '<p class="col-span-full text-on-surface-variant">No tienes grupos archivados.</p>';
    return;
  }

  cont.innerHTML = grupos.map((g) => `
    <div class="bg-surface-container-lowest border border-outline-variant rounded-DEFAULT p-6 flex flex-col gap-4 opacity-80">
      <h3 class="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">${escapeHtml(g.nombre)}</h3>
      <button class="btn-restaurar-grupo w-full border-2 border-primary text-primary font-button-text text-button-text py-3 rounded-full hover:bg-primary hover:text-on-primary transition-colors" data-grupo-id="${g.id}">
        Restaurar
      </button>
    </div>`).join('');

  cont.querySelectorAll('.btn-restaurar-grupo').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const { error: errorRestaurar } = await supabase.from('grupos').update({ archivado: false }).eq('id', btn.dataset.grupoId);
      if (errorRestaurar) {
        alert(`No se pudo restaurar: ${errorRestaurar.message}`);
        return;
      }
      await cargarGruposArchivados();
      await cargarGrupos();
    });
  });
}

// Accesos rápidos: se usan tanto en las tarjetas de "Acceso Rápido" como en los
// links del sidebar (Exams/Tasks/Attendance) — mismo comportamiento en ambos.
const PAGINA_POR_ACCESO = {
  'crear-examen': 'grupo.html',
  asistencia: 'asistencia.html',
  tareas: 'tareas.html',
  calificaciones: 'calificaciones.html',
};

document.querySelectorAll('[data-quick]').forEach((btn) => {
  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    const pagina = PAGINA_POR_ACCESO[btn.dataset.quick];
    if (!pagina) return;

    const { data: grupos } = await supabase.from('grupos').select('id').eq('archivado', false).limit(2);
    if (grupos && grupos.length === 1) {
      window.location.href = `${pagina}?id=${grupos[0].id}`;
    } else {
      document.getElementById('mis-grupos').scrollIntoView({ behavior: 'smooth' });
    }
  });
});

init();