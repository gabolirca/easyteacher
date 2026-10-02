-- Poder "cerrar" las fichas ya contadas, en vez de borrarlas.
--
-- El problema: los puntos de participacion se suman desde siempre. Despues de
-- un corte siguen acumulados, asi que el siguiente corte arranca con todo lo
-- del anterior encima y la referencia tiene que subir cada vez. En el grupo de
-- Tercer Semestre se ve clarito: los cortes fueron de 60, 70 y 150 puntos de
-- referencia, subiendo nada mas porque nadie bajaba a cero.
--
-- La salida no es borrar las fichas: ahi esta el registro de quien participo
-- que dia y con que color, y el maestro lo usa para hablar con los papas. Se
-- marcan como cerradas y dejan de contar para el total vivo.
--
--   cerrada_en is null  ->  cuenta en el ranking de hoy
--   cerrada_en not null ->  ya se la llevo un corte, queda de historia
--
-- Deshacerlo es un update poniendo cerrada_en en null: nada se pierde.
alter table public.participaciones
  add column if not exists cerrada_en timestamptz,
  add column if not exists corte_id uuid references public.cortes_participacion(id) on delete set null;

comment on column public.participaciones.cerrada_en is
  'Cuando dejo de contar para el total vivo. Null = sigue contando.';
comment on column public.participaciones.corte_id is
  'Que corte se la llevo. Null si se limpio a mano sin corte de por medio.';

-- El ranking pregunta siempre por las que siguen contando, asi que el indice
-- es parcial: solo indexa esas y se mantiene chico.
create index if not exists participaciones_vivas_por_grupo
  on public.participaciones (grupo_id, alumno_id)
  where cerrada_en is null;
