-- Modo de participación por profesor: 'fichas' (el juego de tu papá) o 'simple' (una nota 0-10, como Tareas)
alter table profesores add column modo_participacion text not null default 'simple' check (modo_participacion in ('fichas','simple'));

-- Deja a tu papá (el único profesor que existe hasta ahora) en modo fichas
update profesores set modo_participacion = 'fichas';

-- Participación en modo "simple": una calificación 0-10 directa por alumno, editable como Tareas
create table participacion_simple (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references grupos(id) on delete cascade,
  alumno_id uuid not null references alumnos(id) on delete cascade,
  calificacion numeric,
  unique (grupo_id, alumno_id)
);

alter table participacion_simple enable row level security;
create policy "profesor administra participacion simple" on participacion_simple for all using (es_profesor_del_grupo(grupo_id));
create policy "alumno ve su participacion simple" on participacion_simple for select using (alumno_id = auth.uid());

-- Cortes de participación (modo fichas): una "foto fija" donde el profesor elige
-- un valor de referencia y se calcula la calificación resultante (tope en 10).
create table cortes_participacion (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references grupos(id) on delete cascade,
  fecha date not null default current_date,
  media numeric not null,
  created_at timestamptz not null default now()
);

create table calificaciones_corte_participacion (
  id uuid primary key default gen_random_uuid(),
  corte_id uuid not null references cortes_participacion(id) on delete cascade,
  alumno_id uuid not null references alumnos(id) on delete cascade,
  puntos_al_momento numeric not null,
  calificacion numeric not null
);

create index idx_cortes_grupo on cortes_participacion(grupo_id, created_at);
create index idx_calif_corte_alumno on calificaciones_corte_participacion(alumno_id);

alter table cortes_participacion enable row level security;
alter table calificaciones_corte_participacion enable row level security;

create policy "profesor administra cortes" on cortes_participacion for all using (es_profesor_del_grupo(grupo_id));
create policy "alumno ve cortes de su grupo" on cortes_participacion for select using (alumno_en_grupo(grupo_id));

create policy "profesor administra calificaciones de corte" on calificaciones_corte_participacion for all using (
  exists (select 1 from cortes_participacion c where c.id = calificaciones_corte_participacion.corte_id and es_profesor_del_grupo(c.grupo_id))
);
create policy "alumno ve su calificacion de corte" on calificaciones_corte_participacion for select using (alumno_id = auth.uid());
;
