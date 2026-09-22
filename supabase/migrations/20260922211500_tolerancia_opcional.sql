-- ============================================================
-- La tolerancia de retardo deja de ser automatica
-- ============================================================
-- Antes toda clase nacia con 5 minutos de tolerancia y eso marcaba retardo
-- solo. No es lo que se quiere: el retardo tiene que ser una decision del
-- maestro al iniciar la clase, no algo que pase sin que nadie lo pida.
--
-- Ahora la columna admite NULL, y NULL significa "esta clase no maneja
-- retardos": quien escanea queda presente sin importar la hora. Un numero
-- significa "pasados esos minutos, retardo".

alter table public.sesiones alter column tolerancia_min drop default;
alter table public.sesiones alter column tolerancia_min drop not null;

-- Ninguna clase existente eligio tolerancia: el 5 se lo puso el default.
-- Se limpia para que ninguna quede con una regla que su maestro no pidio.
update public.sesiones set tolerancia_min = null where tolerancia_min = 5;

alter table public.sesiones drop constraint if exists sesiones_tolerancia_valida;
alter table public.sesiones
  add constraint sesiones_tolerancia_valida
  check (tolerancia_min is null or (tolerancia_min >= 1 and tolerancia_min <= 240));

comment on column public.sesiones.tolerancia_min is
  'Minutos de gracia desde el inicio de la clase. NULL = esta clase no marca retardos; quien escanea queda presente.';
