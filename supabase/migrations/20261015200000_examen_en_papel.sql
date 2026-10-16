-- Examenes en papel calificados con foto.
--
-- El maestro aplica su examen impreso de siempre; los alumnos contestan en
-- una hoja de respuestas con burbujas y un QR, y el maestro les toma foto con
-- el celular. La foto se lee en el telefono (no se sube a ningun lado) y lo
-- que se confirma se guarda como un intento normal, asi que la calificacion
-- cae en resultados y en calificaciones finales como cualquier examen.

-- Un examen "en papel" solo tiene la clave: sus preguntas no se contestan en
-- linea (nunca pasa a 'abierto', asi que iniciar-examen no lo sirve).
alter table public.examenes
  add column if not exists modo text not null default 'en_linea';
alter table public.examenes
  add constraint examen_modo_valido check (modo in ('en_linea', 'papel'));

-- De donde salio cada intento: contestado en linea o leido de una hoja.
-- Los de hoja pueden traer puntos puestos a mano (preguntas abiertas); el
-- recalificador los respeta.
alter table public.intentos
  add column if not exists origen text not null default 'en_linea';
alter table public.intentos
  add constraint intento_origen_valido check (origen in ('en_linea', 'hoja'));
alter table public.intentos
  add column if not exists capturado_por uuid references public.profesores(id);

comment on column public.intentos.origen is
  'en_linea = lo contesto el alumno en la app; hoja = lo capturo el maestro desde la foto de una hoja de respuestas.';
