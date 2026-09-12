create policy "profesor edita alumnos de sus grupos" on alumnos for update using (
  exists (
    select 1 from grupo_alumnos ga
    join grupos g on g.id = ga.grupo_id
    where ga.alumno_id = alumnos.id and g.profesor_id = auth.uid()
  )
);
;
