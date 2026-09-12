const d = require('docx');
const { Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell,
        WidthType, ShadingType, BorderStyle, LevelFormat, convertInchesToTwip } = d;

const ROJO = 'D02B2F', GRIS = '3A3B3E', GRIS_CLARO = 'F2F2F5';

const numbering = {
  config: [{
    reference: 'vinetas',
    levels: [
      { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: convertInchesToTwip(0.3), hanging: convertInchesToTwip(0.18) } } } },
      { level: 1, format: LevelFormat.BULLET, text: '–', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: convertInchesToTwip(0.6), hanging: convertInchesToTwip(0.18) } } } },
    ],
  }, {
    reference: 'pasos',
    levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: convertInchesToTwip(0.35), hanging: convertInchesToTwip(0.2) } } } }],
  }],
};

const T = (t, o = {}) => new TextRun({ text: t, font: 'Calibri', size: 22, ...o });

const P = (t, o = {}) => new Paragraph({
  children: Array.isArray(t) ? t : [T(t, o.run || {})],
  spacing: { after: 120, line: 276 }, ...o.par,
});

const H1 = (t) => new Paragraph({
  children: [new TextRun({ text: t, font: 'Calibri', size: 34, bold: true, color: ROJO })],
  heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 160 },
});

const H2 = (t) => new Paragraph({
  children: [new TextRun({ text: t, font: 'Calibri', size: 26, bold: true, color: GRIS })],
  heading: HeadingLevel.HEADING_2, spacing: { before: 260, after: 120 },
});

const H3 = (t) => new Paragraph({
  children: [new TextRun({ text: t, font: 'Calibri', size: 23, bold: true, color: GRIS })],
  heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 90 },
});

const LI = (t, nivel = 0) => new Paragraph({
  children: [T(t)], numbering: { reference: 'vinetas', level: nivel }, spacing: { after: 70 },
});

// Cada bloque de pasos necesita su propia "instancia" de numeracion; si no,
// Word sigue contando desde donde se quedo el bloque anterior (4, 5, 6...).
const PASO = (t, inst = 0) => new Paragraph({
  children: [T(t)], numbering: { reference: 'pasos', level: 0, instance: inst },
  spacing: { after: 70 },
});

const NOTA = (t) => new Paragraph({
  children: [T(t, { italics: true })],
  shading: { type: ShadingType.CLEAR, fill: GRIS_CLARO },
  border: { left: { style: BorderStyle.SINGLE, size: 18, color: ROJO, space: 8 } },
  spacing: { before: 140, after: 160 }, indent: { left: 120, right: 120 },
});

// ancho util carta: 12240 - 2*1440 = 9360 dxa
function TABLA(encabezados, filas, anchos) {
  const cols = anchos || encabezados.map(() => Math.floor(9360 / encabezados.length));
  const celda = (txt, i, negrita, fondo) => new TableCell({
    width: { size: cols[i], type: WidthType.DXA },
    shading: fondo ? { type: ShadingType.CLEAR, fill: fondo } : undefined,
    margins: { top: 70, bottom: 70, left: 110, right: 110 },
    children: [new Paragraph({ children: [T(String(txt), { bold: !!negrita, size: 20,
      color: negrita ? 'FFFFFF' : undefined })], spacing: { after: 0 } })],
  });
  return new Table({
    columnWidths: cols,
    width: { size: cols.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    rows: [
      new TableRow({ tableHeader: true, children: encabezados.map((h, i) => celda(h, i, true, ROJO)) }),
      ...filas.map((f, n) => new TableRow({
        children: f.map((c, i) => celda(c, i, false, n % 2 ? GRIS_CLARO : undefined)),
      })),
    ],
  });
}

const PORTADA = (titulo, subtitulo, pie) => [
  new Paragraph({ spacing: { before: 2200 }, children: [] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 },
    children: [new TextRun({ text: 'AulaFácil', font: 'Calibri', size: 64, bold: true, color: ROJO })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 },
    children: [new TextRun({ text: 'Colegio Pedro de Gante', font: 'Calibri', size: 26, color: GRIS })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 90 },
    children: [new TextRun({ text: titulo, font: 'Calibri', size: 40, bold: true, color: GRIS })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 900 },
    children: [new TextRun({ text: subtitulo, font: 'Calibri', size: 24, color: GRIS })] }),
  new Paragraph({ alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: pie, font: 'Calibri', size: 20, color: '727784' })] }),
  new Paragraph({ children: [new d.PageBreak()] }),
];

const SECCION = (hijos) => ({
  properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
  children: hijos,
});

module.exports = { d, numbering, T, P, H1, H2, H3, LI, PASO, NOTA, TABLA, PORTADA, SECCION, ROJO, GRIS };
