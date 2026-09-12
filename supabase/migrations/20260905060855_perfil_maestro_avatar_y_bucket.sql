-- Perfil del profesor: tipo (grupo/materia) y foto
alter table profesores add column tipo_maestro text check (tipo_maestro in ('grupo','materia'));
alter table profesores add column avatar_url text;

-- Bucket público para fotos de perfil
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Lectura pública (para que <img src> funcione sin sesión)
create policy "avatars son publicas para leer"
on storage.objects for select
using (bucket_id = 'avatars');

-- Cada quien solo puede subir/actualizar/borrar dentro de su propia carpeta
-- (el path esperado es "{user_id}/algo.png")
create policy "usuario sube su propio avatar"
on storage.objects for insert
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "usuario actualiza su propio avatar"
on storage.objects for update
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "usuario borra su propio avatar"
on storage.objects for delete
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
;
