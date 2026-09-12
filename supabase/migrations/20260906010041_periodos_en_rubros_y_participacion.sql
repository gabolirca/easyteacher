-- Rubros personalizados: cada instancia puede ligarse a un periodo (o quedar
-- sin periodo = aplica a todo el ciclo)
alter table rubros_evaluacion add column periodo_id uuid references periodos(id) on delete set null;

-- Cortes de participación (modo fichas): un corte por periodo
alter table cortes_participacion add column periodo_id uuid references periodos(id) on delete set null;

-- Participación modo simple: ahora puede haber una calificación por periodo
alter table participacion_simple add column periodo_id uuid references periodos(id) on delete set null;
alter table participacion_simple drop constraint participacion_simple_grupo_id_alumno_id_key;
alter table participacion_simple add constraint participacion_simple_grupo_alumno_periodo_key unique (grupo_id, alumno_id, periodo_id);
;
