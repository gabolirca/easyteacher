-- Nombres personalizables de los 3 rubros preestablecidos (solo la etiqueta que
-- se ve, el cálculo real sigue siendo el mismo)
alter table profesores add column etiqueta_examenes text not null default 'Exámenes';
alter table profesores add column etiqueta_tareas text not null default 'Tareas';
alter table profesores add column etiqueta_participacion text not null default 'Participación';

-- Participación gana un tercer modo: 'diario' (registro tipo asistencia, un
-- valor por alumno por fecha, que se acumula y se convierte con "corte" —
-- reutiliza exactamente el mismo mecanismo que ya existe para 'fichas').
alter table profesores drop constraint profesores_modo_participacion_check;
alter table profesores add constraint profesores_modo_participacion_check
  check (modo_participacion in ('fichas', 'simple', 'diario'));

-- La tabla participaciones acepta un nuevo "tipo_ficha" genérico para el
-- registro diario (no es una ficha de colores, es solo un valor del día)
alter table participaciones drop constraint participaciones_tipo_ficha_check;
alter table participaciones add constraint participaciones_tipo_ficha_check
  check (tipo_ficha = any (array['verde','azul','roja','blanca','negra','diario']));
;
