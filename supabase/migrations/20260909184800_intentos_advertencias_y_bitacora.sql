-- Contador de advertencias del lado del servidor: sobrevive a que el alumno
-- recargue la pagina, asi que no se puede "resetear" recargando.
alter table public.intentos
  add column if not exists advertencias integer not null default 0;

-- Bitacora de cada vez que se detecto una salida de la pantalla del examen.
-- Cada entrada: { ts, tipo, online, conto }
--   tipo   = 'visibilitychange' | 'fullscreenchange' | 'blur'
--   online = si el dispositivo tenia conexion en ese momento
--   conto  = si se conto como advertencia (las salidas sin red no cuentan)
-- Sirve para que el profesor juzgue si un bloqueo fue real o fue la red.
alter table public.intentos
  add column if not exists eventos_salida jsonb not null default '[]'::jsonb;

comment on column public.intentos.advertencias is
  'Numero de advertencias reales acumuladas por salir de la pantalla del examen.';
comment on column public.intentos.eventos_salida is
  'Bitacora de eventos de salida detectados, incluidos los descartados por falta de red.';;
