const { d, numbering, T, P, H1, H2, LI, NOTA, PORTADA, SECCION, ROJO, GRIS } = require('./comun.js');
const fs = require('fs');
const { Paragraph, TextRun, AlignmentType } = d;

const CL = (n, titulo) => new Paragraph({
  children: [new TextRun({ text: `CLÁUSULA ${n}. ${titulo}`, font: 'Calibri', size: 24, bold: true, color: GRIS })],
  heading: d.HeadingLevel.HEADING_2, spacing: { before: 280, after: 120 },
});

const FIRMA = (rol, nombre) => [
  new Paragraph({ spacing: { before: 700 }, children: [] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 },
    children: [new TextRun({ text: '_________________________________', font: 'Calibri', size: 22 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 30 },
    children: [new TextRun({ text: nombre, font: 'Calibri', size: 22, bold: true })] }),
  new Paragraph({ alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: rol, font: 'Calibri', size: 20, color: '727784' })] }),
];

const doc = new d.Document({ numbering, sections: [SECCION([
  ...PORTADA('Convenio de licencia de uso', 'Borrador para revisión legal', 'Versión 1.0 · Septiembre 2026'),

  H1('Antes de usar este documento'),
  NOTA('Este es un BORRADOR preparado como punto de partida, no un documento legal validado. No fue redactado por un abogado y no sustituye asesoría profesional. Antes de firmarlo, debe revisarlo alguien con formación jurídica.'),
  H2('Tres cosas que hay que verificar primero'),
  LI('El convenio de estadía con la universidad. Los convenios de estadía suelen incluir cláusulas de propiedad intelectual que pueden asignar lo desarrollado a la institución receptora o a la universidad. Si existe una cláusula así, tiene prioridad y este convenio no puede contradecirla. Consíguela y léela antes de negociar.'),
  LI('En México, la Ley Federal del Derecho de Autor distingue derechos morales, que son inalienables y siempre permanecen en el autor, de derechos patrimoniales, que sí se pueden licenciar o transmitir. Conviene que un abogado verifique cómo se articula este convenio con esa ley.'),
  LI('Si la institución tiene un formato propio de convenio, es probable que prefiera usar el suyo. En ese caso, lo valioso de este borrador son las cláusulas 4, 5, 6 y 9: asegúrate de que el suyo diga lo mismo.'),
  new Paragraph({ children: [new d.PageBreak()] }),

  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 300 },
    children: [new TextRun({ text: 'CONVENIO DE LICENCIA DE USO DE SOFTWARE',
      font: 'Calibri', size: 30, bold: true, color: ROJO })] }),

  P([T('Que celebran, por una parte, '), T('[NOMBRE COMPLETO DEL DESARROLLADOR]', { bold: true }),
     T(', por su propio derecho, a quien en lo sucesivo se le denominará '), T('"EL DESARROLLADOR"', { bold: true }),
     T('; y por la otra, '), T('[NOMBRE LEGAL DE LA INSTITUCIÓN]', { bold: true }),
     T(', representada en este acto por '), T('[NOMBRE Y CARGO DEL REPRESENTANTE]', { bold: true }),
     T(', a quien se le denominará '), T('"LA INSTITUCIÓN"', { bold: true }),
     T('; y conjuntamente '), T('"LAS PARTES"', { bold: true }),
     T(', al tenor de los siguientes antecedentes y cláusulas.')]),

  H1('ANTECEDENTES'),
  P([T('PRIMERO. ', { bold: true }), T('EL DESARROLLADOR es autor del programa de cómputo denominado '),
     T('AulaFácil', { bold: true }), T(' (en lo sucesivo, "EL SOFTWARE"), consistente en una plataforma web para la gestión de exámenes, asistencia, participación y calificaciones escolares.')]),
  P([T('SEGUNDO. ', { bold: true }), T('EL SOFTWARE fue desarrollado por EL DESARROLLADOR en el marco de su estadía profesional realizada en LA INSTITUCIÓN durante el periodo [FECHAS], y fue personalizado para las necesidades operativas de esta última.')]),
  P([T('TERCERO. ', { bold: true }), T('LAS PARTES desean establecer por escrito los términos bajo los cuales LA INSTITUCIÓN podrá continuar utilizando EL SOFTWARE, así como la titularidad de los derechos sobre el mismo.')]),

  H1('CLÁUSULAS'),

  CL('PRIMERA', 'OBJETO'),
  P('EL DESARROLLADOR otorga a LA INSTITUCIÓN una licencia de uso sobre EL SOFTWARE, en los términos y con los alcances que se establecen en el presente convenio.'),

  CL('SEGUNDA', 'DESCRIPCIÓN DEL SOFTWARE'),
  P('EL SOFTWARE comprende el código fuente, la base de datos y su estructura, las funciones de servidor, los archivos de configuración y la documentación técnica y de usuario que lo acompaña.'),

  CL('TERCERA', 'ENTREGABLES'),
  P('EL DESARROLLADOR entrega a LA INSTITUCIÓN:'),
  LI('EL SOFTWARE instalado y en funcionamiento.'),
  LI('Manual técnico, manual del maestro y manual del alumno.'),
  LI('Los accesos administrativos necesarios para operar la plataforma.'),
  LI('Una sesión de capacitación al personal docente.'),

  CL('CUARTA', 'TITULARIDAD DE LOS DERECHOS'),
  P('LA INSTITUCIÓN reconoce expresamente que EL DESARROLLADOR es el único titular de los derechos patrimoniales de autor sobre EL SOFTWARE, incluyendo su código fuente, arquitectura, diseño y documentación.'),
  P('El presente convenio no transmite a LA INSTITUCIÓN la propiedad de EL SOFTWARE, sino únicamente el derecho de uso descrito en la cláusula siguiente.'),

  CL('QUINTA', 'ALCANCE DE LA LICENCIA'),
  P('La licencia que se otorga tiene las siguientes características:'),
  LI('Perpetua: no tiene fecha de vencimiento.'),
  LI('Gratuita: LA INSTITUCIÓN no deberá pagar contraprestación alguna por su uso.'),
  LI('No exclusiva: EL DESARROLLADOR conserva el derecho de licenciar, comercializar o explotar EL SOFTWARE con terceros, incluidas otras instituciones educativas.'),
  LI('Intransferible: LA INSTITUCIÓN no podrá cederla, sublicenciarla ni comercializarla.'),
  LI('Para uso interno: limitada a las actividades académicas y administrativas propias de LA INSTITUCIÓN.'),

  CL('SEXTA', 'DERECHO DE COMERCIALIZACIÓN'),
  P('LAS PARTES reconocen que EL DESARROLLADOR podrá comercializar, licenciar, modificar y explotar EL SOFTWARE libremente, sin necesidad de autorización de LA INSTITUCIÓN y sin obligación de compartir con ella los beneficios derivados.'),
  P('Dicha explotación se realizará bajo una denominación e identidad gráfica distintas de las de LA INSTITUCIÓN, conforme a la cláusula séptima.'),

  CL('SÉPTIMA', 'IDENTIDAD INSTITUCIONAL'),
  P('El nombre, logotipo, colores institucionales y demás elementos de identidad de LA INSTITUCIÓN son de su exclusiva propiedad. EL DESARROLLADOR los utiliza únicamente en la versión personalizada y se obliga a no incorporarlos en versiones comerciales ni en materiales promocionales sin autorización previa y por escrito.'),
  P('LA INSTITUCIÓN autoriza a EL DESARROLLADOR a mencionar el proyecto y su implementación con fines curriculares, académicos y de portafolio profesional.'),

  CL('OCTAVA', 'DATOS PERSONALES'),
  P('Los datos de alumnos, docentes y todo registro académico generado mediante EL SOFTWARE son propiedad de LA INSTITUCIÓN, quien será la responsable de su tratamiento conforme a la normatividad aplicable en materia de protección de datos personales.'),
  P('EL DESARROLLADOR no conservará, utilizará ni transferirá dichos datos una vez concluida la entrega, y no los incorporará a ninguna versión comercial de EL SOFTWARE.'),

  CL('NOVENA', 'SOPORTE Y MANTENIMIENTO'),
  P('La obligación de EL DESARROLLADOR concluye con la entrega de los entregables señalados en la cláusula tercera. El presente convenio no genera obligación alguna de soporte técnico, mantenimiento, corrección de errores ni desarrollo de nuevas funciones con posterioridad a dicha entrega.'),
  P('Cualquier servicio posterior deberá pactarse por separado y podrá estar sujeto a contraprestación.'),

  CL('DÉCIMA', 'AUSENCIA DE GARANTÍA'),
  P('EL SOFTWARE se entrega en el estado en que se encuentra. EL DESARROLLADOR no garantiza que su funcionamiento sea ininterrumpido o libre de errores, ni asume responsabilidad por daños derivados de su uso, de fallas en servicios de terceros de los que depende, o de la infraestructura de red de LA INSTITUCIÓN.'),
  P('LA INSTITUCIÓN reconoce que EL SOFTWARE depende de servicios de terceros y que la continuidad de dichos servicios no está bajo control de EL DESARROLLADOR.'),

  CL('DÉCIMA PRIMERA', 'CONFIDENCIALIDAD'),
  P('LAS PARTES se obligan a guardar confidencialidad respecto de la información que reciban con tal carácter, obligación que subsistirá por [NÚMERO] años contados a partir de la terminación del presente convenio.'),

  CL('DÉCIMA SEGUNDA', 'MODIFICACIONES'),
  P('LA INSTITUCIÓN podrá solicitar modificaciones o adaptaciones a EL SOFTWARE. En caso de que EL DESARROLLADOR las realice, los derechos sobre dichas modificaciones le corresponderán a él, quedando comprendidas dentro de la licencia otorgada en la cláusula quinta.'),
  P('Si LA INSTITUCIÓN encomienda modificaciones a un tercero, deberá informarlo previamente a EL DESARROLLADOR, quien quedará liberado de toda responsabilidad respecto del funcionamiento de EL SOFTWARE a partir de ese momento.'),

  CL('DÉCIMA TERCERA', 'VIGENCIA'),
  P('El presente convenio surte efectos a partir de la fecha de su firma y tiene vigencia indefinida, salvo terminación por acuerdo de LAS PARTES.'),
  P('Las cláusulas cuarta, sexta, séptima, octava y décima subsistirán aun en caso de terminación.'),

  CL('DÉCIMA CUARTA', 'LEGISLACIÓN Y JURISDICCIÓN'),
  P('Para la interpretación y cumplimiento del presente convenio, LAS PARTES se someten a la legislación aplicable en los Estados Unidos Mexicanos y a la jurisdicción de los tribunales competentes de [CIUDAD, ESTADO], renunciando a cualquier otro fuero que pudiera corresponderles.'),

  new Paragraph({ spacing: { before: 400, after: 200 }, children: [
    T('Leído que fue el presente convenio y enteradas LAS PARTES de su contenido y alcance legal, lo firman de conformidad en '),
    T('[CIUDAD]', { bold: true }), T(', a los '), T('[DÍA]', { bold: true }),
    T(' días del mes de '), T('[MES]', { bold: true }), T(' de '), T('[AÑO]', { bold: true }), T('.')] }),

  ...FIRMA('EL DESARROLLADOR', '[NOMBRE COMPLETO]'),
  ...FIRMA('EL REPRESENTANTE LEGAL DE LA INSTITUCIÓN', '[NOMBRE COMPLETO]'),
])] });

d.Packer.toBuffer(doc).then((b) => { fs.writeFileSync('Convenio-licencia-AulaFacil-BORRADOR.docx', b); console.log('Convenio:', b.length, 'bytes'); });
