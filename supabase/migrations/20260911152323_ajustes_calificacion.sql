-- Ajuste manual del promedio final de un alumno.
--
-- Existe para el caso real de que el sistema califique mal (un examen que no
-- reconocio una respuesta valida, un bloqueo injusto) y el maestro tenga que
-- corregir. Se guarda APARTE del calculo, nunca encima: el promedio
-- calculado sigue ahi, y el ajuste queda marcado con su motivo y su autor.
-- Asi cualquiera puede ver que una calificacion fue intervenida y por que.
create table if not exists public.ajustes_calificacion (
  id                 uuid primary key default gen_random_uuid(),
  grupo_id           uuid not null references public.grupos(id) on delete cascade,
  alumno_id          uuid not null references public.alumnos(id) on delete cascade,
  periodo_id         uuid references public.periodos(id) on delete cascade,
  promedio_ajustado  numeric not null,
  motivo             text not null,
  ajustado_por       uuid references public.profesores(id),
  created_at         timestamptz not null default now(),
  constraint ajuste_en_rango check (promedio_ajustado >= 0 and promedio_ajustado <= 10),
  constraint ajuste_con_motivo check (length(btrim(motivo)) >= 3)
);

-- Un solo ajuste por alumno y periodo. Se necesitan dos indices porque en
-- Postgres dos NULL no se consideran iguales, asi que un unique normal
-- dejaria pasar duplicados en el caso "sin periodo".
create unique index if not exists ajuste_unico_con_periodo
  on public.ajustes_calificacion (grupo_id, alumno_id, periodo_id)
  where periodo_id is not null;

create unique index if not exists ajuste_unico_sin_periodo
  on public.ajustes_calificacion (grupo_id, alumno_id)
  where periodo_id is null;

alter table public.ajustes_calificacion enable row level security;

create policy "profesor administra ajustes" on public.ajustes_calificacion
  for all using (es_profesor_del_grupo(grupo_id))
  with check (es_profesor_del_grupo(grupo_id));

-- El alumno puede ver su propio ajuste: si su calificacion fue corregida,
-- no hay razon para escondérselo.
create policy "alumno ve su ajuste" on public.ajustes_calificacion
  for select using (alumno_id = auth.uid());;
