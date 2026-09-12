create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.raw_user_meta_data->>'role' = 'profesor' then
    insert into public.profesores (id, nombre, correo)
    values (new.id, coalesce(new.raw_user_meta_data->>'nombre', ''), new.email);

  elsif new.raw_user_meta_data->>'role' = 'alumno' then
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
;
