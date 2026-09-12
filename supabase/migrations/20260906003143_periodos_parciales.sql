-- Periodos/parciales configurables por grupo (ej. "Parcial 1", "Parcial 2", "Parcial 3",
-- o uno solo para todo el ciclo en primaria). El profesor decide manualmente a qué
-- periodo pertenece cada examen/tarea al crearlo.
create table periodos (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references grupos(id) on delete cascade,
  nombre text not null,
  orden int not null default 0,
  created_at timestamptz not null default now()
);

create index idx_periodos_grupo on periodos(grupo_id);

alter table periodos enable row level security;
create policy "profesor administra periodos" on periodos for all using (es_profesor_del_grupo(grupo_id));
create policy "alumno ve periodos de su grupo" on periodos for select using (alumno_en_grupo(grupo_id));

-- Un examen o tarea sin periodo asignado sigue funcionando igual que antes
-- (grupos que no usan parciales no se ven afectados).
alter table examenes add column periodo_id uuid references periodos(id) on delete set null;
alter table tareas add column periodo_id uuid references periodos(id) on delete set null;

create index idx_examenes_periodo on examenes(periodo_id);
create index idx_tareas_periodo on tareas(periodo_id);
;
