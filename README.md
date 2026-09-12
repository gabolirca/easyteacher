# AulaFácil

Plataforma web del **Colegio Pedro de Gante** para que los maestros apliquen
exámenes, tomen asistencia, registren participación y saquen calificaciones
finales a Excel.

Nació como herramienta para un solo profesor y creció a proyecto de estadía:
hoy soporta varios maestros, cada uno con su propia forma de calificar.

- **Frontend**: HTML + JavaScript puro, sin framework.
- **Backend**: Supabase (Postgres + Auth + Storage + Edge Functions).
- **Hosting actual**: GitHub Pages — https://gabolirca.github.io/easyteacher/

## Qué resuelve

| Módulo | Para qué |
|---|---|
| Exámenes | 4 tipos de pregunta, link + QR, bloqueo anti-copia, calificación automática |
| Asistencia | Pase de lista por fecha, o automático por QR en las sesiones |
| Tareas | Crear con peso y calificar en lote |
| Participación | Tres modos según el maestro (ver abajo) |
| Rubros | Categorías propias del maestro, ej. "Conducta" |
| Periodos | Parciales del ciclo, todo se puede ligar a uno |
| Calificaciones | Ponderación editable, desglose por parcial, export a Excel |

## Los tres modos de participación

Cada maestro elige uno en su perfil, y solo ve la pestaña de ese modo.

- **Fichas** — el juego de fichas de casino (verde/azul/roja/blanca con valor
  editable, negra como multiplicador). Usa "corte": ranking de mayor a menor,
  el maestro elige un valor de referencia y de ahí sale la calificación.
- **Clase en vivo** — el maestro abre la sesión, muestra un QR que rota cada
  20 s, los alumnos escanean para registrar presencia y marcan qué actividades
  hicieron; el maestro valida de un toque. Los puntos se acumulan y se
  convierten a porcentaje al cerrar el parcial.
- **Formato tarea** — una sola calificación 0-10 por alumno.

## Resistencia a la red del colegio

La red de la escuela falla seguido, y eso rompía los exámenes. Lo que se hizo
está documentado a detalle en [`CAMBIOS-RED-Y-BLOQUEOS.md`](CAMBIOS-RED-Y-BLOQUEOS.md).
En resumen:

- **Un aviso antes de bloquear.** Salir del examen da advertencia; a la
  segunda se cierra y entrega.
- **Las salidas por caída de red no cuentan.** Solo se perdona la que coincide
  con un cambio de conectividad (la alerta de wifi del sistema tapando el
  navegador). Estar sin internet no da inmunidad: la advertencia se cuenta en
  el dispositivo y se reconcilia al entregar.
- **Las respuestas se guardan en el dispositivo** a cada cambio. Recargar,
  quedarse sin batería o cerrar la pestaña ya no las pierde.
- **La entrega se reintenta** hasta que el servidor confirma. La pantalla de
  "entregado" solo aparece cuando de verdad se guardó.
- **Cronómetro anclado al servidor**: recargar no regala tiempo nuevo.
- **Service worker**: la app abre sin red una vez cargada. Nada de Supabase se
  cachea nunca.
- **Sin CDNs en las pantallas del alumno**: Tailwind viene compilado y el SDK
  de Supabase vive en el repo.

## Diseño del módulo de sesiones

Las decisiones y el modelo de datos están en
[`DISENO-SESIONES-Y-PARTICIPACION.md`](DISENO-SESIONES-Y-PARTICIPACION.md).
Lo esencial: AulaFácil **no guarda la actividad académica**, solo el marcador.
La clase ocurre en el salón; aquí vive quién participó, en qué y cuánto vale.

## Estructura

```
index.html                 redirige a dashboard o login
login.html                 registro/login del profesor
dashboard.html             panel principal
perfil.html                perfil, foto, modo de participación
crear-grupo.html           crear grupo + alta de alumnos
grupo.html                 detalle del grupo (pestañas)
alumnos.html               alumnos de un grupo
alumnos-global.html        todos los alumnos, entre grupos
constructor-examen.html    crear/editar examen
examen.html                pantalla del alumno durante el examen
resultados-examen.html     resultados + avisos anti-copia
ver-respuestas.html        detalle de respuestas de un intento
asistencia.html            pase de lista
tareas.html                tareas
calificar-tarea.html       calificar una tarea
participacion.html         fichas o formato tarea
sesion.html                clase en vivo: QR, actividades, historial
panel-alumno.html          pantalla del alumno en la clase en vivo
rubros.html                rubros personalizados
calificar-rubro.html       calificar un rubro
periodos.html              parciales del ciclo
calificaciones.html        calificaciones finales + Excel
sw.js                      service worker (modo offline)

assets/js/                 un .js por pantalla
  supabase-client.js       cliente compartido
  auth-guard.js            protege las pantallas del profesor
  recargar.js              botón de recargar / actualizar versión
assets/css/app.css         Tailwind compilado (generado)
assets/vendor/             SDK de Supabase y qrcode, sin CDN
```

## Edge Functions

El código vive en `supabase/functions/`. Para bajar una versión desplegada:
`npx supabase functions download <nombre>`, y para subir: `npx supabase functions deploy <nombre>`.

| Función | Qué hace |
|---|---|
| `crear-alumnos` | Alta en lote; la matrícula es única por maestro, y negocia un correo libre |
| `egresar-alumnos` | Marca el egreso y libera la matrícula para reciclarla |
| `iniciar-examen` | Entrega el examen sin respuestas correctas, ancla el cronómetro |
| `enviar-respuestas` | Califica en el servidor; idempotente para tolerar reintentos |
| `registrar-advertencia` | Cuenta los avisos anti-copia del lado del servidor |
| `registrar-presencia` | Valida el QR rotativo y marca asistencia |
| `reclamar-participacion` | El alumno dice "yo la hice"; nace pendiente y sin puntos |
| `cerrar-actividad` | Convierte en puntos la lista definitiva del maestro |

## Configurar una escuela nueva

La identidad visual no está escrita en el código: vive en **`marca.json`**, que
es el único archivo que cambia entre una escuela y otra. `tailwind.config.js` lo
lee de ahí, así que cambiarlo y recompilar repinta las 20 pantallas de una vez.

Para generarlo hay una herramienta, que se abre con doble clic (no necesita
servidor):

```
herramientas/generador-marca.html
```

Arrastras el logo del colegio, la herramienta extrae los colores dominantes y
te propone la paleta. Ajustas lo que quieras, ves cómo va quedando en una vista
previa con pantallas reales, y descargas:

| Archivo | Dónde va |
|---|---|
| `marca.json` | raíz del repo |
| `manifest.json` | raíz del repo |
| `icon-192.png`, `icon-512.png`, `icon-180.png` | `assets/img/` |
| `favicon-32.png`, `favicon-16.png` | `assets/img/` |

Después: `npm run css` (o simplemente haz push, que el workflow lo recompila).

De un solo color semilla salen los 47 tonos de la interfaz, siguiendo el
algoritmo de Material Design 3 — el mismo que usa Google para generar temas. Por
eso basta escoger uno y no cuarenta y siete.

**Una instancia por escuela.** Cada colegio tiene su propio proyecto de Supabase
y su propio despliegue. Es la única forma de que el icono y el nombre en la
pantalla de inicio del celular sean los suyos: eso lo define `manifest.json`, un
archivo estático que no puede cambiar según quién entre.

## Correrlo en tu compu

No necesita build para funcionar, pero sí un servidor local: abrir el `.html`
con doble clic no sirve, los navegadores bloquean módulos ES en `file://`.

```powershell
cd C:\Users\Gabol\OneDrive\Documentos\EasyTeacher
python -m http.server 8000
```

Abre `http://localhost:8000`.

### Cuando cambies clases de Tailwind

`assets/css/app.css` es **generado**. Si agregas clases nuevas en el HTML hay
que recompilarlo:

```powershell
npm install      # una sola vez
npm run css
```

También corre solo en cada push, con el workflow `.github/workflows/css.yml`.

### Otros comandos

```powershell
npm run vendor        # regenera assets/vendor/supabase.js
npm run vendor:marca  # regenera la librería de color del generador de marca
npm run fuentes       # baja Inter y Material Symbols al repo (opcional)
```

## Al cambiar archivos del examen

Sube `VERSION` en `sw.js`. Si no, los dispositivos que ya abrieron la app
siguen con la versión anterior guardada.

Para que un dispositivo tome la versión nueva: el botón de arriba a la derecha
se pone rojo y dice **"Actualizar"** cuando hay una esperando. Eso evita tener
que borrar los datos del sitio a mano.

## Seguridad

- La *publishable key* de Supabase en `assets/js/supabase-client.js` es segura
  de exponer: no es secreta. La protección real vive en Row Level Security.
- Las Edge Functions usan la *service role key*, que nunca sale del servidor.
- Los alumnos **nunca** reciben las respuestas correctas de un examen, ni
  pueden escribir su calificación, ni darse puntos de participación. Todo pasa
  por Edge Functions.
- El secreto del QR de una sesión vive en su propia tabla (`sesiones_secreto`)
  porque la RLS de Postgres es por fila, no por columna: si fuera una columna
  de `sesiones`, un alumno que ve la sesión vería el secreto.
- RLS verificada suplantando identidades (alumno, maestro ajeno, maestro
  dueño) y comprobando que cada intento de abuso queda bloqueado.
