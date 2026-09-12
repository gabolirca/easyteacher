-- El alumno pasa a pertenecer a UN maestro.
--
-- Motivo: AulaFacil no es el control escolar del colegio, es la herramienta
-- de cada maestro. Las maestras no tienen las matriculas reales de sus
-- alumnos, y la app hasta genera matriculas al azar — asi que la identidad
-- global nunca pudo funcionar: buscaba por un numero que cada quien inventa.
-- En la practica el sistema ya operaba per-maestro, solo que con un espacio
-- de nombres compartido que podia chocar sin avisar.
--
-- Beneficio extra: cada alumno tiene credencial distinta por clase, asi que
-- una contrasenia prestada solo compromete una materia, no todas.
alter table public.alumnos
  add column if not exists profesor_id  uuid references public.profesores(id) on delete set null,
  add column if not exists correo_login text;

comment on column public.alumnos.profesor_id is
  'Maestro duenio de este registro. La matricula es unica por maestro, no por sistema.';
comment on column public.alumnos.correo_login is
  'Con que correo entra el alumno. Se guarda para que el maestro pueda darselo: si hubo choque de matricula, lleva sufijo.';

-- Backfill del duenio. Hoy cada alumno tiene exactamente un maestro, asi que
-- se deduce sin ambiguedad. Esta migracion es trivial ahora y se volveria un
-- problema el dia que alguien este con dos maestros.
update public.alumnos a
   set profesor_id = sub.profesor_id
  from (
    select ga.alumno_id, min(g.profesor_id::text)::uuid as profesor_id
      from public.grupo_alumnos ga
      join public.grupos g on g.id = ga.grupo_id
     group by ga.alumno_id
  ) sub
 where sub.alumno_id = a.id and a.profesor_id is null;

-- Backfill del correo de login desde Auth, para que el maestro pueda verlo.
update public.alumnos a
   set correo_login = u.email
  from auth.users u
 where u.id = a.id and a.correo_login is null;

-- La matricula pasa a ser unica POR MAESTRO, entre alumnos activos.
drop index if exists public.alumnos_matricula_activa;

create unique index if not exists alumnos_matricula_por_maestro
  on public.alumnos (profesor_id, matricula)
  where activo and matricula is not null and profesor_id is not null;

create index if not exists alumnos_por_profesor on public.alumnos (profesor_id);

-- El maestro ve y edita a SUS alumnos, aunque todavia no esten en un grupo.
create policy "profesor administra sus alumnos" on public.alumnos
  for all using (profesor_id = auth.uid())
  with check (profesor_id = auth.uid());;
