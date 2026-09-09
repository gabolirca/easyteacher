# Examen a prueba de la red de la escuela

Diagnóstico y cambios del 9 de septiembre de 2026.

---

## 1. Por qué se bloqueaban los alumnos

El bloqueo anti-copia escuchaba tres eventos del navegador —`fullscreenchange`,
`visibilitychange` y `blur`— y bloqueaba **al primero** que se disparara, con
apenas 700 ms de margen.

El problema es que `blur` y `visibilitychange` no significan solo "el alumno se
salió". También se disparan cuando **el sistema operativo pone una ventana
encima del navegador**, y eso es exactamente lo que hace el wifi al fallar:

- iOS y Android levantan la alerta *"No hay conexión a Internet"*.
- Las redes de escuela suelen mandar al portal de acceso: *"Inicia sesión en la red Wi-Fi"*.
- Cualquier notificación del sistema roba el foco un instante.

Ninguna de esas es culpa del alumno, y las tres lo bloqueaban de inmediato.

### El segundo problema, más grave

Cuando el bloqueo ocurría, `entregar()` mandaba las respuestas al servidor con
un `try/catch` vacío:

```js
} catch {
  // si falla la red en el momento del bloqueo, igual mostramos la pantalla
}
```

Si la red estaba caída —que es justo cuando pasaba— **la petición fallaba y las
respuestas se perdían en silencio**. Peor todavía: lo mismo ocurría en una
entrega normal. El alumno veía *"¡Examen entregado!"*, se iba tranquilo, y en la
base de datos no quedaba nada. Ese error no dependía del bloqueo: bastaba con
que se cayera la red al momento de entregar.

---

## 2. Qué se cambió

### a) Sistema de avisos (1 aviso, bloqueo a la segunda)

La primera salida ya no bloquea: muestra un modal de advertencia. Solo la
segunda cierra y entrega el examen.

El contador vive **en el servidor** (`intentos.advertencias`), no en el
navegador, así que recargar la página no borra los avisos.

### b) Las salidas sin red ya no cuentan

Antes de contar una salida, el navegador revisa si hubo problema de conexión
(`navigator.onLine`, o un cambio de conectividad en los últimos 10 segundos).
Si lo hubo, muestra un modal que explica que fue la red y **no cuenta la
advertencia**.

Si la llamada para registrar el aviso falla, se trata igual: preferimos dejar
pasar una salida real antes que bloquear a alguien por culpa del wifi.

Todas esas salidas sí quedan registradas en `intentos.eventos_salida` marcadas
como no contabilizadas, y el profesor las ve en la pantalla de resultados. Es
evidencia sin castigo.

**El costo, dicho claro:** un alumno que apague el wifi a propósito puede
cambiar de app sin que le cuente. Queda registrado y visible para el profesor,
pero no bloquea. Es el precio de no castigar a los 30 que sí estaban bien.

### c) `blur` con más tolerancia

`blur` es la señal más ruidosa, así que ahora espera 1500 ms (en vez de 700) y
confirma con `document.hasFocus()`. Además se ignora durante los 2 segundos
posteriores a tocar un campo de texto, porque el teclado en pantalla también
roba el foco.

### d) Las respuestas se guardan en el dispositivo

Cada respuesta se guarda en `localStorage` al instante. Si se cae la red, se
recarga la página, se muere la batería o se cierra la pestaña, al volver a
entrar el examen se recupera donde iba.

### e) La entrega ya no se pierde

`enviar-respuestas` ahora se reintenta con esperas crecientes (2 s, 4 s, 8 s,
15 s, 30 s y de ahí cada 30 s), y en cuanto vuelve la señal reintenta de
inmediato. **La pantalla de "entregado" solo aparece cuando el servidor
confirma.** Mientras tanto el alumno ve una pantalla que le dice que sus
respuestas están guardadas y que no cierre.

La Edge Function ya era idempotente, así que reintentar nunca duplica ni
recalifica.

### f) Cronómetro anclado al servidor

Antes el tiempo se reiniciaba al recargar la página: quien recargaba se
regalaba el examen completo otra vez. Ahora se calcula desde
`intentos.fecha_inicio` del servidor, y también respeta la hora de cierre.

### g) Modo offline de verdad (PWA)

- **Service worker** (`sw.js`) que guarda el cascarón de la app. Una vez
  abierto el examen con señal, recargar sin internet ya no deja pantalla blanca.
  Las llamadas a Supabase nunca se cachean.
- **Tailwind compilado** (`assets/css/app.css`, 32 KB) en lugar del CDN, que
  bajaba ~400 KB de compilador en cada carga. En una red lenta esto solo ya se
  nota muchísimo.
- **Supabase SDK dentro del repo** (`assets/vendor/supabase.js`) en vez de
  `esm.sh`. Un CDN de terceros menos del que depender.
- **Respaldo de fuentes**: si Google Fonts no carga, el texto usa la fuente del
  sistema y los iconos se ocultan en vez de mostrar su nombre como texto suelto
  ("warning", "timer", "arrow_back"...).

---

## 3. Lo que NO se puede hacer, y por qué

Un examen **100 % sin internet** no es posible con la arquitectura actual. El
alumno necesita conexión en dos momentos: al abrir el examen (para
autenticarse y bajar las preguntas) y al entregarlo. Entre esos dos momentos ya
no necesita nada, y eso es lo que se blindó.

Si el problema resulta ser que **el wifi del colegio conecta pero no sale a
internet**, la única solución real es desplegar en el servidor de la escuela:
frontend y base de datos dentro de la red local. Eso enlaza con la decisión que
ya tenías pendiente sobre el hosting.

---

## 4. Cosas que encontré de paso

- **`rounded-DEFAULT` no hace nada.** Está en 162 lugares del HTML, pero
  Tailwind genera `.rounded` para la clave `DEFAULT`, nunca `.rounded-DEFAULT`.
  Pasaba igual con el CDN, así que no hay cambio visual — pero las esquinas
  redondeadas de 1rem que querías nunca se aplicaron. Se arregla con un alias
  en `tailwind.config.js` cuando quieras.

- **`login.html` estaba en la paleta naranja vieja** (`#E83C17`) y no en el rojo
  del colegio (`#d02b2f`). Las otras 18 páginas sí tenían el rojo. Al unificar
  el tema, el login quedó en la paleta correcta.

- **Reactivar un intento después de la hora de cierre no funciona.**
  `iniciar-examen` rechaza crear un intento nuevo si `fecha_cierre` ya pasó, y
  el botón "Reactivar" borra el intento. Si un maestro reactiva tarde, el
  alumno no puede volver a entrar. No lo toqué porque no era lo de hoy.

---

## 5. Cómo probarlo

En el celular, con el examen abierto:

1. **Salida normal** → sale el modal de aviso. Vuelve a salir → se bloquea.
2. **Modo avión a media pregunta** → aparece la barra "Sin conexión", puedes
   seguir contestando. Sal de la app → sale el modal de red, **no cuenta**.
3. **Recarga la página a media pregunta** → recupera tus respuestas y el
   cronómetro sigue donde iba, no se reinicia.
4. **Modo avión y entregar** → pantalla de "Entregando…" con reintentos.
   Prende el wifi → se entrega solo.
5. En **Resultados**, revisa las etiquetas de avisos y de salidas sin red.

---

## 6. Comandos

```bash
npm install          # una sola vez
npm run css          # recompilar Tailwind (también corre solo en GitHub Actions)
npm run vendor       # regenerar el bundle de Supabase
npm run fuentes      # bajar Inter y Material Symbols al repo (opcional, con internet)
```

Al cambiar archivos del examen, sube `VERSION` en `sw.js` para que los alumnos
reciban la versión nueva.

Las Edge Functions ya están desplegadas en producción. Para tenerlas también en
el repo:

```bash
npx supabase functions download registrar-advertencia
npx supabase functions download enviar-respuestas
```
