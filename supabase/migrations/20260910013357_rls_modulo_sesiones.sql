alter table public.sesiones               enable row level security;
alter table public.sesiones_secreto      enable row level security;
alter table public.actividades_sesion    enable row level security;
alter table public.participaciones_sesion enable row level security;

-- ---------- sesiones ----------
create policy "profesor administra sesiones" on public.sesiones
  for all using (es_profesor_del_grupo(grupo_id))
  with check (es_profesor_del_grupo(grupo_id));

create policy "alumno ve sesiones de sus grupos" on public.sesiones
  for select using (alumno_en_grupo(grupo_id));

-- ---------- sesiones_secreto ----------
-- Solo el profesor duenio. El alumno no tiene NINGUNA politica aqui, asi que
-- con RLS activa no puede leer el secreto ni aunque conozca el id de sesion.
create policy "solo el profesor lee el secreto" on public.sesiones_secreto
  for all using (es_profesor_del_grupo(grupo_id))
  with check (es_profesor_del_grupo(grupo_id));

-- ---------- actividades_sesion ----------
create policy "profesor administra actividades" on public.actividades_sesion
  for all using (es_profesor_del_grupo(grupo_de_sesion(sesion_id)))
  with check (es_profesor_del_grupo(grupo_de_sesion(sesion_id)));

create policy "alumno ve actividades de sus grupos" on public.actividades_sesion
  for select using (alumno_en_grupo(grupo_de_sesion(sesion_id)));

-- ---------- participaciones_sesion ----------
-- El profesor hace todo. El alumno SOLO lee lo suyo: no hay politica de
-- insert, update ni delete para el, asi que no puede regalarse puntos por API.
-- Su reclamo entra exclusivamente por Edge Function con service role.
create policy "profesor administra participaciones de sesion" on public.participaciones_sesion
  for all using (es_profesor_del_grupo(grupo_de_actividad(actividad_id)))
  with check (es_profesor_del_grupo(grupo_de_actividad(actividad_id)));

create policy "alumno ve solo sus participaciones" on public.participaciones_sesion
  for select using (alumno_id = auth.uid());;
