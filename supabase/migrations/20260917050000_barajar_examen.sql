-- Orden aleatorio de preguntas y de opciones, por alumno.
--
-- Sirve contra la copia entre compañeros: si a cada quien le toca distinto
-- orden, ver la pantalla del de al lado (o una captura que circule) deja de
-- servir, porque "la 3" no es la misma pregunta para los dos.
--
-- Va apagado por defecto: hay exámenes donde el orden importa porque una
-- pregunta se apoya en la anterior.
alter table public.examenes
  add column if not exists barajar_preguntas boolean not null default false,
  add column if not exists barajar_opciones  boolean not null default false;

comment on column public.examenes.barajar_preguntas is
  'Cada alumno recibe las preguntas en un orden distinto, estable para su intento.';
comment on column public.examenes.barajar_opciones is
  'Baraja las opciones de las preguntas de opcion multiple. No aplica a verdadero/falso.';
