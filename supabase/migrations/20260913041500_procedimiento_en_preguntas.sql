-- Pizarra de procedimiento para preguntas de matematicas.
--
-- El resultado se sigue calificando solo (pregunta tipo "completar"), pero el
-- maestro puede pedir ademas que el alumno muestre COMO llego a el. Eso se
-- dibuja con el dedo y se guarda como imagen; no se intenta reconocer lo
-- escrito, lo revisa el maestro. Asi se parece a un examen de mate en papel
-- sin depender de ningun servicio de reconocimiento ni de la red.
alter table public.preguntas
  add column if not exists pide_procedimiento boolean not null default false;

comment on column public.preguntas.pide_procedimiento is
  'Si es true, al alumno se le muestra una pizarra para dibujar el procedimiento. No afecta la calificacion automatica.';

-- El dibujo viaja junto con las respuestas y se guarda como PNG en data URL.
-- Va en su propia columna para no alterar la forma de respuesta_json, de la
-- que depende la calificacion.
alter table public.respuestas
  add column if not exists procedimiento text;

comment on column public.respuestas.procedimiento is
  'Imagen PNG (data URL) del procedimiento dibujado por el alumno. Null si no se pidio o no dibujo nada.';
