const { d, numbering, T, P, H1, H2, LI, PASO, NOTA, TABLA, SECCION, ROJO, GRIS } = require('./comun.js');
const fs = require('fs');

// Una sola hoja, para imprimir y pegar en el salon. Sin portada ni indice:
// un alumno no lee un documento de ocho paginas, lee media cartulina.
const ENCABEZADO = [
  new d.Paragraph({
    alignment: d.AlignmentType.CENTER, spacing: { after: 40 },
    children: [new d.TextRun({ text: 'AulaFácil', font: 'Calibri', size: 44, bold: true, color: ROJO })],
  }),
  new d.Paragraph({
    alignment: d.AlignmentType.CENTER, spacing: { after: 160 },
    children: [new d.TextRun({ text: 'Guía rápida del alumno  ·  Colegio Pedro de Gante', font: 'Calibri', size: 20, color: GRIS })],
  }),
];

const HOJA = (hijos) => ({
  properties: { page: { size: { width: 12240, height: 15840 },
    margin: { top: 1000, bottom: 800, left: 1100, right: 1100 } } },
  children: hijos,
});

const doc = new d.Document({ numbering, sections: [HOJA([
  ...ENCABEZADO,

  H2('Cómo entrar'),
  P('Abre el link que te dio tu maestro. Tu usuario es tu matrícula y tu contraseña también, hasta que la cambies.'),
  P('Con cada maestro tienes una cuenta distinta, aunque la matrícula sea la misma. Si entras con la de otra materia, la app no te va a dejar.'),

  H2('Si dice que la clase o el examen no es de tu cuenta'),
  P('No es tu internet. Abajo del mensaje dice con qué cuenta entraste y hay un botón que dice "No soy yo — entrar con otra cuenta". Úsalo y entra con la de esa materia.'),

  H2('Registrar tu asistencia'),
  P('Escanea con la cámara el código que tu maestro proyecta. Una vez basta: si todavía no habías iniciado sesión, te da tiempo de hacerlo.'),
  P('Si escaneas tarde, puede quedarte retardo en vez de asistencia. El código cambia cada 20 segundos, así que una captura que te manden no sirve.'),

  H2('Presentar un examen'),
  P('Antes de empezar, ten batería y conéctate al wifi. Una vez que entras, corre el tiempo.'),
  LI('Tu nombre aparece muy tenue sobre la pantalla. Si tomas una captura, sale con tu nombre.'),
  LI('Si te sales de la pantalla del examen, te avisa una vez. A la segunda, se cierra y se entrega con lo que lleves.'),
  LI('Si copias el texto de una pregunta, queda anotado y tu maestro lo ve.'),
  LI('En las preguntas de matemáticas tienes un teclado con los símbolos que tu celular no trae.'),
  LI('Si te piden el procedimiento, escríbelo con el dedo en la pizarra que aparece.'),

  NOTA('Si se te va el internet, no cierres nada. Lo que contestaste se guarda en tu teléfono y se manda solo cuando vuelve la señal. Cerrar la página es lo único que sí te puede costar el examen.'),

  H2('Problemas comunes'),
  TABLA(['Lo que ves', 'Qué hacer'], [
    ['Matrícula o contraseña incorrectas', 'Revisa que sea la cuenta de ESA materia'],
    ['Este código ya expiró', 'Vuelve a escanear el de la pantalla, no una captura'],
    ['Esta clase no es de tu cuenta', 'Usa el botón "No soy yo" y entra con la correcta'],
    ['Tu maestro todavía no publica este examen', 'Avísale. No es tu teléfono'],
    ['No hay clase activa', 'Tu maestro todavía no la inicia'],
  ], [3900, 5460]),

  new d.Paragraph({
    alignment: d.AlignmentType.CENTER, spacing: { before: 120 },
    children: [new d.TextRun({ text: 'Versión 2.0 · Septiembre 2026', font: 'Calibri', size: 18, color: '727784' })],
  }),
])] });

d.Packer.toBuffer(doc).then((b) => {
  fs.writeFileSync(__dirname + '/../Manual-del-alumno-AulaFacil.docx', b);
  console.log('Guía del alumno (una hoja) generada');
});
