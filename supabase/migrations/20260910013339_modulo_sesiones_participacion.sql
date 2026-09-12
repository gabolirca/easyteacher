-- ============================================================
-- Modulo de sesiones y participacion digital
-- ============================================================

-- Una clase concreta. Contenedor de todo lo demas.
create table if not exists public.sesiones (
  id         uuid primary key default gen_random_uuid(),
  grupo_id   uuid not null references public.grupos(id) on delete cascade,
  periodo_id uuid references public.periodos(id),
  fecha      date not null default current_date,
  inicio     timestamptz not null default now(),
  fin        timestamptz,
  estado     text not null default 'activa',
  nota       text,
  created_at timestamptz not null default now(),
  constraint sesiones_estado_valido check (estado in ('activa','cerrada'))
);

-- Un grupo no puede tener dos sesiones abiertas a la vez.
create unique index if not exists sesiones_una_activa_por_grupo
  on public.sesiones (grupo_id) where estado = 'activa';

create index if not exists sesiones_grupo_fecha on public.sesiones (grupo_id, fecha);

-- El secreto del QR vive aparte para que la RLS pueda negarselo al alumno.
-- RLS es por fila, no por columna: teniendolo en su propia tabla no hay
-- manera de que un alumno lo lea aunque pueda ver la sesion.
create table if not exists public.sesiones_secreto (
  sesion_id uuid primary key references public.sesiones(id) on delete cascade,
  grupo_id  uuid not null references public.grupos(id) on delete cascade,
  secreto   text not null default encode(gen_random_bytes(32), 'hex')
);

-- Lo que el maestro hizo en clase. Sin contenido: solo nombre y valor.
create table if not exists public.actividades_sesion (
  id             uuid primary key default gen_random_uuid(),
  sesion_id      uuid not null references public.sesiones(id) on delete cascade,
  nombre         text not null,
  valor          numeric not null default 1,
  orden          int not null default 0,
  abierta        boolean not null default true,
  inicio_marcado text not null default 'vacia',
  created_at     timestamptz not null default now(),
  constraint actividades_inicio_valido check (inicio_marcado in ('vacia','todos')),
  constraint actividades_valor_positivo check (valor >= 0)
);

create index if not exists actividades_por_sesion on public.actividades_sesion (sesion_id, orden);

-- El evento. Nace 'pendiente' con puntos 0; el servidor copia el valor al
-- aprobar. El alumno nunca escribe puntos ni estado.
create table if not exists public.participaciones_sesion (
  id             uuid primary key default gen_random_uuid(),
  actividad_id   uuid not null references public.actividades_sesion(id) on delete cascade,
  alumno_id      uuid not null references public.alumnos(id) on delete cascade,
  puntos         numeric not null default 0,
  estado         text not null default 'pendiente',
  origen         text not null default 'alumno',
  registrado_por uuid references public.profesores(id),
  created_at     timestamptz not null default now(),
  resuelto_en    timestamptz,
  unique (actividad_id, alumno_id),
  constraint participaciones_estado_valido check (estado in ('pendiente','aprobada','rechazada')),
  constraint participaciones_origen_valido check (origen in ('alumno','maestro'))
);

create index if not exists participaciones_por_actividad on public.participaciones_sesion (actividad_id);
create index if not exists participaciones_por_alumno on public.participaciones_sesion (alumno_id);

-- ------------------------------------------------------------
-- Asistencia: una sola fuente de verdad. El escaneo del QR
-- escribe aqui, no en una tabla paralela.
-- ------------------------------------------------------------
alter table public.asistencias
  add column if not exists sesion_id uuid references public.sesiones(id) on delete set null,
  add column if not exists origen text not null default 'manual';

comment on column public.asistencias.origen is 'manual = lo puso el profesor; qr = el alumno escaneo el QR de la sesion';
comment on column public.asistencias.estado is 'presente | retardo | falta | justificada. Solo justificada sale del denominador de participacion.';

-- ------------------------------------------------------------
-- Helpers para la RLS: resuelven el grupo subiendo por las FK.
-- SECURITY DEFINER para que no choquen con las propias politicas.
-- ------------------------------------------------------------
create or replace function public.grupo_de_sesion(s_id uuid)
returns uuid language sql security definer stable set search_path = public as $$
  select grupo_id from public.sesiones where id = s_id
$$;

create or replace function public.grupo_de_actividad(a_id uuid)
returns uuid language sql security definer stable set search_path = public as $$
  select s.grupo_id
  from public.actividades_sesion a
  join public.sesiones s on s.id = a.sesion_id
  where a.id = a_id
$$;;
