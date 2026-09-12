-- Antes el alumno podía hacer UPDATE libre sobre su propio intento (incluyendo
-- calificacion y estado) porque la policy era "for all". La cerramos a solo
-- lectura: crear/calificar/cerrar el intento ahora pasa por Edge Functions
-- con privilegios de servidor, nunca directo desde el navegador del alumno.
drop policy if exists "alumno administra su intento" on intentos;
create policy "alumno ve su intento" on intentos for select using (alumno_id = auth.uid());

drop policy if exists "alumno administra sus respuestas" on respuestas;
create policy "alumno ve sus respuestas" on respuestas for select using (
  exists (select 1 from intentos i where i.id = respuestas.intento_id and i.alumno_id = auth.uid())
);

-- Para "relacionar": aquí guardamos, por pregunta, qué id-opaco visible para
-- el alumno corresponde a qué índice real correcto. Se genera una vez por
-- intento y se usa para calificar sin que el alumno la haya visto nunca.
alter table intentos add column mapeo_relacionar jsonb not null default '{}'::jsonb;
;
