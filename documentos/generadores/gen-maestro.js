const { d, numbering, P, H1, H2, H3, LI, PASO, NOTA, TABLA, PORTADA, SECCION } = require('./comun.js');
const fs = require('fs');

let inst = 0;
const paso = (t) => PASO(t, inst);
const nuevoBloque = () => { inst += 1; };

const doc = new d.Document({ numbering, sections: [SECCION([
  ...PORTADA('Manual del maestro', 'Cómo usar AulaFácil en el día a día', 'Versión 2.0 · Septiembre 2026'),

  H1('Antes de empezar'),
  P('AulaFácil se abre desde el navegador del celular, la tablet o la computadora. No se instala nada. Si la usas seguido, tu navegador te va a ofrecer "Agregar a la pantalla de inicio": acéptalo y te queda como si fuera una aplicación.'),
  P('Funciona sin internet para lo que ya cargaste. Si se cae el wifi a media clase, lo que marques se guarda en el aparato y se manda solo cuando vuelve la señal. No te quedes esperando: sigue trabajando.'),
  NOTA('Si algo no se ve como esperas, o te avisa que hay una versión nueva, usa el botón de la esquina superior derecha. Cuando se pone rojo y dice "Actualizar", hay una versión esperando: presiónalo y la página se recarga sola.'),

  H1('1. Entrar y configurar tu perfil'),
  P('Entras con el correo del colegio y la contraseña que tú elegiste al crear tu cuenta. Si es la primera vez, créala desde "¿Primera vez? Crea tu cuenta".'),
  H2('Lo que puedes configurar'),
  LI('Tu nombre, como aparece en la app.'),
  LI('Tu foto.'),
  LI('El modo de participación con el que trabajas. Es una decisión tuya, no del colegio: cada maestro usa el suyo. Más adelante se explican los tres.'),

  H1('2. Crear un grupo y dar de alta a tus alumnos'),
  P('Un grupo es una materia con un conjunto de alumnos. Si le das clase al mismo salón en dos materias, son dos grupos.'),
  P('Al crear el grupo le pones nombre (por ejemplo, 301) y materia. Después puedes meter alumnos de tres maneras.'),

  H2('Buscar a un alumno que ya tuviste'),
  P('Es la primera opción de la pantalla, y conviene usarla siempre antes que las otras dos. Escribes dos letras de su nombre o su matrícula y, si ya estuvo en otro grupo tuyo, aparece en la lista. Le das clic y queda inscrito.'),
  P('Así conserva su misma matrícula, su misma contraseña y su historial. Si lo vuelves a dar de alta a mano estarías creando una persona nueva, con expediente vacío.'),
  P('El buscador también encuentra a los que egresaste. Si reinscribes a uno, se reactiva solo y recupera su forma de entrar.'),

  H2('Alumno por alumno'),
  P('Escribes nombre y matrícula, y le das Agregar. Si no tienes matrículas del colegio, el botón del dado genera un número libre.'),

  H2('Desde un Excel'),
  P('Con "Importar lista (Excel)" subes un archivo con una columna de nombre y una de matrícula. Reconoce encabezados comunes: nombre, alumno, matrícula, número de control. Revisa la lista antes de guardar.'),

  H2('Las matrículas son tuyas, no del colegio'),
  P('Cada maestro lleva su propia numeración. Dos maestros pueden usar el mismo número para alumnos distintos sin estorbarse, y no tienes que coordinarte con nadie.'),
  P('Eso tiene un efecto útil: un alumno tiene una cuenta distinta contigo que con otro maestro. Si presta su contraseña, solo compromete tu materia.'),
  NOTA('Un alumno tiene UNA cuenta contigo, aunque le des dos materias. La cuenta es por maestro, no por grupo.'),

  H2('Cambiar el nombre o la materia del grupo'),
  P('Con el lápiz que está junto al nombre del grupo. Solo cambia la etiqueta: alumnos, calificaciones, exámenes y clases siguen intactos, porque no dependen del nombre.'),

  H1('3. Exámenes'),
  H2('Crear el examen'),
  nuevoBloque(),
  paso('En el grupo, entra a Exámenes y dale "Nuevo examen".'),
  paso('Ponle título, y si quieres, hora de apertura, hora de cierre y duración en minutos.'),
  paso('Agrega las preguntas.'),
  paso('Guarda. Mientras esté en borrador, los alumnos no pueden entrar.'),
  paso('Cuando esté listo, genera el link y publícalo.'),
  NOTA('Un examen en borrador se ve igual que uno publicado desde tu pantalla. Si los alumnos reportan que el link no les sirve, lo primero que hay que revisar es si quedó publicado.'),

  H2('Tipos de pregunta'),
  LI('Opción múltiple: varias opciones, una correcta.'),
  LI('Verdadero o falso.'),
  LI('Relacionar columnas: a cada alumno se le barajan las opciones de la derecha.'),
  LI('Completar: el alumno escribe la respuesta. Se califica sola.'),
  P('En las de completar puedes escribir varias respuestas válidas separadas con una barra vertical. La calificación es tolerante: no distingue mayúsculas, ignora espacios de más, y entiende que 1/2 y 0.5 son lo mismo, o que x^2 y x² son lo mismo.'),
  P('Si la pregunta es de matemáticas, al alumno le aparece un teclado con los símbolos que su celular no trae (raíz, pi, potencias, fracciones).'),

  H3('Pedir el procedimiento'),
  P('En las preguntas de completar hay una casilla que dice "Pedir el procedimiento". Al activarla, además del resultado le aparece al alumno una pizarra donde escribe con el dedo cómo lo resolvió.'),
  P('El resultado se sigue calificando solo. El procedimiento lo revisas tú al ver las respuestas.'),

  H2('Orden aleatorio'),
  P('Antes de publicar hay dos casillas:'),
  LI('"Orden aleatorio de preguntas": a cada alumno le tocan en distinto orden, así que ver la pantalla del de al lado deja de servir.'),
  LI('"Orden aleatorio de las opciones": solo aplica a opción múltiple. Verdadero o falso se deja en paz, porque barajarlo nada más confunde.'),
  P('El orden de cada alumno es estable: si recarga la página, le vuelve a tocar el mismo. No se le revuelve a media prueba.'),

  H2('Repartir el examen'),
  P('Copia el link y mándalo por donde normalmente te comunicas con el grupo. El link es el mismo para todos; cada alumno entra con su propia cuenta.'),
  NOTA('Manda el link del grupo correcto. Si tienes el mismo examen en dos grupos, son dos links distintos, y el de un grupo no le sirve al otro.'),

  H2('Durante el examen'),
  P('Mientras el alumno contesta, la app hace tres cosas:'),
  LI('Le pone encima, muy tenue, su nombre y su matrícula. Si toma una captura o le saca foto a la pantalla, sale marcada con quién fue.'),
  LI('Si se sale de la pantalla del examen, se lo advierte. A la siguiente, el examen se cierra y se entrega con lo que lleve.'),
  LI('Si copia texto o aprieta Impr Pant, queda anotado. Eso no lo bloquea ni le suma advertencia: es solo para que tú lo sepas.'),
  P('Salir de la pantalla porque se cayó el wifi no cuenta como advertencia. La app distingue esa alerta del sistema de una salida de verdad, aunque igual la anota.'),
  NOTA('Lo que no se puede evitar: que alguien le saque una foto a la pantalla con otro teléfono. Ningún sistema web lo impide. Para eso está la marca de agua: la foto sale con el nombre de quien la tomó.'),

  H2('Ver resultados'),
  P('En Resultados ves a cada alumno con su estado y su calificación. Junto al nombre pueden aparecer estas etiquetas:'),
  TABLA(['Etiqueta', 'Qué significa'], [
    ['N avisos', 'Veces que se salió de la pantalla y sí contaron'],
    ['N salidas sin red', 'Se salió, pero el aparato estaba sin conexión: no contó'],
    ['copió texto N veces', 'Copió el texto de una pregunta. No bloquea: lo juzgas tú'],
    ['Impr Pant ×N', 'Oprimió la tecla de captura de pantalla'],
  ], [2600, 6760]),
  P('Desde ahí también entras a ver las respuestas de cada quien, incluidas las pizarras de procedimiento, y puedes reactivar a un alumno que se quedó bloqueado para que lo vuelva a presentar con el mismo link.'),

  H2('Si un alumno no puede entrar'),
  P('La pantalla le dice exactamente cuál de los tres casos es, y eso te ahorra la adivinanza:'),
  TABLA(['Lo que le aparece', 'Qué hacer'], [
    ['Tu maestro todavía no publica este examen', 'Quedó en borrador. Publícalo'],
    ['Este examen es del grupo X y tu cuenta no está en ese grupo', 'Le pasaron el link de otro grupo, o entró con otra cuenta'],
    ['Este link no corresponde a ningún examen', 'El link está mal copiado. Vuelve a mandarlo'],
  ], [4200, 5160]),
  P('En el segundo caso, al alumno le aparece con qué cuenta entró y un botón para cambiarla. Es frecuente en aparatos compartidos, o cuando el alumno ya hizo pruebas con otro maestro.'),

  H1('4. Asistencia'),
  P('Eliges la fecha y marcas a cada alumno como presente, falta o retardo. Arriba llevas el conteo. También puedes marcar a todos presentes de un golpe y corregir los que falten.'),
  P('Si pasas lista a mano y además usas el QR de clase en vivo, tu marca manda: el escaneo no te cambia lo que ya pusiste.'),

  H1('5. Clase en vivo'),
  P('Es la forma de tomar asistencia y participación en el momento, con un código QR que proyectas.'),
  nuevoBloque(),
  paso('Entra al grupo y abre "Clase en vivo".'),
  paso('Elige el parcial.'),
  paso('Elige si quieres retardos y a partir de cuántos minutos. Viene en "Sin retardos", así que si no lo tocas, nadie llega tarde.'),
  paso('Dale "Iniciar clase" y proyecta el código.'),
  P('El código cambia cada 20 segundos. Eso es a propósito: una captura mandada por WhatsApp caduca antes de servirle a nadie que no esté en el salón.'),
  P('El alumno escanea una sola vez. Si todavía no había iniciado sesión, tiene unos minutos para hacerlo sin que el código se le venza.'),

  H2('Durante la clase'),
  P('Vas viendo cuántos han llegado. Puedes abrir actividades, ponerles cuántos puntos valen, y decidir si la lista arranca vacía —vas marcando quién participó— o con todos los presentes, y vas quitando.'),
  P('Los alumnos piden su participación desde su teléfono y tú apruebas o rechazas.'),

  H2('Al cerrar la clase'),
  P('Cuando cierras, si quedaron alumnos sin ningún registro de asistencia, la app te pregunta si los marcas como falta. Solo toca a los que están en blanco: a quien ya pusiste presente, retardo o justificada no se le mueve nada.'),
  P('La clase cerrada no se reabre. Su resumen queda como evidencia de lo que pasó ese día, aunque después corrijas algo.'),

  H1('6. Tareas'),
  P('Creas la tarea con su valor y su fecha, y después capturas la calificación de cada alumno. Sirve para lo que se entrega fuera de la app.'),

  H1('7. Participación: los tres modos'),
  P('Se elige en tu perfil y aplica a todos tus grupos. Los tres terminan en una calificación de participación; cambia la forma de llevarla.'),
  H2('Modo Fichas'),
  P('Le das fichas de colores a quien participa, cada color con su valor. Es rápido: un toque por participación. Al final del parcial haces el corte.'),
  H2('Modo Clase en vivo'),
  P('El del QR, explicado arriba. La participación sale de las actividades de cada clase.'),
  H2('Modo Formato tarea'),
  P('La participación se captura como si fuera una tarea más, con su calificación directa.'),

  H2('Reposiciones'),
  P('Si un alumno faltó con justificante o entregó tarde, puedes reponerle la participación de una clase ya cerrada sin reabrirla, indicando el motivo y qué porcentaje le cuentas.'),

  H1('8. Rubros personalizados'),
  P('Además de exámenes, tareas y participación, puedes crear tus propios rubros con el peso que tú decidas. La suma de los pesos define la calificación final.'),

  H1('9. Periodos o parciales'),
  P('Divides el ciclo en parciales. Cada examen, tarea y clase pertenece a uno, y las calificaciones se calculan por parcial.'),

  H1('10. Calificaciones finales'),
  P('La app junta todo con los pesos que pusiste. Puedes ver el desglose de cada alumno para saber de dónde salió cada punto.'),
  H2('Corregir una calificación'),
  P('Si un número no refleja lo que pasó, puedes ajustarlo a mano. El ajuste queda registrado con su motivo; no se pierde de vista que fue una corrección.'),

  H1('11. Mis alumnos: egreso y matrículas libres'),
  P('En la pantalla de Alumnos ves a todos los tuyos, con los grupos de cada uno.'),
  H2('Cómo egresar'),
  P('Seleccionas a los que ya terminaron y le das Egresar, indicando el ciclo. Un alumno solo se puede egresar si ya no está en ningún grupo activo.'),
  P('Al egresarlo, su matrícula queda libre para otro alumno, y él sale de tu lista activa. No se borra: su historial se conserva, y si vuelve lo encuentras con el buscador.'),

  H1('12. Si algo sale mal'),
  TABLA(['Lo que ves', 'Qué hacer'], [
    ['Dice que hay versión nueva', 'Presiona "Actualizar"; la página se recarga sola'],
    ['Se cayó el wifi a media clase', 'Sigue marcando. Se guarda y se manda solo al volver la señal'],
    ['Un alumno no puede entrar al examen', 'Lee el mensaje que le sale: dice cuál de los tres casos es'],
    ['Un alumno escaneó y no pasó nada', 'Que revise si dice "Esta clase no es de tu cuenta" y use el botón para cambiarla'],
    ['Un examen se cerró solo', 'Reactívalo desde Resultados: vuelve a entrar con el mismo link'],
    ['Un alumno aparece dos veces', 'Uno es de un alta a mano. Quita el repetido y usa el buscador la próxima'],
    ['No encuentro a un alumno de otro año', 'Búscalo en el buscador de la pantalla de alumnos: encuentra también a los egresados'],
  ], [3800, 5560]),
  P('Si nada de esto lo resuelve, anota qué estabas haciendo, en qué grupo y a qué hora. Con eso se puede rastrear lo que pasó.'),
])] });

d.Packer.toBuffer(doc).then((b) => {
  fs.writeFileSync(__dirname + '/../Manual-del-maestro-AulaFacil.docx', b);
  console.log('Manual del maestro v2.0 generado');
});
