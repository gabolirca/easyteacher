-- Calificacion de Examenes capturada a mano.
--
-- Existe por un caso real de la escuela: varios maestros traian su registro en
-- papel de antes de que el sistema estuviera listo, y Examenes era el unico
-- componente del promedio que no se podia escribir. Tareas y los rubros ya se
-- capturan alumno por alumno; Examenes solo salia de examenes presentados en
-- la app, asi que ese maestro se quedaba sin forma de meter lo que ya tenia.
--
-- Igual que ajustes_calificacion, esto NO borra el calculo: el promedio de los
-- examenes presentados en la app se sigue calculando y mostrando al lado. Lo
-- capturado es lo que cuenta para el promedio, y queda marcado como capturado
-- junto con quien lo hizo.
create table if not exists public.examenes_capturados (
  id             uuid primary key default gen_random_uuid(),
  grupo_id       uuid not null references public.grupos(id) on delete cascade,
  alumno_id      uuid not null references public.alumnos(id) on delete cascade,
  periodo_id     uuid references public.periodos(id) on delete cascade,
  calificacion   numeric not null,
  nota           text,
  capturado_por  uuid references public.profesores(id),
  created_at     timestamptz not null default now(),
  constraint examen_capturado_en_rango check (calificacion >= 0 and calificacion <= 10)
);

-- Una sola captura por alumno y periodo. Dos indices parciales porque en
-- Postgres dos NULL no se consideran iguales y un unique normal dejaria
-- pasar duplicados en el caso "sin periodo". Mismo patron que los ajustes.
create unique index if not exists examen_capturado_unico_con_periodo
  on public.examenes_capturados (grupo_id, alumno_id, periodo_id)
  where periodo_id is not null;

create unique index if not exists examen_capturado_unico_sin_periodo
  on public.examenes_capturados (grupo_id, alumno_id)
  where periodo_id is null;

alter table public.examenes_capturados enable row level security;

create policy "profesor administra examenes capturados" on public.examenes_capturados
  for all using (es_profesor_del_grupo(grupo_id))
  with check (es_profesor_del_grupo(grupo_id));

-- El alumno puede ver su propia calificacion capturada: es su calificacion.
create policy "alumno ve su examen capturado" on public.examenes_capturados
  for select using (alumno_id = auth.uid());
