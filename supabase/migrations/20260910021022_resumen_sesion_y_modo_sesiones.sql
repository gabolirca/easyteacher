-- Resumen congelado al cerrar la clase. Se guarda en vez de recalcularse para
-- que sea evidencia estable: si despues se corrige algo, el resumen sigue
-- diciendo lo que se vio ese dia. Mismo criterio que los cortes y los puntos.
alter table public.sesiones
  add column if not exists total_alumnos    integer,
  add column if not exists presentes        integer,
  add column if not exists participaciones  integer,
  add column if not exists puntos_generados numeric;

comment on column public.sesiones.presentes is
  'Foto fija al cerrar: cuantos alumnos tenian asistencia presente/retardo.';
comment on column public.sesiones.participaciones is
  'Foto fija al cerrar: participaciones aprobadas en toda la sesion.';

-- El modo 'diario' se reemplaza por 'sesiones' (clase en vivo con QR).
-- El CHECK tenia la lista vieja de modos, hay que ampliarlo antes de migrar.
alter table public.profesores drop constraint if exists profesores_modo_participacion_check;

update public.profesores
   set modo_participacion = 'sesiones'
 where modo_participacion = 'diario';

alter table public.profesores
  add constraint profesores_modo_participacion_check
  check (modo_participacion = any (array['fichas'::text, 'simple'::text, 'sesiones'::text]));;
