const { d, numbering, T, P, H1, H2, LI, NOTA, TABLA, PORTADA, SECCION, GRIS } = require('./comun.js');
const fs = require('fs');
const { Paragraph, TextRun, AlignmentType } = d;

const TARIFA = 450;
const imp = (h) => '$' + (h * TARIFA).toLocaleString('es-MX') + '';

const BLOQUE = (titulo, porque, horas) => [
  new Paragraph({
    spacing: { before: 220, after: 60 },
    children: [new TextRun({ text: titulo, font: 'Calibri', size: 23, bold: true, color: GRIS })],
  }),
  P(porque),
  new Paragraph({
    spacing: { after: 120 },
    children: [T(`${horas} horas · ${imp(horas)} M.N.`, { bold: true })],
  }),
];

const doc = new d.Document({ numbering, sections: [SECCION([
  ...PORTADA('Propuesta de mejoras', 'Trabajos sugeridos para la entrega formal', 'Versión 1.0 · Septiembre 2026'),

  H1('De qué se trata'),
  P('AulaFácil está en operación y cubre lo que se necesita para el día a día: exámenes, asistencia, participación, calificaciones y clase en vivo. Este documento no propone rehacer nada de eso.'),
  P('Lo que se lista aquí son trabajos que conviene hacer antes de considerar el sistema formalmente entregado, más algunos que amplían su alcance. Cada uno se cotiza a la misma tarifa del convenio: $450.00 M.N. por hora, nivel desarrollador junior.'),
  NOTA('Ninguno de estos trabajos es urgente para que la escuela siga operando hoy. Están ordenados por lo que más riesgo quita, no por lo que más se nota.'),

  H1('1. Necesarios para la entrega'),
  P('Sin estos, la entrega queda incompleta o con un riesgo que alguien va a heredar.'),

  ...BLOQUE('Manual técnico actualizado',
    'El manual técnico quedó en la versión anterior del sistema: no documenta las funciones de servidor que se agregaron, las migraciones nuevas ni el flujo del código de entrada. Es el documento que va a leer quien dé mantenimiento después. Sin él, la primera falla se convierte en una investigación desde cero.', 6),

  ...BLOQUE('Aviso de privacidad y registro de tratamiento de datos',
    'El sistema guarda nombre, matrícula, asistencia y calificaciones de menores de edad. La legislación mexicana exige un aviso de privacidad y dejar constancia de cómo se tratan esos datos. Hoy no existe ese documento. Es el punto que más expone a la institución.', 5),

  ...BLOQUE('Correo propio para el registro de maestros',
    'El servicio de correo que se usa hoy entrega un máximo de dos mensajes por hora. Con los maestros que se han ido sumando, el día que dos se registren juntos el segundo no recibe su correo de confirmación, sin ningún aviso de por qué. Se resuelve conectando un servicio de correo propio y el límite sube a treinta por hora.', 4),

  ...BLOQUE('Cierre de la revisión en tablet',
    'Queda una revisión pendiente del comportamiento del teclado en iPad durante los exámenes. Incluye la prueba en el aparato y la corrección que resulte.', 4),

  H2('Subtotal de esta sección'),
  TABLA(['Concepto', 'Horas', 'Importe'], [
    ['Manual técnico actualizado', '6', imp(6)],
    ['Aviso de privacidad y registro de tratamiento', '5', imp(5)],
    ['Correo propio para el registro de maestros', '4', imp(4)],
    ['Cierre de la revisión en tablet', '4', imp(4)],
    ['SUBTOTAL', '19', imp(19)],
  ], [5760, 1400, 2200]),

  H1('2. Recomendados'),
  P('Quitan fallas que ya ocurrieron o que van a ocurrir conforme crezca el uso.'),

  ...BLOQUE('Dejar de depender de un servicio externo para los estilos',
    'Dieciocho de las veintidós pantallas cargan su hoja de estilos desde un servicio externo. Si la red de la escuela lo bloquea o va lenta, esas pantallas se ven sin formato: texto plano, sin botones reconocibles. El sistema ya trae la hoja de estilos compilada dentro; es cuestión de apuntar las pantallas a ella.', 5),

  ...BLOQUE('Que el código de clase use el reloj del servidor',
    'El código rotativo de asistencia se genera con el reloj de la computadora del maestro, pero lo valida el reloj del servidor. Si a esa computadora se le desfasa la hora, la asistencia deja de funcionar por completo y sin mensaje que lo explique. Hoy los relojes coinciden; el arreglo evita que un día dejen de hacerlo.', 4),

  ...BLOQUE('Aviso de alumnos sin grupo y limpieza automática',
    'Cuando un maestro saca a un alumno de un grupo, la ficha del alumno sigue existiendo aunque deje de aparecer en cualquier pantalla. Se acumulan sin que nadie las vea; ya se limpiaron a mano dos veces. Incluye un aviso en la pantalla de alumnos y una limpieza que el propio maestro pueda ejecutar.', 6),

  ...BLOQUE('Entrada del alumno cuando dos maestros repiten matrícula',
    'Cada maestro numera a sus alumnos por su cuenta, lo cual es deliberado. Pero si dos maestros llegan a usar el mismo número, el segundo alumno no podrá entrar tecleando solo su matrícula. Hoy no hay ninguna coincidencia; con más maestros es cuestión de tiempo. Se resuelve pidiendo también el grupo cuando el número esté repetido.', 8),

  H2('Subtotal de esta sección'),
  TABLA(['Concepto', 'Horas', 'Importe'], [
    ['Independencia del servicio externo de estilos', '5', imp(5)],
    ['Reloj del servidor para el código de clase', '4', imp(4)],
    ['Aviso de alumnos sin grupo y limpieza', '6', imp(6)],
    ['Entrada del alumno con matrícula repetida', '8', imp(8)],
    ['SUBTOTAL', '23', imp(23)],
  ], [5760, 1400, 2200]),

  H1('3. Crecimiento'),
  P('No hace falta para operar. Sirve si la institución quiere usar el sistema en más de un plantel.'),

  ...BLOQUE('Panel de alta de escuelas',
    'El sistema ya puede vestirse con el nombre, el logotipo y los colores de otra escuela: existe la herramienta que genera la paleta a partir del logotipo y el script que prepara una instalación nueva. Falta la pantalla que permita hacerlo sin tocar la línea de comandos, y separar los datos de cada plantel.', 16),

  H1('Resumen'),
  TABLA(['Sección', 'Horas', 'Importe'], [
    ['1. Necesarios para la entrega', '19', imp(19)],
    ['2. Recomendados', '23', imp(23)],
    ['3. Crecimiento', '16', imp(16)],
    ['TOTAL', '58', imp(58)],
  ], [5760, 1400, 2200]),

  P('Las secciones se pueden contratar por separado. La sección 1 es la que se sugiere resolver antes de firmar la entrega; las otras dos pueden quedar para después.'),
  NOTA('Vigencia de esta propuesta: 30 días naturales a partir de su fecha. Los tiempos indicados son de trabajo efectivo y no consideran los periodos de revisión por parte de LA INSTITUCIÓN.'),

  new Paragraph({ spacing: { before: 600 }, children: [] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 },
    children: [new TextRun({ text: '_________________________________', font: 'Calibri', size: 22 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 30 },
    children: [new TextRun({ text: '[NOMBRE COMPLETO]', font: 'Calibri', size: 22, bold: true })] }),
  new Paragraph({ alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'Acepta la propuesta por LA INSTITUCIÓN', font: 'Calibri', size: 20, color: '727784' })] }),
])] });

d.Packer.toBuffer(doc).then((b) => {
  fs.writeFileSync(__dirname + '/../Propuesta-mejoras-AulaFacil.docx', b);
  console.log('Propuesta:', b.length, 'bytes');
});
