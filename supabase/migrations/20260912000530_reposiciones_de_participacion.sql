-- Reposicion: el alumno no participo el dia de la clase, pero repone despues.
--
-- NO se reabre la sesion cerrada. Su resumen congelado (presentes,
-- participaciones, puntos) queda intacto como evidencia de lo que paso ese
-- dia. La reposicion se agrega como un renglon aparte, con su motivo, su
-- porcentaje y su propia fecha (created_at). El registro sigue diciendo la
-- verdad: este alumno no participo en clase, repuso despues, al X%.
alter table public.participaciones_sesion
  add column if not exists motivo_reposicion     text,
  add column if not exists porcentaje_reposicion numeric;

alter table public.participaciones_sesion drop constraint if exists participaciones_origen_valido;
alter table public.participaciones_sesion
  add constraint participaciones_origen_valido
  check (origen in ('alumno', 'maestro', 'reposicion'));

-- Una reposicion siempre trae motivo y porcentaje; lo que no es reposicion,
-- nunca los trae. Asi no puede quedar una fila a medias.
alter table public.participaciones_sesion drop constraint if exists reposicion_coherente;
alter table public.participaciones_sesion
  add constraint reposicion_coherente check (
    (origen = 'reposicion' and motivo_reposicion is not null and porcentaje_reposicion is not null)
    or
    (origen <> 'reposicion' and motivo_reposicion is null and porcentaje_reposicion is null)
  );

alter table public.participaciones_sesion drop constraint if exists motivo_reposicion_valido;
alter table public.participaciones_sesion
  add constraint motivo_reposicion_valido
  check (motivo_reposicion is null or motivo_reposicion in ('justificada', 'tardia'));

alter table public.participaciones_sesion drop constraint if exists porcentaje_reposicion_valido;
alter table public.participaciones_sesion
  add constraint porcentaje_reposicion_valido
  check (porcentaje_reposicion is null or (porcentaje_reposicion > 0 and porcentaje_reposicion <= 100));

comment on column public.participaciones_sesion.motivo_reposicion is
  'justificada = falto con justificante; tardia = entrego despues. Null si no es reposicion.';

-- Porcentajes por defecto, por grupo. Se rellenan solos segun el motivo y el
-- maestro puede cambiarlos en el caso concreto: la norma queda pareja y la
-- excepcion es deliberada, no distraida.
alter table public.grupos
  add column if not exists repo_pct_justificada numeric not null default 100,
  add column if not exists repo_pct_tardia      numeric not null default 50;;
