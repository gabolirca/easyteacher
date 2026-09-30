-- Recalifica las respuestas que se marcaron mal por el apostrofe, el
-- superindice y las contracciones. Se corre UNA vez en el SQL Editor de
-- Supabase, despues de desplegar la funcion enviar-respuestas.
--
-- Correr primero el PASO 0 para ver que se va a cambiar.

-- ---------- PASO 0: ver antes de tocar nada ----------
select r.id, e.titulo, q.orden,
       (q.contenido_json->'respuestas')::text as esperaba,
       r.respuesta_json::text                 as escribio,
       r.puntos_obtenidos                     as tiene_ahora,
       q.puntos                               as vale
from public.respuestas r
join public.preguntas q on q.id = r.pregunta_id
join public.intentos  i on i.id = r.intento_id
join public.examenes  e on e.id = i.examen_id
where r.id in (
  'ffc78485-682c-4253-ae98-3f613df208d5',
  '11d60ef0-b5db-45d2-812a-e2700c928bf4',
  '4e7828ce-80c4-477d-ae20-a4c80000a903',
  '7d948e6b-0297-4b3a-9da8-4f3513930651',
  '80a52609-c48d-472c-8562-15427d59bfc6',
  '281f1381-e71f-4e5e-afec-d8bb45f42bd7',
  '44eb7b50-76e1-4ba9-b1bd-dbdb2fa96cf1',
  '98ff9726-24ce-4ef6-8722-103d468eb694',
  '774a0e72-5e57-443f-a90e-e8f971ac0203',
  'db1bbdf4-dd8e-4116-bd7d-0960c1734c48'
)
order by e.titulo, q.orden;


-- ---------- PASO 1: las nueve que quedan con todos los huecos bien ----------
update public.respuestas r
set puntos_obtenidos = q.puntos
from public.preguntas q
where q.id = r.pregunta_id
  and r.id in (
    'ffc78485-682c-4253-ae98-3f613df208d5',
    '11d60ef0-b5db-45d2-812a-e2700c928bf4',
    '4e7828ce-80c4-477d-ae20-a4c80000a903',
    '7d948e6b-0297-4b3a-9da8-4f3513930651',
    '80a52609-c48d-472c-8562-15427d59bfc6',
    '44eb7b50-76e1-4ba9-b1bd-dbdb2fa96cf1',
    '98ff9726-24ce-4ef6-8722-103d468eb694',
    '774a0e72-5e57-443f-a90e-e8f971ac0203',
    'db1bbdf4-dd8e-4116-bd7d-0960c1734c48'
  );

-- ---------- PASO 2: la que acierta 1 de 3 huecos ("don't answer") ----------
update public.respuestas r
set puntos_obtenidos = q.puntos / 3
from public.preguntas q
where q.id = r.pregunta_id
  and r.id = '281f1381-e71f-4e5e-afec-d8bb45f42bd7';

-- ---------- PASO 3: recalcular la calificacion de esos intentos ----------
-- Misma formula que usa la funcion: obtenidos / total del examen, en %.
update public.intentos i
set calificacion = round(
      (select coalesce(sum(x.puntos_obtenidos), 0)
         from public.respuestas x where x.intento_id = i.id)
      / nullif((select sum(q.puntos)
                  from public.preguntas q where q.examen_id = i.examen_id), 0)
      * 1000
    ) / 10
where i.id in (
  select distinct r.intento_id from public.respuestas r
  where r.id in (
    'ffc78485-682c-4253-ae98-3f613df208d5',
    '11d60ef0-b5db-45d2-812a-e2700c928bf4',
    '4e7828ce-80c4-477d-ae20-a4c80000a903',
    '7d948e6b-0297-4b3a-9da8-4f3513930651',
    '80a52609-c48d-472c-8562-15427d59bfc6',
    '281f1381-e71f-4e5e-afec-d8bb45f42bd7',
    '44eb7b50-76e1-4ba9-b1bd-dbdb2fa96cf1',
    '98ff9726-24ce-4ef6-8722-103d468eb694',
    '774a0e72-5e57-443f-a90e-e8f971ac0203',
    'db1bbdf4-dd8e-4116-bd7d-0960c1734c48'
  )
);

-- ---------- PASO 4: comprobar ----------
select e.titulo, i.calificacion
from public.intentos i join public.examenes e on e.id = i.examen_id
where i.id in (
  select distinct r.intento_id from public.respuestas r
  where r.puntos_obtenidos > 0 and r.id in (
    '44eb7b50-76e1-4ba9-b1bd-dbdb2fa96cf1',
    '281f1381-e71f-4e5e-afec-d8bb45f42bd7',
    'ffc78485-682c-4253-ae98-3f613df208d5'
  )
);
