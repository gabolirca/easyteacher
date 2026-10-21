-- Participacion en formato tarea, POR DIA.
--
-- Cada dia que el maestro califica queda en su propio renglon (fecha), y la
-- calificacion del periodo es el promedio de esos dias. Va en una tabla
-- nueva a proposito: participacion_simple (una calificacion por periodo) se
-- queda igual, asi la version anterior de la app sigue funcionando mientras
-- se publica la nueva, y lo que ya estaba capturado se sigue respetando.
create table if not exists public.participacion_simple_dias (
  id           uuid primary key default gen_random_uuid(),
  grupo_id     uuid not null references public.grupos(id) on delete cascade,
  alumno_id    uuid not null references public.alumnos(id) on delete cascade,
  periodo_id   uuid references public.periodos(id) on delete cascade,
  fecha        date not null,
  calificacion numeric check (calificacion is null or (calificacion >= 0 and calificacion <= 10)),
  constraint participacion_simple_dias_unica unique nulls not distinct (grupo_id, alumno_id, periodo_id, fecha)
);

create index if not exists idx_part_simple_dias_grupo on public.participacion_simple_dias (grupo_id, periodo_id);

alter table public.participacion_simple_dias enable row level security;
create policy "profesor administra participacion por dia" on public.participacion_simple_dias
  for all using (es_profesor_del_grupo(grupo_id)) with check (es_profesor_del_grupo(grupo_id));
create policy "alumno ve su participacion por dia" on public.participacion_simple_dias
  for select using (alumno_id = auth.uid());
