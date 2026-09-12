create policy "profesor reactiva intentos de sus examenes" on intentos for delete using (
  exists (select 1 from examenes e where e.id = intentos.examen_id and es_profesor_del_grupo(e.grupo_id))
);
;
