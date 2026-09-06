# EasyTeacher

Plataforma web para que profesores creen exámenes, tomen asistencia, suban
calificaciones y las exporten a Excel — con bloqueo anti-copia en exámenes,
participación configurable, rubros personalizados y parciales.

Nació como herramienta para un solo profesor y creció a proyecto de estadía:
ahora soporta varios maestros, cada uno con su propia forma de calificar.

Backend: Supabase (Postgres + Auth + Storage + Edge Functions).
Frontend: HTML + JavaScript puro (sin framework, sin build step).

## Estado actual — funcionalmente completo

- **Cuentas**: profesor se registra normal; alumnos los da de alta el
  profesor (o se auto-inscriben si la matrícula ya existe en otro grupo).
- **Grupos**: crear, archivar/restaurar, varios por profesor. Un alumno
  puede estar en varios grupos (ej. mismo salón, distinta materia).
- **Alumnos**: gestión por grupo (`alumnos.html`) y vista global de todos
  los alumnos del profesor entre grupos (`alumnos-global.html`).
- **Exámenes**: constructor con 4 tipos de pregunta (opción múltiple,
  verdadero/falso, relacionar columnas, completar), teclado de símbolos
  matemáticos automático en materias de Matemáticas, duplicar entre grupos,
  archivar/restaurar. El alumno responde con bloqueo inmediato si sale de
  pantalla completa o cambia de pestaña; la calificación se calcula en el
  servidor (Edge Functions) para que el alumno nunca vea ni manipule las
  respuestas correctas.
- **Asistencia**: pase de lista por fecha (presente/falta/retardo).
- **Tareas**: crear con peso, calificar en lote.
- **Participación**: dos modos configurables por profesor —
  - *Fichas* (juego de fichas de casino: verde/azul/roja/blanca con valor
    editable, negra como multiplicador manual) con sistema de "corte":
    ranking de mayor a menor, el profesor elige un valor de referencia y
    se calcula la calificación (tope en 10), guardado como foto fija.
  - *Simple*: una calificación 0-10 directa por alumno, como Tareas.
- **Rubros personalizados**: categorías propias del profesor (ej.
  "Conducta", "Proyecto final"), calificadas 0-10.
- **Periodos/Parciales**: configurables por grupo; exámenes, tareas, rubros
  y participación se pueden ligar a un periodo específico.
- **Calificaciones finales**: ponderación editable (exámenes/tareas/
  participación/rubros), vista de "Resumen del ciclo" + una por cada
  parcial, exportación a Excel (una hoja por parcial + hoja "Resumen").
- **Perfil**: nombre, foto (Supabase Storage), tipo de maestro (grupo o
  materia), cambio de contraseña.

## Pendiente

- Mejoras de estética/UI (funcionalidad ya completa, ahora toca pulir).
- Desplegar en un hosting real (Vercel, o el servidor propio de la
  escuela — ambos funcionan igual de bien porque el sitio es HTML/JS
  estático puro, sin necesidad de Node ni backend propio).
- Idea a futuro, no urgente: análisis con IA sobre calificaciones/
  asistencia para sugerir mejoras por grupo.

## Estructura del proyecto
├── index.html → redirige a dashboard o login según la sesión
├── login.html → registro/login del profesor
├── dashboard.html → panel principal del profesor
├── perfil.html → editar perfil, foto, contraseña
├── crear-grupo.html → crear grupo + dar de alta alumnos
├── grupo.html → detalle de un grupo (tabs: exámenes, tareas,
│ asistencia, participación, rubros, periodos,
│ calificaciones, alumnos)
├── alumnos.html → alumnos de un grupo específico
├── alumnos-global.html → todos los alumnos del profesor, entre grupos
├── constructor-examen.html → crear/editar un examen
├── examen.html → pantalla donde el alumno responde
├── asistencia.html → pase de lista
├── tareas.html / calificar-tarea.html → tareas y su calificación
├── participacion.html → fichas o modo simple, según el profesor
├── rubros.html / calificar-rubro.html → rubros personalizados
├── periodos.html → parciales del ciclo
├── calificaciones.html → calificaciones finales + Excel
└── assets/js/ → un archivo .js por pantalla,
más supabase-client.js y
auth-guard.js (compartidos)


## Cómo correrlo en tu compu (WSL/Ubuntu)

No necesita Node ni build — es HTML/JS plano. Un servidor local simple
basta para que los `import` de JavaScript funcionen (abrir el `.html`
directo con doble clic no sirve, los navegadores bloquean módulos ES en
`file://`):

```bash
cd EasyTeacher
python3 -m http.server 8000
```

Abre `http://localhost:8000` en el navegador (no `0.0.0.0`).

**Importante**: si editas un archivo y no ves el cambio reflejado, casi
siempre es caché del navegador — recarga forzada con **Ctrl+Shift+R**
antes de sospechar que el código está mal.

## Subir cambios a GitHub

```bash
cd EasyTeacher
git add .
git commit -m "Describe aquí qué cambiaste"
git push
```

(El repo remoto ya está configurado desde el primer push — no hace falta
repetir `git remote add` ni `--set-upstream`.)

## Desplegar

El sitio es HTML/JS estático puro, así que sirve en **cualquier hosting**
que sepa servir archivos estáticos — no necesita Node, PHP, ni backend
propio (toda la lógica vive en Supabase). Dos opciones:

- **Vercel** (gratis): conecta el repo de GitHub, framework preset
  "Other", deploy. Cada `git push` a `main` lo actualiza solo.
- **Servidor propio de la escuela**: si puede servir archivos estáticos
  (Apache, Nginx, IIS, cPanel, lo que sea), solo se copian los archivos
  del repo ahí — no hay pasos de instalación ni dependencias que armar.

## Notas de seguridad

- La "publishable key" de Supabase en `assets/js/supabase-client.js` es
  segura de exponer en el navegador — no es secreta. La protección real
  vive en las reglas de Row Level Security de la base (cada quien ve/edita
  solo lo suyo).
- Las Edge Functions (`crear-alumnos`, `iniciar-examen`,
  `enviar-respuestas`) usan una llave con privilegios (service role) que
  nunca sale del servidor — vive solo dentro de las funciones en Supabase.
- Los alumnos nunca reciben las respuestas correctas de un examen ni
  pueden escribir su propia calificación directamente — todo el cálculo
  pasa por las Edge Functions.