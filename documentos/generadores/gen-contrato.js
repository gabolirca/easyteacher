const { d, numbering, T, P, H1, H2, LI, NOTA, TABLA, PORTADA, SECCION, ROJO, GRIS } = require('./comun.js');
const fs = require('fs');
const { Paragraph, TextRun, AlignmentType } = d;

const ORDINALES = ['PRIMERA','SEGUNDA','TERCERA','CUARTA','QUINTA','SEXTA','SÉPTIMA',
  'OCTAVA','NOVENA','DÉCIMA','DÉCIMA PRIMERA','DÉCIMA SEGUNDA','DÉCIMA TERCERA',
  'DÉCIMA CUARTA','DÉCIMA QUINTA','DÉCIMA SEXTA','DÉCIMA SÉPTIMA'];
let nCl = 0;
const CL = (titulo) => new Paragraph({
  children: [new TextRun({ text: `CLÁUSULA ${ORDINALES[nCl++]}. ${titulo}`, font: 'Calibri', size: 24, bold: true, color: GRIS })],
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
  ...PORTADA('Convenio de licencia de uso', 'Borrador para revisión legal', 'Versión 1.1 · Septiembre 2026'),

  H1('Antes de usar este documento'),
  NOTA('Este es un BORRADOR preparado como punto de partida, no un documento legal validado. No fue redactado por un abogado y no sustituye asesoría profesional. Antes de firmarlo, debe revisarlo alguien con formación jurídica.'),
  H2('Tres cosas que hay que verificar primero'),
  LI('Que el desarrollo no haya quedado cubierto por ningún convenio de estadía, beca o materia. Esos documentos suelen asignar lo desarrollado a la institución receptora o a la universidad, y si existe una cláusula así tiene prioridad sobre este convenio. El antecedente SEGUNDO afirma que el software se hizo por cuenta propia: verifica que eso sea exacto antes de firmarlo, porque de ahí cuelga toda la cláusula de titularidad.'),
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
  P([T('SEGUNDO. ', { bold: true }), T('EL SOFTWARE fue desarrollado por EL DESARROLLADOR por cuenta propia, con sus propios medios y fuera de cualquier relación laboral, académica o de estadía profesional con LA INSTITUCIÓN, y posteriormente fue configurado para las necesidades operativas de esta última.')]),
  P([T('TERCERO. ', { bold: true }), T('LA INSTITUCIÓN ha venido utilizando EL SOFTWARE desde [FECHA] con fines operativos, con el conocimiento y la autorización de EL DESARROLLADOR.')]),
  P([T('CUARTO. ', { bold: true }), T('LAS PARTES desean establecer por escrito los términos bajo los cuales LA INSTITUCIÓN podrá continuar utilizando EL SOFTWARE, así como la titularidad de los derechos sobre el mismo.')]),

  H1('CLÁUSULAS'),

  CL('OBJETO'),
  P('EL DESARROLLADOR otorga a LA INSTITUCIÓN una licencia de uso sobre EL SOFTWARE, en los términos y con los alcances que se establecen en el presente convenio.'),

  CL('DESCRIPCIÓN DEL SOFTWARE'),
  P('EL SOFTWARE comprende el código fuente, la base de datos y su estructura, las funciones de servidor, los archivos de configuración y la documentación técnica y de usuario que lo acompaña.'),

  CL('ENTREGABLES'),
  P('EL DESARROLLADOR entrega a LA INSTITUCIÓN:'),
  LI('EL SOFTWARE instalado y en funcionamiento.'),
  LI('Manual técnico, manual del maestro y manual del alumno.'),
  LI('Los accesos administrativos necesarios para operar la plataforma.'),
  LI('Una sesión de capacitación al personal docente.'),

  CL('CONTRAPRESTACIÓN'),
  P([T('Como contraprestación por el desarrollo y la licencia de uso descritos en este convenio, LA INSTITUCIÓN pagará a EL DESARROLLADOR la cantidad de '),
     T('$81,000.00 M.N. (ochenta y un mil pesos 00/100 moneda nacional)', { bold: true }),
     T('.')]),
  P('Dicha cantidad resulta de 180 horas de desarrollo a una tarifa de $450.00 M.N. por hora, correspondiente al nivel de desarrollador junior según los precios de mercado vigentes en México. El desglose por módulo se detalla en el Anexo A, que forma parte integrante de este convenio.'),
  P('El pago se realizará conforme al siguiente calendario:'),
  LI('50% ($40,500.00 M.N.) a la firma del presente convenio.'),
  LI('50% ($40,500.00 M.N.) contra entrega de los entregables señalados en la cláusula tercera y concluida la sesión de capacitación.'),
  P('Las cantidades señaladas no incluyen los costos de los servicios de terceros necesarios para la operación de EL SOFTWARE, los cuales serán cubiertos directamente por LA INSTITUCIÓN conforme a la cláusula décima primera.'),
  NOTA('Los trabajos adicionales que LA INSTITUCIÓN solicite y que no estén comprendidos en la cláusula tercera se cotizarán por separado, tomando como base la misma tarifa de $450.00 M.N. por hora.'),

  CL('TITULARIDAD DE LOS DERECHOS'),
  P('LA INSTITUCIÓN reconoce expresamente que EL DESARROLLADOR es el único titular de los derechos patrimoniales de autor sobre EL SOFTWARE, incluyendo su código fuente, arquitectura, diseño y documentación.'),
  P('El presente convenio no transmite a LA INSTITUCIÓN la propiedad de EL SOFTWARE, sino únicamente el derecho de uso descrito en la cláusula siguiente.'),

  CL('ALCANCE DE LA LICENCIA'),
  P('La licencia que se otorga tiene las siguientes características:'),
  LI('Perpetua: no tiene fecha de vencimiento.'),
  LI('Gratuita: LA INSTITUCIÓN no deberá pagar contraprestación alguna por su uso.'),
  LI('No exclusiva: EL DESARROLLADOR conserva el derecho de licenciar, comercializar o explotar EL SOFTWARE con terceros, incluidas otras instituciones educativas.'),
  LI('Intransferible: LA INSTITUCIÓN no podrá cederla, sublicenciarla ni comercializarla.'),
  LI('Para uso interno: limitada a las actividades académicas y administrativas propias de LA INSTITUCIÓN.'),

  CL('DERECHO DE COMERCIALIZACIÓN'),
  P('LAS PARTES reconocen que EL DESARROLLADOR podrá comercializar, licenciar, modificar y explotar EL SOFTWARE libremente, sin necesidad de autorización de LA INSTITUCIÓN y sin obligación de compartir con ella los beneficios derivados.'),
  P('Dicha explotación se realizará bajo una denominación e identidad gráfica distintas de las de LA INSTITUCIÓN, conforme a la cláusula séptima.'),

  CL('IDENTIDAD INSTITUCIONAL'),
  P('El nombre, logotipo, colores institucionales y demás elementos de identidad de LA INSTITUCIÓN son de su exclusiva propiedad. EL DESARROLLADOR los utiliza únicamente en la versión personalizada y se obliga a no incorporarlos en versiones comerciales ni en materiales promocionales sin autorización previa y por escrito.'),
  P('LA INSTITUCIÓN autoriza a EL DESARROLLADOR a mencionar el proyecto y su implementación con fines curriculares, académicos y de portafolio profesional.'),

  CL('DATOS PERSONALES'),
  P('Los datos de alumnos, docentes y todo registro académico generado mediante EL SOFTWARE son propiedad de LA INSTITUCIÓN, quien será la responsable de su tratamiento conforme a la normatividad aplicable en materia de protección de datos personales.'),
  P('LAS PARTES reconocen que EL SOFTWARE almacena datos personales de menores de edad —nombre, matrícula, asistencia, calificaciones y participación—, por lo que LA INSTITUCIÓN se obliga a contar con el aviso de privacidad y los consentimientos que exige la legislación mexicana en la materia.'),
  P('EL DESARROLLADOR tendrá el carácter de encargado del tratamiento y únicamente accederá a los datos cuando resulte indispensable para prestar soporte, previa solicitud de LA INSTITUCIÓN y limitándose a lo necesario para atenderla.'),
  P('EL DESARROLLADOR no conservará, utilizará ni transferirá dichos datos una vez concluida la entrega, y no los incorporará a ninguna versión comercial de EL SOFTWARE.'),

  CL('SOPORTE Y MANTENIMIENTO'),
  P('La obligación de EL DESARROLLADOR concluye con la entrega de los entregables señalados en la cláusula tercera. El presente convenio no genera obligación alguna de soporte técnico, mantenimiento, corrección de errores ni desarrollo de nuevas funciones con posterioridad a dicha entrega.'),
  P('Cualquier servicio posterior deberá pactarse por separado y podrá estar sujeto a contraprestación.'),

  CL('AUSENCIA DE GARANTÍA'),
  P('EL SOFTWARE se entrega en el estado en que se encuentra. EL DESARROLLADOR no garantiza que su funcionamiento sea ininterrumpido o libre de errores, ni asume responsabilidad por daños derivados de su uso, de fallas en servicios de terceros de los que depende, o de la infraestructura de red de LA INSTITUCIÓN.'),
  P('LA INSTITUCIÓN reconoce que EL SOFTWARE depende de servicios de terceros y que la continuidad de dichos servicios no está bajo control de EL DESARROLLADOR.'),

  CL('CONFIDENCIALIDAD'),
  P('LAS PARTES se obligan a guardar confidencialidad respecto de la información que reciban con tal carácter, obligación que subsistirá por [NÚMERO] años contados a partir de la terminación del presente convenio.'),

  CL('MODIFICACIONES'),
  P('LA INSTITUCIÓN podrá solicitar modificaciones o adaptaciones a EL SOFTWARE. En caso de que EL DESARROLLADOR las realice, los derechos sobre dichas modificaciones le corresponderán a él, quedando comprendidas dentro de la licencia otorgada en la cláusula sexta.'),
  P('Si LA INSTITUCIÓN encomienda modificaciones a un tercero, deberá informarlo previamente a EL DESARROLLADOR, quien quedará liberado de toda responsabilidad respecto del funcionamiento de EL SOFTWARE a partir de ese momento.'),

  CL('VIGENCIA'),
  P('El presente convenio surte efectos a partir de la fecha de su firma y tiene vigencia indefinida, salvo terminación por acuerdo de LAS PARTES.'),
  P('Las cláusulas quinta, séptima, octava, novena y décima primera subsistirán aun en caso de terminación.'),

  CL('LEGISLACIÓN Y JURISDICCIÓN'),
  P('Para la interpretación y cumplimiento del presente convenio, LAS PARTES se someten a la legislación aplicable en los Estados Unidos Mexicanos y a la jurisdicción de los tribunales competentes de [CIUDAD, ESTADO], renunciando a cualquier otro fuero que pudiera corresponderles.'),

  new Paragraph({ spacing: { before: 400, after: 200 }, children: [
    T('Leído que fue el presente convenio y enteradas LAS PARTES de su contenido y alcance legal, lo firman de conformidad en '),
    T('[CIUDAD]', { bold: true }), T(', a los '), T('[DÍA]', { bold: true }),
    T(' días del mes de '), T('[MES]', { bold: true }), T(' de '), T('[AÑO]', { bold: true }), T('.')] }),

  ...FIRMA('EL DESARROLLADOR', '[NOMBRE COMPLETO]'),
  ...FIRMA('EL REPRESENTANTE LEGAL DE LA INSTITUCIÓN', '[NOMBRE COMPLETO]'),

  new Paragraph({ spacing: { before: 500, after: 0 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'TESTIGOS', font: 'Calibri', size: 22, bold: true, color: GRIS })] }),
  ...FIRMA('TESTIGO', '[NOMBRE COMPLETO]'),
  ...FIRMA('TESTIGO', '[NOMBRE COMPLETO]'),

  new Paragraph({ children: [new d.PageBreak()] }),
  H1('Anexo A. Desglose de horas'),
  P('Base del importe señalado en la cláusula cuarta. Tarifa aplicada: $450.00 M.N. por hora, nivel desarrollador junior.'),
  TABLA(['Módulo', 'Horas', 'Importe'], [
    ['Arquitectura, base de datos y seguridad por filas', '20', '$9,000'],
    ['Autenticación y perfiles de maestro', '8', '$3,600'],
    ['Grupos, alta de alumnos, importación y buscador', '16', '$7,200'],
    ['Constructor de exámenes y tipos de pregunta', '20', '$9,000'],
    ['Aplicación del examen: antitrampas, marca de agua y modo sin red', '22', '$9,900'],
    ['Calificación automática y revisión de respuestas', '10', '$4,500'],
    ['Asistencia', '6', '$2,700'],
    ['Clase en vivo: código rotativo, pase de entrada y participación', '20', '$9,000'],
    ['Participación, rubros, periodos y calificaciones', '16', '$7,200'],
    ['Funciones de servidor', '14', '$6,300'],
    ['Aplicación instalable y funcionamiento sin red', '8', '$3,600'],
    ['Manuales y capacitación', '10', '$4,500'],
    ['Despliegue, pruebas en campo y correcciones', '10', '$4,500'],
    ['TOTAL', '180', '$81,000'],
  ], [5760, 1400, 2200]),
  NOTA('Para referencia de LA INSTITUCIÓN: el desarrollo de un sistema web de esta extensión encargado a un despacho en México se cotiza entre $300,000 y $800,000 M.N., según los precios publicados por proveedores del ramo en 2026.'),
])] });

d.Packer.toBuffer(doc).then((b) => { fs.writeFileSync(__dirname + '/../Convenio-licencia-AulaFacil-BORRADOR.docx', b); console.log('Convenio:', b.length, 'bytes'); });
