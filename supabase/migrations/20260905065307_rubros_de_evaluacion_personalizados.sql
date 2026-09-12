-- Rubros de evaluación personalizados por grupo (ej. "Conducta", "Proyecto final").
-- Se suman a Exámenes/Tareas/Participación en el promedio ponderado.
create table rubros_evaluacion (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references grupos(id) on delete cascade,
  nombre text not null,
  peso numeric not null default 0,
  orden int not null default 0,
  created_at timestamptz not null default now()
);

create table calificaciones_rubro (
  id uuid primary key default gen_random_uuid(),
  rubro_id uuid not null references rubros_evaluacion(id) on delete cascade,
  alumno_id uuid not null references alumnos(id) on delete cascade,
  calificacion numeric,
  unique (rubro_id, alumno_id)
);

create index idx_rubros_grupo on rubros_evaluacion(grupo_id);
create index idx_calif_rubro_alumno on calificaciones_rubro(alumno_id);

alter table rubros_evaluacion enable row level security;
alter table calificaciones_rubro enable row level security;

create policy "profesor administra rubros" on rubros_evaluacion for all using (es_profesor_del_grupo(grupo_id));
create policy "alumno ve rubros de su grupo" on rubros_evaluacion for select using (alumno_en_grupo(grupo_id));

create policy "profesor administra calificaciones de rubros" on calificaciones_rubro for all using (
  exists (select 1 from rubros_evaluacion r where r.id = calificaciones_rubro.rubro_id and es_profesor_del_grupo(r.grupo_id))
);
create policy "alumno ve su calificacion de rubro" on calificaciones_rubro for select using (alumno_id = auth.uid());
;
