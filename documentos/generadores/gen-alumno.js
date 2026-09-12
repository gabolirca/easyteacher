const { d, numbering, P, H1, H2, LI, PASO, NOTA, TABLA, PORTADA, SECCION } = require('./comun.js');
const fs = require('fs');

const doc = new d.Document({ numbering, sections: [SECCION([
  ...PORTADA('Manual del alumno', 'Cómo usar AulaFácil', 'Versión 1.1 · Septiembre 2026'),

  H1('Cómo entrar'),
  P('AulaFácil se abre en el navegador de tu celular o computadora. No tienes que instalar nada.'),
  LI('Tu usuario es la matrícula que te dio tu maestro. Casi siempre es el número tal cual, pero a veces trae algo extra al final; usa exactamente el que te haya pasado.'),
  LI('Tu contraseña inicial es esa misma matrícula.'),
  LI('Cámbiala la primera vez que entres, desde tu perfil.'),
  P('Si llevas clase con varios maestros, es normal que tengas un usuario distinto en cada materia. No están revueltos: cada maestro lleva su propia lista. Apunta cuál te sirve para cuál clase.'),
  NOTA('Si quieres tenerla como aplicación, abre el sitio y usa "Agregar a pantalla de inicio" en tu teléfono.'),

  H1('Presentar un examen'),
  P('Tu maestro te dará un link o un código QR. Si es QR, escanéalo con la cámara de tu teléfono y se abre solo.'),
  H2('Antes de empezar'),
  P('Verás el título del examen, cuántas preguntas tiene y cuánto tiempo tienes. Léelo con calma: el cronómetro empieza a correr cuando presionas "Comenzar examen".'),
  H2('Las reglas'),
  P('Si sales de la pantalla del examen (cambias de aplicación o de pestaña) recibes un aviso. Si vuelves a salir, tu examen se cierra y se entrega con lo que llevabas contestado.'),
  NOTA('Si se te cae el internet, eso NO cuenta como salida. El sistema lo distingue. Te aparecerá un mensaje diciéndotelo y puedes seguir contestando con normalidad.'),
  H2('Si se te va el internet'),
  P('No te asustes y no cierres la pantalla.'),
  LI('Aparece una barra naranja que dice "Sin conexión". Puedes seguir contestando: tus respuestas se guardan en tu propio teléfono.'),
  LI('Si recargas sin querer, o se apaga el teléfono, al volver a entrar recuperas lo que ya habías contestado y el tiempo sigue donde iba.'),
  LI('Al entregar, si no hay señal, verás "Entregando tu examen" con reintentos. Espera. En cuanto vuelva el internet se entrega solo.'),
  NOTA('Nunca cierres la pantalla mientras diga "Entregando". Tu examen todavía no ha llegado a tu maestro.'),
  H2('Cuando terminas'),
  P('Verás la pantalla de "¡Examen entregado!". Solo cuando aparezca ese mensaje tu examen quedó guardado de verdad.'),

  H1('Clase en vivo'),
  P('Algunos maestros registran la participación con AulaFácil. Funciona así:'),
  PASO('Tu maestro muestra un código QR en su pantalla al empezar la clase.'),
  PASO('Escanéalo con la cámara de tu teléfono. Con eso queda registrada tu asistencia.'),
  PASO('Cuando hagas un ejercicio, entra a tu panel y toca "Yo la hice" en esa actividad.'),
  PASO('Tu maestro revisa y valida. Cuando cierra la actividad, tus puntos aparecen.'),
  NOTA('El código QR cambia cada 20 segundos, así que tiene que escanearse en el salón. Mandárselo a un compañero que no vino no funciona: para cuando le llega, ya expiró.'),
  H2('Qué significa cada estado'),
  TABLA(['Lo que ves', 'Qué quiere decir'], [
    ['Yo la hice', 'Puedes reclamar esa actividad; todavía no la has marcado'],
    ['Esperando a tu maestro', 'Ya reclamaste. Tus puntos aparecen cuando él valide'],
    ['+40 puntos', 'Tu maestro validó y ya tienes los puntos'],
    ['No contabilizada', 'Tu maestro decidió que esa no cuenta'],
    ['Cerrada', 'La actividad ya se cerró y no puedes reclamarla'],
  ], [3000, 6360]),
  P('Arriba de tu panel ves cuántos puntos llevas en la clase de hoy.'),

  H1('Problemas comunes'),
  TABLA(['Si pasa esto', 'Haz esto'], [
    ['No puedo entrar', 'Revisa que sea el usuario de esa materia, escrito sin espacios'],
    ['Me sirve en una clase pero no en otra', 'Es normal: cada maestro te da un usuario. Pídele el suyo'],
    ['El QR no me deja entrar', 'Vuelve a escanear: el código cambia cada 20 segundos'],
    ['No me deja marcar que participé', 'Escanea primero el QR de la clase para registrar tu presencia'],
    ['Se me cerró el examen por error', 'Avísale a tu maestro: él puede reactivarlo'],
    ['La página se ve rara o desactualizada', 'Usa el botón "Recargar" de la esquina superior derecha'],
  ], [3400, 5960]),
])] });

d.Packer.toBuffer(doc).then((b) => { fs.writeFileSync('Manual-del-alumno-AulaFacil.docx', b); console.log('Manual del alumno:', b.length, 'bytes'); });
