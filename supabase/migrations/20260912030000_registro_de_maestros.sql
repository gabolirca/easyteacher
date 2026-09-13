-- Quien puede crearse cuenta de MAESTRO en esta instancia.
--
-- Hasta ahora el registro estaba abierto: cualquiera que llegara a login.html
-- podia darse de alta como profesor. En la instancia de una escuela eso
-- significa que un alumno con el enlace puede crearse cuenta de maestro. No
-- veria datos ajenos (la RLS lo impide) pero ahi estaria.
--
-- La tabla VACIA no restringe nada, para no cambiarle el comportamiento a
-- ninguna instancia al aplicar esta migracion. En cuanto se agrega el primer
-- renglon, el registro queda limitado a lo que diga.
--
-- Cada renglon es un dominio ('cpdg.edu.mx') o un correo completo
-- ('director@gmail.com') para las excepciones.
create table if not exists public.registro_permitido (
  valor      text primary key,
  nota       text,
  created_at timestamptz not null default now(),
  constraint valor_razonable check (valor = lower(btrim(valor)) and length(valor) > 3 and valor !~ '^@')
);

comment on table public.registro_permitido is
  'Dominios o correos que pueden crear cuenta de maestro. Vacia = sin restriccion.';

-- Se administra desde el panel de Supabase. Sin policies y con RLS activa,
-- ni anon ni authenticated pueden leerla ni escribirla.
alter table public.registro_permitido enable row level security;

create or replace function public.validar_registro_maestro()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  correo text := lower(coalesce(new.email, ''));
begin
  -- Solo se filtra el alta de maestros. Los alumnos los crea el servidor con
  -- la Edge Function crear-alumnos y su correo es interno
  -- (@alumnos.easyteacher.app), asi que nunca debe pasar por esta regla.
  if coalesce(new.raw_user_meta_data->>'rol', '') <> 'profesor' then
    return new;
  end if;

  if not exists (select 1 from public.registro_permitido) then
    return new;                       -- instancia sin restriccion configurada
  end if;

  -- Comparacion exacta del dominio con split_part en vez de LIKE: asi
  -- 'alguien@nocpdg.edu.mx' no se cuela, y un guion bajo en el dominio no se
  -- interpreta como comodin.
  if exists (
    select 1 from public.registro_permitido r
     where correo = r.valor
        or split_part(correo, '@', 2) = r.valor
  ) then
    return new;
  end if;

  raise exception 'Ese correo no puede crear cuenta de maestro en esta escuela'
    using errcode = 'check_violation';
end;
$$;

drop trigger if exists validar_registro_maestro on auth.users;
create trigger validar_registro_maestro
  before insert on auth.users
  for each row execute function public.validar_registro_maestro();
