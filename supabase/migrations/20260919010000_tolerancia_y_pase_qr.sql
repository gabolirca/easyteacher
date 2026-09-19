-- ============================================================
-- Tolerancia de retardo por sesion
-- ============================================================
-- El 18/09 la clase de 3B se quedo sin asistencia: el QR vive 60 s y el
-- alumno que no tenia sesion iniciada gastaba mas que eso tecleando su
-- matricula y su contrasena. Cuando por fin llegaba la peticion, el codigo
-- ya habia expirado (85 de 89 intentos rechazados con 403).
--
-- Aqui va solo la parte de datos. El "pase de entrada" que arregla lo
-- anterior no necesita tabla: se firma con el secreto que la sesion ya tiene.

alter table public.sesiones
  add column if not exists tolerancia_min integer not null default 5;

comment on column public.sesiones.tolerancia_min is
  'Minutos de gracia desde el inicio de la clase. Quien escanea despues queda con retardo en vez de presente.';

alter table public.sesiones drop constraint if exists sesiones_tolerancia_valida;
alter table public.sesiones
  add constraint sesiones_tolerancia_valida check (tolerancia_min >= 0 and tolerancia_min <= 240);
