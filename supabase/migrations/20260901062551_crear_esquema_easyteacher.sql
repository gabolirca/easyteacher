create extension if not exists pgcrypto;

-- ==========================================
-- PROFESORES (perfil ligado a auth.users)
-- ==========================================
create table profesores (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  correo text not null unique,
  created_at timestamptz not null default now()
);

-- ==========================================
-- ALUMNOS (perfil ligado a auth.users)
-- ==========================================
create table alumnos (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  matricula text unique,
  genero text check (genero in ('M','F','Otro','Prefiere no decir')),
  creado_por text not null default 'profesor' check (creado_por in ('profesor','alumno')),
  created_at timestamptz not null default now()
);

-- ==========================================
-- GRUPOS
-- ==========================================
create table grupos (
  id uuid primary key default gen_random_uuid(),
  profesor_id uuid not null references profesores(id) on delete cascade,
  nombre text not null,
  materia text,
  ciclo_escolar text,
  created_at timestamptz not null default now()
);

-- ==========================================
-- GRUPO_ALUMNOS (muchos a muchos)
-- ==========================================
create table grupo_alumnos (
  grupo_id uuid not null references grupos(id) on delete cascade,
  alumno_id uuid not null references alumnos(id) on delete cascade,
  fecha_inscripcion timestamptz not null default now(),
  primary key (grupo_id, alumno_id)
);

-- ==========================================
-- EXAMENES
-- ==========================================
create table examenes (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references grupos(id) on delete cascade,
  titulo text not null,
  fecha_apertura timestamptz,
  fecha_cierre timestamptz,
  duracion_min int,
  link_token text not null unique default encode(gen_random_bytes(6), 'hex'),
  estado text not null default 'borrador' check (estado in ('borrador','abierto','cerrado')),
  created_at timestamptz not null default now()
);

-- ==========================================
-- PREGUNTAS
-- ==========================================
create table preguntas (
  id uuid primary key default gen_random_uuid(),
  examen_id uuid not null references examenes(id) on delete cascade,
  tipo text not null check (tipo in ('opcion_multiple','verdadero_falso','relacionar','completar')),
  texto text not null,
  imagen_url text,
  contenido_json jsonb,
  puntos numeric not null default 1,
  orden int not null default 0
);

-- ==========================================
-- OPCIONES
-- ==========================================
create table opciones (
  id uuid primary key default gen_random_uuid(),
  pregunta_id uuid not null references preguntas(id) on delete cascade,
  texto text not null,
  es_correcta boolean not null default false,
  orden int default 0
);

-- ==========================================
-- INTENTOS
-- ==========================================
create table intentos (
  id uuid primary key default gen_random_uuid(),
  examen_id uuid not null references examenes(id) on delete cascade,
  alumno_id uuid not null references alumnos(id) on delete cascade,
  estado text not null default 'en_curso' check (estado in ('en_curso','bloqueado','entregado')),
  motivo_bloqueo text,
  calificacion numeric,
  fecha_inicio timestamptz default now(),
  fecha_fin timestamptz,
  unique (examen_id, alumno_id)
);

-- ==========================================
-- RESPUESTAS
-- ==========================================
create table respuestas (
  id uuid primary key default gen_random_uuid(),
  intento_id uuid not null references intentos(id) on delete cascade,
  pregunta_id uuid not null references preguntas(id) on delete cascade,
  respuesta_json jsonb,
  puntos_obtenidos numeric,
  unique (intento_id, pregunta_id)
);

-- ==========================================
-- ASISTENCIAS
-- ==========================================
create table asistencias (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references grupos(id) on delete cascade,
  alumno_id uuid not null references alumnos(id) on delete cascade,
  fecha date not null,
  estado text not null check (estado in ('presente','falta','retardo')),
  unique (grupo_id, alumno_id, fecha)
);

-- ==========================================
-- TAREAS
-- ==========================================
create table tareas (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references grupos(id) on delete cascade,
  titulo text not null,
  fecha_limite date,
  peso_ponderacion numeric default 1,
  created_at timestamptz not null default now()
);

-- ==========================================
-- CALIFICACIONES_TAREAS
-- ==========================================
create table calificaciones_tareas (
  id uuid primary key default gen_random_uuid(),
  tarea_id uuid not null references tareas(id) on delete cascade,
  alumno_id uuid not null references alumnos(id) on delete cascade,
  calificacion numeric,
  entregado boolean default false,
  unique (tarea_id, alumno_id)
);

-- Índices útiles
create index idx_grupos_profesor on grupos(profesor_id);
create index idx_grupo_alumnos_alumno on grupo_alumnos(alumno_id);
create index idx_examenes_grupo on examenes(grupo_id);
create index idx_preguntas_examen on preguntas(examen_id);
create index idx_opciones_pregunta on opciones(pregunta_id);
create index idx_intentos_alumno on intentos(alumno_id);
create index idx_respuestas_intento on respuestas(intento_id);
create index idx_asistencias_grupo_fecha on asistencias(grupo_id, fecha);
create index idx_tareas_grupo on tareas(grupo_id);
create index idx_calif_tareas_alumno on calificaciones_tareas(alumno_id);
;
