-- Paquete de octubre: fecha local, corte de asistencia y rubros diarios.
--
-- 1) FECHA DEL DIA EN HORA DE MEXICO
--    La base corre en UTC. Las columnas `fecha date default current_date`
--    tomaban la fecha UTC, asi que una clase iniciada despues de las 6 pm
--    (hora del centro) quedaba registrada con la fecha de MANANA, y la
--    asistencia que se pasa desde esa sesion tambien. Se cambia el valor por
--    defecto; lo que la app ya manda explicito no se toca.
alter table public.sesiones
  alter column fecha set default (now() at time zone 'America/Mexico_City')::date;
alter table public.cortes_participacion
  alter column fecha set default (now() at time zone 'America/Mexico_City')::date;
alter table public.participaciones
  alter column fecha set default (now() at time zone 'America/Mexico_City')::date;

-- 2) PERIODOS CON FECHAS
--    El corte de asistencia necesita saber que dias caen en cada periodo.
--    Son opcionales: un periodo sin fechas sigue funcionando como antes.
alter table public.periodos
  add column if not exists fecha_inicio date,
  add column if not exists fecha_fin    date;
alter table public.periodos
  add constraint periodo_fechas_en_orden
  check (fecha_inicio is null or fecha_fin is null or fecha_fin >= fecha_inicio);

-- 3) CORTE DE ASISTENCIA
--    Porcentaje minimo para tener derecho a examen, por grupo. Arranca en 80.
alter table public.grupos
  add column if not exists asistencia_minima numeric not null default 80;
alter table public.grupos
  add constraint asistencia_minima_en_rango
  check (asistencia_minima >= 0 and asistencia_minima <= 100);

--    El corte solo MARCA; no bloquea el examen. Cuando el maestro decide dar
--    derecho a quien no llega al minimo (justificante, acuerdo con la
--    direccion), se guarda aqui con el motivo. periodo_id null = todo el ciclo.
create table if not exists public.derecho_examen_manual (
  id          uuid primary key default gen_random_uuid(),
  grupo_id    uuid not null references public.grupos(id) on delete cascade,
  alumno_id   uuid not null references public.alumnos(id) on delete cascade,
  periodo_id  uuid references public.periodos(id) on delete cascade,
  motivo      text,
  otorgado_por uuid references public.profesores(id) default auth.uid(),
  created_at  timestamptz not null default now(),
  constraint derecho_unico unique nulls not distinct (grupo_id, alumno_id, periodo_id)
);

alter table public.derecho_examen_manual enable row level security;
create policy "profesor administra derecho a examen" on public.derecho_examen_manual
  for all using (es_profesor_del_grupo(grupo_id)) with check (es_profesor_del_grupo(grupo_id));

-- 4) RUBROS QUE SE CALIFICAN A DIARIO
--    'periodo' = una calificacion por alumno (como siempre).
--    'diario'  = una calificacion por alumno por dia; el rubro vale el
--                promedio de esos dias. Ej. conducta diaria.
alter table public.rubros_evaluacion
  add column if not exists frecuencia text not null default 'periodo';
alter table public.rubros_evaluacion
  add constraint rubro_frecuencia_valida check (frecuencia in ('periodo', 'diario'));

--    Las calificaciones diarias llevan fecha; las de periodo la dejan en null.
--    NULLS NOT DISTINCT para que "sin fecha" siga siendo una sola fila por
--    alumno y el upsert de los rubros de periodo no duplique.
alter table public.calificaciones_rubro add column if not exists fecha date;
alter table public.calificaciones_rubro
  drop constraint if exists calificaciones_rubro_rubro_id_alumno_id_key;
alter table public.calificaciones_rubro
  add constraint calificacion_rubro_unica unique nulls not distinct (rubro_id, alumno_id, fecha);
