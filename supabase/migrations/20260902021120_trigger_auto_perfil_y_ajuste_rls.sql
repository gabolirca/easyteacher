-- Al crearse un usuario en auth.users, esta función arma su fila de perfil
-- (profesores o alumnos) según el "rol" que traiga en los metadatos.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.raw_user_meta_data->>'rol') = 'profesor' then
    insert into public.profesores (id, nombre, correo)
    values (new.id, coalesce(new.raw_user_meta_data->>'nombre', ''), new.email);
  elsif (new.raw_user_meta_data->>'rol') = 'alumno' then
    insert into public.alumnos (id, nombre, matricula, genero, creado_por)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'nombre', ''),
      new.raw_user_meta_data->>'matricula',
      new.raw_user_meta_data->>'genero',
      coalesce(new.raw_user_meta_data->>'creado_por', 'profesor')
    );
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Ya no se necesita insertar "alumnos" directo desde el cliente:
-- el trigger de arriba lo hace con privilegios elevados al crearse el usuario.
-- Esa policy dejaba insertar filas de alumno a cualquiera (with check true) — se quita.
drop policy if exists "profesor crea alumnos" on alumnos;
;
