# Módulo de sesiones y participación digital

Diseño previo a construir. 9 de septiembre de 2026.

## Decisiones tomadas

| Decisión | Elegido |
|---|---|
| Denominador del porcentaje | Sesiones donde se le esperaba (excluye faltas justificadas) |
| Relación con modos actuales | Reemplaza a `diario`. Quedan: `fichas`, `sesiones`, `tarea` |
| Momento de registro | Durante la clase, en el celular del maestro |
| Quién marca | El alumno reclama, el maestro valida |
| Lista inicial | Lo elige el maestro por actividad (vacía o todos marcados) |

Migración: solo existe **1 registro** con `tipo_ficha='diario'` y un maestro en ese
modo. El reemplazo no afecta a nadie en producción.

---

## Principio

AulaFácil no guarda la actividad académica, solo el marcador. La clase ocurre en
el salón; aquí solo vive *quién participó, en qué, cuánto vale y cuándo*.

---

## Modelo de datos

```sql
-- Una clase concreta. Contenedor de todo lo demás.
create table sesiones (
  id           uuid primary key default gen_random_uuid(),
  grupo_id     uuid not null references grupos(id) on delete cascade,
  periodo_id   uuid references periodos(id),
  fecha        date not null default current_date,
  inicio       timestamptz not null default now(),
  fin          timestamptz,
  estado       text not null default 'activa',   -- activa | cerrada
  secreto      text not null default encode(gen_random_bytes(16),'hex'),
  nota         text,
  created_at   timestamptz not null default now()
);

-- Un grupo no puede tener dos sesiones abiertas a la vez.
create unique index sesiones_una_activa_por_grupo
  on sesiones (grupo_id) where estado = 'activa';

-- Lo que el maestro hizo en clase. Sin contenido, solo nombre y valor.
create table actividades_sesion (
  id         uuid primary key default gen_random_uuid(),
  sesion_id  uuid not null references sesiones(id) on delete cascade,
  nombre     text not null,
  valor      numeric not null default 1,
  orden      int not null default 0,
  abierta    boolean not null default true,   -- mientras esté abierta se puede reclamar
  inicio_marcado text not null default 'vacia', -- vacia | todos
  created_at timestamptz not null default now()
);

-- El evento: este alumno realizó esta actividad.
-- Nace 'pendiente' cuando la origina el alumno y NO vale puntos hasta que el
-- maestro la aprueba. Solo las 'aprobada' entran al cálculo del periodo.
create table participaciones_sesion (
  id             uuid primary key default gen_random_uuid(),
  actividad_id   uuid not null references actividades_sesion(id) on delete cascade,
  alumno_id      uuid not null references alumnos(id) on delete cascade,
  puntos         numeric not null default 0,  -- lo pone el servidor al aprobar
  estado         text not null default 'pendiente', -- pendiente|aprobada|rechazada
  origen         text not null default 'alumno',    -- alumno|maestro
  registrado_por uuid references profesores(id),
  created_at     timestamptz not null default now(),
  resuelto_en    timestamptz,
  unique (actividad_id, alumno_id)
);
```

`puntos` se copia a propósito: si el maestro corrige el valor de la actividad
después, no se recalculan retroactivamente calificaciones ya emitidas. Es el
mismo criterio de foto fija que ya usan los cortes de participación.

### Asistencia: una sola fuente de verdad

El escaneo del QR **escribe en `asistencias`**, no en una tabla nueva. Se le
agregan dos columnas:

```sql
alter table asistencias
  add column sesion_id uuid references sesiones(id),
  add column origen text not null default 'manual';   -- manual | qr
```

Y `estado` acepta un valor más: `justificada`, además de los actuales
`presente`, `retardo`, `falta`. Sin ese valor el denominador no se puede
calcular con honestidad.

---

## La regla del denominador

Para un alumno y un periodo:

- **Puntos posibles** = suma del `valor` de todas las actividades de las
  sesiones **cerradas** del periodo, **excepto** aquellas donde la asistencia
  del alumno sea `justificada`.
- **Puntos obtenidos** = suma de sus `participaciones_sesion` en esas sesiones.
- **Participación** = obtenidos / posibles, convertido a escala 0-10.

Consecuencias buscadas:

- Faltar sin justificar **sí** baja el porcentaje (las actividades cuentan en el
  denominador aunque no estuvieras).
- Faltar con justificante **no** castiga ni premia: esas actividades salen de
  ambos lados.
- Ir a clase y no participar baja el porcentaje, como debe ser.

Si `puntos posibles = 0` (periodo sin sesiones cerradas), la participación no se
computa en vez de dar 0 — para no hundir promedios al inicio del parcial.

---

## QR rotativo

Un QR fijo se fotografía y se manda por WhatsApp: un compañero desde su casa
queda presente. Se resuelve con rotación, sin exponer secretos en el navegador
del alumno:

1. La sesión guarda un `secreto` aleatorio. RLS deja leerlo **solo al maestro
   dueño del grupo**.
2. La pantalla del maestro lo lee una vez al abrir la sesión y calcula, con Web
   Crypto y sin red, `codigo = HMAC(secreto, ventana)` donde
   `ventana = floor(epoch / 20)`. Regenera el QR cada 20 segundos.
3. El alumno escanea. La Edge Function `registrar-presencia` recalcula el HMAC
   con el secreto leído por service-role y acepta solo si la ventana está
   dentro de ±1 (tolerancia de ~40 s por desfase de reloj).

Una captura de pantalla caduca antes de llegar al compañero.

**El QR abre una URL directamente** (`panel-alumno.html?s=...&v=...&c=...`), así
que se escanea con la cámara nativa del teléfono. No hace falta construir un
lector con permisos de cámara dentro de la app — eso puede venir después.

---

## Flujo de reclamo y validación

1. El maestro crea la actividad y queda **abierta**. Elige si la lista de
   revisión arranca vacía o con todos los presentes marcados (`inicio_marcado`),
   según si lo normal en ese ejercicio es que participen pocos o casi todos.
2. El alumno toca "yo lo hice". Se inserta una fila `pendiente`, con
   `puntos = 0`. El alumno **nunca** manda el valor.
3. El reclamo solo se acepta si: la actividad sigue abierta, el alumno tiene
   presencia registrada en esa sesión, y no había reclamado antes.
4. El maestro ve la lista en vivo con nombres, no solo el contador. Quita a
   quien no participó de un toque.
5. Al cerrar la actividad, las filas que quedan pasan a `aprobada` y el servidor
   les copia `puntos = actividades_sesion.valor`. Las quitadas quedan
   `rechazada`, con historial.

La actividad cerrada ya no acepta reclamos. Eso es lo que evita que alguien se
sume después de que el maestro revisó.

### Por qué esto no es un sello de goma

El riesgo del auto-reclamo es que el maestro apruebe 34 de 35 sin mirar y la
evidencia pierda sentido. Tres cosas lo contienen:

- Solo puede reclamar quien está presente en el salón.
- La ventana es corta: la actividad se cierra cuando el ejercicio termina.
- El maestro ve nombres. Si vio participar a 27 y hay 34 reclamos, los 7 de más
  saltan a la vista, y están ahí enfrente.

## Reglas de RLS

El punto crítico: **el alumno nunca inserta sus propios puntos**.

| Tabla | Alumno | Maestro |
|---|---|---|
| `sesiones` | lee las de sus grupos, sin `secreto` | todo, en sus grupos |
| `actividades_sesion` | lee las de sus grupos | todo, en sus grupos |
| `participaciones_sesion` | lee **solo las suyas** | todo, en sus grupos |
| `actividades_sesion.abierta` | lee | escribe (abre/cierra) |
| `asistencias` | lee solo las suyas | todo, en sus grupos |

`participaciones_sesion` **no tiene política de insert para alumnos**. Un alumno
origina dos cosas —su presencia y su reclamo— y **ambas van por Edge Function**,
nunca por API directa. El alumno no puede escribir `puntos` ni `estado`: los
pone el servidor. Aprobar y rechazar es exclusivo del maestro.
El `secreto` se excluye con una vista o con `select` explícito de columnas.

---

## Offline desde el día uno

Este módulo pide red en el peor momento: 35 alumnos escaneando a la vez y el
maestro registrando en vivo. Con la red del colegio eso falla.

- **Maestro**: cada marca de participación entra a una cola local
  (localStorage) y se sincroniza en cuanto hay señal. La pantalla nunca se
  bloquea esperando al servidor. Mismo patrón que ya quedó en el examen.
- **Alumno**: si el escaneo no alcanza a validarse, se guarda el código y se
  reintenta. La presencia se registra con el timestamp original, no el de
  sincronización.
- El service worker ya cachea el shell, así que la pantalla abre sin red.

---

## Integración con calificaciones

`calificaciones.js` gana una rama para `modo_participacion = 'sesiones'`, que
calcula el porcentaje con la regla de arriba en vez de usar
`cortes_participacion`. El resto —ponderación, parciales, resumen del ciclo,
export a Excel— no cambia.

---

## Fases

**Fase 1 — lo que elimina el trabajo manual**

- Tablas, RLS y Edge Functions
- Pantalla del maestro: abrir sesión, mostrar QR rotativo, agregar actividad,
  marcar quién participó (lista buscable, toque grande, cola offline), cerrar
- Pantalla del alumno: escanear y ver sus puntos de hoy
- Integración con calificaciones finales

**Fase 2 — comodidad**

- Panel del alumno completo: historial de sesiones, resumen del periodo
- Lector de QR dentro de la app
- Reabrir una sesión cerrada para corregir

---

## Pendientes de definir

- ¿Qué pasa si el maestro olvida cerrar la sesión? Propuesta: una sesión con
  `fin` nulo cuya `fecha` ya pasó se trata como cerrada para los cálculos.
- ¿El maestro puede corregir después de cerrar? La fase 2 lo contempla, pero
  hay que decidir si eso recalcula calificaciones ya vistas por el alumno.
- ¿Qué pasa con los reclamos pendientes si el maestro cierra la sesión sin
  revisar una actividad? Propuesta: se aprueban por omisión y se avisa en el
  resumen de cierre, para no castigar al alumno por un descuido del maestro.
