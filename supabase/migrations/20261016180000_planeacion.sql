-- Planeacion del maestro: texto libre de lo que va a trabajar con el grupo.
--
-- Cada maestro decide si la escribe una sola vez para todo el ciclo o una por
-- periodo (parcial), o las dos. periodo_id null = todo el ciclo.
-- Solo la ve y la edita el maestro del grupo; los alumnos no tienen acceso.
create table if not exists public.planeaciones (
  id          uuid primary key default gen_random_uuid(),
  grupo_id    uuid not null references public.grupos(id) on delete cascade,
  periodo_id  uuid references public.periodos(id) on delete cascade,
  texto       text not null default '',
  updated_at  timestamptz not null default now(),
  constraint planeacion_unica unique nulls not distinct (grupo_id, periodo_id),
  constraint planeacion_tamano check (length(texto) <= 100000)
);

alter table public.planeaciones enable row level security;
create policy "profesor administra su planeacion" on public.planeaciones
  for all using (es_profesor_del_grupo(grupo_id)) with check (es_profesor_del_grupo(grupo_id));
