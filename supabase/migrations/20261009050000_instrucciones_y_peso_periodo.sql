-- Dos cosas chicas que pidieron los maestros.

-- 1) Instrucciones aparte del enunciado de la pregunta.
--
-- Hoy las meten en el mismo campo separadas por un salto de linea, por ejemplo
-- "Choose the correct answer\nIt's half past five". Eso se ve mal en pantalla,
-- no se puede dar formato distinto, y obliga a repetir la misma instruccion en
-- cada pregunta del bloque. Con un campo propio la instruccion se muestra
-- arriba, mas chica, y el enunciado queda limpio.
alter table public.preguntas
  add column if not exists instrucciones text;

comment on column public.preguntas.instrucciones is
  'Indicacion que va arriba del enunciado ("Lee y subraya", "Choose the correct answer"). Opcional.';

-- 2) Cuanto vale cada parcial en el promedio del ciclo.
--
-- Antes el promedio del ciclo era el promedio simple de los parciales, asi que
-- todos pesaban igual. En la escuela no es asi: el primero vale 25, el segundo
-- 30 y el tercero el resto. Mismo mecanismo que los rubros: un peso por
-- periodo y el promedio se pondera.
--
-- Default 0 a proposito: con todos los pesos en cero el promedio sigue siendo
-- el simple de siempre, asi que ningun grupo que ya existe cambia de
-- calificacion hasta que su maestro decida ponderar.
alter table public.periodos
  add column if not exists peso numeric not null default 0;

comment on column public.periodos.peso is
  'Peso del periodo en el promedio del ciclo. Si todos los del grupo son 0, se usa promedio simple.';

alter table public.periodos
  add constraint periodo_peso_no_negativo check (peso >= 0) not valid;
