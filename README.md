# EasyTeacher

Plataforma web para que un profesor cree exámenes, tome asistencia, suba calificaciones
y las exporte a Excel. Backend en Supabase (proyecto `EasyTeacher`), frontend estático
(HTML + JS puro, sin framework ni build step).

## Estado actual

✅ Conectado a Supabase real:
- **Login / registro del profesor** (`login.html`)
- **Panel principal** (`dashboard.html`) — lista los grupos reales del profesor
- **Crear grupo** (`crear-grupo.html`) — crea el grupo y da de alta alumnos en lote

⏳ Pendiente de conectar (ya diseñado en Stitch, falta cablear a datos reales):
constructor de exámenes, examen en progreso (los 4 tipos de pregunta), pantalla de
bloqueo, asistencia, tareas, calificaciones finales + exportar a Excel.

## Cómo correrlo en tu compu (WSL/Ubuntu)

No necesitas Node ni build — es HTML/JS plano. Basta con un servidor local simple
para que los `import` de JavaScript funcionen (abrir el `.html` directo con doble clic
no sirve, los navegadores bloquean módulos ES en `file://`):

```bash
cd easyteacher-app
python3 -m http.server 8000
```

Abre `http://localhost:8000` en el navegador.

## Primeros pasos para probarlo

1. Entra a `login.html`, da clic en "¿Primera vez? Crea tu cuenta" y regístrate con tu
   correo (este será tu papá, o tú para probar).
2. Deberías caer en el Panel principal, vacío ("Aún no tienes grupos").
3. Da clic en "+ Nuevo grupo", ponle nombre, agrega 1-2 alumnos de prueba (nombre +
   matrícula o correo), y "Guardar grupo".
4. Deberías regresar al panel y ver el grupo con el número de alumnos correcto.

## Subir esto a GitHub

```bash
cd easyteacher-app
git init
git add .
git commit -m "Primera versión: login, panel principal y crear grupo conectados a Supabase"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/easyteacher.git
git push -u origin main
```

(Antes crea el repo vacío en github.com — sin README ni .gitignore, para que no choque
con el push).

## Desplegar en Vercel (gratis)

1. Entra a vercel.com, inicia sesión con tu cuenta de GitHub.
2. "Add New Project" → selecciona el repo `easyteacher`.
3. Framework Preset: **Other** (es un sitio estático, no necesita build).
4. Deploy. Te da un link tipo `easyteacher.vercel.app` — ese es el que tu papá va a
   compartir.
5. Cada vez que hagas `git push` a `main`, Vercel vuelve a desplegar solo.

## Notas de seguridad

- La "publishable key" de Supabase en `assets/js/supabase-client.js` es segura de
  exponer en el navegador — no es secreta. La protección real de los datos vive en las
  reglas de Row Level Security que ya configuramos en la base (cada quien ve solo lo
  suyo).
- La Edge Function `crear-alumnos` sí usa una llave con privilegios (service role),
  pero esa llave nunca sale del servidor — vive únicamente dentro de la función en
  Supabase, no en este código.

