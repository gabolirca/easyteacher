-- Activar RLS en todas las tablas
alter table profesores enable row level security;
alter table alumnos enable row level security;
alter table grupos enable row level security;
alter table grupo_alumnos enable row level security;
alter table examenes enable row level security;
alter table preguntas enable row level security;
alter table opciones enable row level security;
alter table intentos enable row level security;
alter table respuestas enable row level security;
alter table asistencias enable row level security;
alter table tareas enable row level security;
alter table calificaciones_tareas enable row level security;

-- Función auxiliar: ¿el usuario actual es el profesor dueño de este grupo?
create or replace function es_profesor_del_grupo(g_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from grupos where id = g_id and profesor_id = auth.uid()
  );
$$;

-- Función auxiliar: ¿el alumno actual pertenece a este grupo?
create or replace function alumno_en_grupo(g_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from grupo_alumnos where grupo_id = g_id and alumno_id = auth.uid()
  );
$$;

-- PROFESORES: cada profesor ve/edita solo su propio perfil
create policy "profesor ve su perfil" on profesores for select using (id = auth.uid());
create policy "profesor edita su perfil" on profesores for update using (id = auth.uid());

-- ALUMNOS: el alumno ve su propio perfil; el profesor ve a los alumnos de sus grupos
create policy "alumno ve su perfil" on alumnos for select using (id = auth.uid());
create policy "profesor ve alumnos de sus grupos" on alumnos for select using (
  exists (select 1 from grupo_alumnos ga join grupos g on g.id = ga.grupo_id where ga.alumno_id = alumnos.id and g.profesor_id = auth.uid())
);
create policy "profesor crea alumnos" on alumnos for insert with check (true);

-- GRUPOS: el profesor dueño ve/edita sus grupos; los alumnos inscritos pueden ver el grupo
create policy "profesor administra sus grupos" on grupos for all using (profesor_id = auth.uid());
create policy "alumno ve su grupo" on grupos for select using (alumno_en_grupo(id));

-- GRUPO_ALUMNOS: el profesor del grupo administra inscripciones; el alumno ve las suyas
create policy "profesor administra inscripciones" on grupo_alumnos for all using (es_profesor_del_grupo(grupo_id));
create policy "alumno ve su inscripcion" on grupo_alumnos for select using (alumno_id = auth.uid());

-- EXAMENES: el profesor del grupo administra; el alumno del grupo puede ver el examen (metadatos)
create policy "profesor administra examenes" on examenes for all using (es_profesor_del_grupo(grupo_id));
create policy "alumno ve examenes de su grupo" on examenes for select using (alumno_en_grupo(grupo_id));

-- PREGUNTAS: el profesor dueño del examen administra
create policy "profesor administra preguntas" on preguntas for all using (
  exists (select 1 from examenes e where e.id = preguntas.examen_id and es_profesor_del_grupo(e.grupo_id))
);
-- El alumno puede ver el texto de la pregunta de un examen de su grupo (sin tocar es_correcta de opciones, ver nota abajo)
create policy "alumno ve preguntas de su examen" on preguntas for select using (
  exists (select 1 from examenes e where e.id = preguntas.examen_id and alumno_en_grupo(e.grupo_id))
);

-- OPCIONES: el profesor administra. OJO: por ahora el alumno NO tiene policy de select aqui.
-- Esto es intencional: la app del alumno debe leer las opciones a traves de una funcion/vista
-- que oculte "es_correcta" mientras el intento este en curso, en vez de leer la tabla directo.
create policy "profesor administra opciones" on opciones for all using (
  exists (select 1 from preguntas p join examenes e on e.id = p.examen_id where p.id = opciones.pregunta_id and es_profesor_del_grupo(e.grupo_id))
);

-- INTENTOS: alumno ve/crea/actualiza solo su propio intento (no puede tocar calificacion, eso se controla a nivel columna despues); profesor ve intentos de sus grupos
create policy "alumno administra su intento" on intentos for all using (alumno_id = auth.uid());
create policy "profesor ve intentos de sus examenes" on intentos for select using (
  exists (select 1 from examenes e where e.id = intentos.examen_id and es_profesor_del_grupo(e.grupo_id))
);

-- RESPUESTAS: el alumno administra sus propias respuestas dentro de su intento
create policy "alumno administra sus respuestas" on respuestas for all using (
  exists (select 1 from intentos i where i.id = respuestas.intento_id and i.alumno_id = auth.uid())
);
create policy "profesor ve respuestas de sus examenes" on respuestas for select using (
  exists (select 1 from intentos i join examenes e on e.id = i.examen_id where i.id = respuestas.intento_id and es_profesor_del_grupo(e.grupo_id))
);

-- ASISTENCIAS: el profesor del grupo administra; el alumno ve solo la suya
create policy "profesor administra asistencias" on asistencias for all using (es_profesor_del_grupo(grupo_id));
create policy "alumno ve su asistencia" on asistencias for select using (alumno_id = auth.uid());

-- TAREAS: el profesor del grupo administra; el alumno del grupo ve las tareas
create policy "profesor administra tareas" on tareas for all using (es_profesor_del_grupo(grupo_id));
create policy "alumno ve tareas de su grupo" on tareas for select using (alumno_en_grupo(grupo_id));

-- CALIFICACIONES_TAREAS: el profesor administra; el alumno ve solo la suya
create policy "profesor administra calificaciones de tareas" on calificaciones_tareas for all using (
  exists (select 1 from tareas t where t.id = calificaciones_tareas.tarea_id and es_profesor_del_grupo(t.grupo_id))
);
create policy "alumno ve su calificacion de tarea" on calificaciones_tareas for select using (alumno_id = auth.uid());
;
