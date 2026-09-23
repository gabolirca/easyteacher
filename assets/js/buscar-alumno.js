import { supabase } from './supabase-client.js';

// ---------------------------------------------------------------------------
// Buscador de alumnos que el maestro YA tiene.
//
// La matricula es unica por maestro, no por grupo: el mismo alumno puede estar
// en primero y volver en tercero con su mismo expediente. El problema era
// encontrarlo, porque nadie se acuerda de la matricula de hace dos anios. Esto
// busca por nombre y devuelve el id exacto, para no crear un duplicado.
//
// Incluye a los egresados: si el maestro los egreso al cerrar el ciclo, siguen
// siendo la misma persona y hay que poder reinscribirlos.
// ---------------------------------------------------------------------------

const ESPERA_MS = 250;
const MAXIMO = 8;

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s ?? '';
  return d.innerHTML;
}

// PostgREST interpreta comas y parentesis dentro de .or(): hay que sacarlos o
// una busqueda como "Perez, Ana" rompe la consulta.
function limpiar(t) {
  return t.replace(/[,()%*\\]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function montarBuscadorAlumnos({
  inputId, resultadosId, profesorId, alSeleccionar, yaEnLista,
}) {
  const input = document.getElementById(inputId);
  const caja = document.getElementById(resultadosId);
  if (!input || !caja) return;

  let temporizador = null;
  let peticion = 0;

  const ocultar = () => { caja.innerHTML = ''; caja.style.display = 'none'; };

  const pintar = (filas) => {
    if (filas.length === 0) {
      caja.innerHTML = '<p class="px-4 py-3 text-sm text-on-surface-variant">Ningún alumno tuyo coincide. Si es nuevo, agrégalo abajo.</p>';
      caja.style.display = 'block';
      return;
    }
    caja.innerHTML = filas.map((a) => {
      const puesto = typeof yaEnLista === 'function' && yaEnLista(a);
      const etiqueta = a.activo
        ? ''
        : `<span class="ml-2 text-xs px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant">egresado${a.ciclo_egreso ? ' ' + esc(a.ciclo_egreso) : ''}</span>`;
      return `
        <button type="button" class="res-alumno w-full text-left px-4 py-3 hover:bg-surface-container-high transition-colors border-b border-outline-variant last:border-b-0 disabled:opacity-50"
                data-id="${a.id}" data-nombre="${esc(a.nombre)}" data-matricula="${esc(a.matricula || '')}" ${puesto ? 'disabled' : ''}>
          <span class="font-body-md text-body-md text-on-surface">${esc(a.nombre)}</span>${etiqueta}
          <span class="block text-sm text-on-surface-variant">${esc(a.matricula || 'sin matrícula')}${puesto ? ' · ya está en la lista' : ''}</span>
        </button>`;
    }).join('');
    caja.style.display = 'block';

    caja.querySelectorAll('.res-alumno').forEach((b) => {
      b.addEventListener('click', () => {
        alSeleccionar({
          id: b.dataset.id,
          nombre: b.dataset.nombre,
          matricula: b.dataset.matricula,
        });
        input.value = '';
        ocultar();
      });
    });
  };

  const buscar = async () => {
    const texto = limpiar(input.value);
    if (texto.length < 2) { ocultar(); return; }

    const mio = ++peticion;
    const { data, error } = await supabase
      .from('alumnos')
      .select('id, nombre, matricula, activo, ciclo_egreso')
      .eq('profesor_id', profesorId)
      .or(`nombre.ilike.%${texto}%,matricula.ilike.%${texto}%`)
      .order('activo', { ascending: false })
      .order('nombre')
      .limit(MAXIMO);

    if (mio !== peticion) return;        // llego una respuesta vieja
    if (error) { ocultar(); return; }
    pintar(data || []);
  };

  input.addEventListener('input', () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(buscar, ESPERA_MS);
  });

  input.addEventListener('blur', () => setTimeout(ocultar, 200));
  input.addEventListener('focus', () => { if (input.value.trim().length >= 2) buscar(); });
}
