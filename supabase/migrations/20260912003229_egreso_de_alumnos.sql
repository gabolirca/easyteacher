-- Egresar no es borrar. El alumno y todo su historial se quedan; lo que se
-- libera es la matricula y el correo, para que otra persona pueda usarlos
-- cuando el colegio recicle numeros.
alter table public.alumnos
  add column if not exists activo       boolean not null default true,
  add column if not exists ciclo_egreso text,
  add column if not exists fecha_egreso timestamptz;

comment on column public.alumnos.activo is
  'false = egresado. Su matricula queda libre para otra persona, pero su historial permanece.';

-- La unicidad de matricula pasa a aplicar SOLO entre alumnos activos. Sin
-- esto, un egresado bloquearia su numero para siempre y la maestra no podria
-- dar de alta al alumno nuevo que lo reciba. Era un callejon sin salida con
-- fecha: el dia que el colegio reciclara su primera matricula.
alter table public.alumnos drop constraint if exists alumnos_matricula_key;

create unique index if not exists alumnos_matricula_activa
  on public.alumnos (matricula) where activo and matricula is not null;

create index if not exists alumnos_por_estado on public.alumnos (activo);;
