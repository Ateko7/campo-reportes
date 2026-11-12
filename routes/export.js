import express from 'express';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import {
  listReportes, listTiposAccion,
  reporteAplicaciones, reporteCosechas, reporteCantidadesCosechadas,
} from '../db.js';

const router = express.Router();
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => { console.error(e); if (!res.headersSent) res.status(500).send('Error generando archivo'); });

function parseFiltros(q) {
  return {
    tipo: q.tipo || null, lote: q.lote || null, cultivo: q.cultivo || null,
    desde: q.desde || null, hasta: q.hasta || null, q: q.q || null, limit: 5000,
  };
}
async function etiquetas(empresaId) {
  return Object.fromEntries((await listTiposAccion(empresaId)).map((a) => [a.clave, a.nombre]));
}

function enviarExcel(res, nombre, hojas) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Campo Reportes';
  for (const h of hojas) {
    const ws = wb.addWorksheet(h.nombre);
    ws.columns = h.columns;
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF166534' } };
    h.rows.forEach((r) => ws.addRow(r));
  }
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${nombre}-${Date.now()}.xlsx"`);
  return wb.xlsx.write(res).then(() => res.end());
}
function nuevoPDF(res, nombre, titulo, subtitulo) {
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${nombre}-${Date.now()}.pdf"`);
  doc.pipe(res);
  doc.fillColor('#166534').fontSize(20).text(titulo);
  doc.moveDown(0.2);
  doc.fillColor('#555').fontSize(10).text(subtitulo);
  doc.moveDown(1);
  return doc;
}
function tablaPDF(doc, headers, rows, anchos) {
  const x0 = 40; let y = doc.y;
  const drawRow = (cells, bold) => {
    doc.fontSize(9).fillColor(bold ? '#166534' : '#111');
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica');
    let x = x0;
    cells.forEach((c, i) => { doc.text(String(c ?? ''), x + 2, y + 2, { width: anchos[i] - 4 }); x += anchos[i]; });
    y += 18;
    doc.strokeColor('#e5e7eb').moveTo(x0, y).lineTo(x0 + anchos.reduce((a, b) => a + b, 0), y).stroke();
    if (y > 770) { doc.addPage(); y = 50; }
  };
  drawRow(headers, true);
  rows.forEach((r) => drawRow(r, false));
  doc.y = y + 6; doc.font('Helvetica');
}

/* ===== General ===== */
router.get('/excel', wrap(async (req, res) => {
  const lbl = await etiquetas(req.empresaId);
  const rows = await listReportes(req.empresaId, parseFiltros(req.query));
  return enviarExcel(res, 'reportes-campo', [{
    nombre: 'Reportes',
    columns: [
      { header: 'Fecha registro', key: 'created_at', width: 20 },
      { header: 'Acción', key: 'tipo', width: 14 },
      { header: 'Productor', key: 'productor_nombre', width: 22 },
      { header: 'Teléfono', key: 'productor_telefono', width: 18 },
      { header: 'Lote', key: 'lote', width: 12 },
      { header: 'Cultivo', key: 'cultivo', width: 14 },
      { header: 'Fecha evento', key: 'fecha', width: 14 },
      { header: 'Producto', key: 'producto', width: 18 },
      { header: 'Cantidad', key: 'cantidad', width: 10 },
      { header: 'Unidad', key: 'unidad', width: 10 },
      { header: 'Lat', key: 'lat', width: 12 },
      { header: 'Lng', key: 'lng', width: 12 },
      { header: 'Notas', key: 'notas', width: 40 },
    ],
    rows: rows.map((r) => ({ ...r, tipo: lbl[r.tipo] || r.tipo })),
  }]);
}));

router.get('/pdf', wrap(async (req, res) => {
  const lbl = await etiquetas(req.empresaId);
  const rows = await listReportes(req.empresaId, parseFiltros(req.query));
  const doc = nuevoPDF(res, 'reportes-campo', 'Reporte de Campo',
    `Generado: ${new Date().toLocaleString('es-MX')} · ${rows.length} registros`);
  rows.forEach((r) => {
    if (doc.y > 760) doc.addPage();
    doc.fillColor('#166534').fontSize(12).text(`${lbl[r.tipo] || r.tipo} · ${r.lote || 's/lote'} · ${r.cultivo || 's/cultivo'}`);
    doc.fillColor('#111').fontSize(9);
    const c = [];
    if (r.productor_nombre) c.push(`Productor: ${r.productor_nombre}`);
    if (r.fecha) c.push(`Fecha: ${r.fecha}`);
    if (r.producto) c.push(`Producto: ${r.producto}`);
    if (r.cantidad != null) c.push(`Cantidad: ${r.cantidad} ${r.unidad || ''}`);
    if (r.lat && r.lng) c.push(`GPS: ${r.lat}, ${r.lng}`);
    doc.text(c.join('   |   '));
    if (r.notas) doc.fillColor('#444').text(`"${r.notas}"`);
    doc.moveDown(0.3);
    doc.strokeColor('#e5e7eb').moveTo(40, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown(0.5);
  });
  doc.end();
}));

/* ===== Aplicaciones ===== */
router.get('/aplicaciones.xlsx', wrap(async (req, res) => {
  const d = await reporteAplicaciones(req.empresaId, parseFiltros(req.query));
  return enviarExcel(res, 'aplicaciones', [
    { nombre: 'Resumen', columns: [
      { header: 'Producto', key: 'producto', width: 24 },
      { header: 'Aplicaciones', key: 'aplicaciones', width: 14 },
      { header: 'Cantidad total', key: 'cantidad', width: 16 },
      { header: 'Unidad', key: 'unidad', width: 10 },
    ], rows: d.resumen },
    { nombre: 'Detalle', columns: [
      { header: 'Fecha', key: 'fecha', width: 14 },
      { header: 'Lote', key: 'lote', width: 12 },
      { header: 'Cultivo', key: 'cultivo', width: 14 },
      { header: 'Producto', key: 'producto', width: 20 },
      { header: 'Cantidad', key: 'cantidad', width: 10 },
      { header: 'Unidad', key: 'unidad', width: 10 },
      { header: 'Productor', key: 'productor_nombre', width: 22 },
    ], rows: d.rows },
  ]);
}));
router.get('/aplicaciones.pdf', wrap(async (req, res) => {
  const d = await reporteAplicaciones(req.empresaId, parseFiltros(req.query));
  const doc = nuevoPDF(res, 'aplicaciones', 'Reporte de Aplicaciones',
    `Generado: ${new Date().toLocaleString('es-MX')} · ${d.rows.length} aplicaciones`);
  doc.fillColor('#166534').fontSize(13).text('Resumen por insumo'); doc.moveDown(0.4);
  tablaPDF(doc, ['Producto', 'Aplicaciones', 'Cantidad', 'Unidad'],
    d.resumen.map((r) => [r.producto, r.aplicaciones, r.cantidad || '-', r.unidad || '']), [230, 100, 110, 75]);
  doc.moveDown(1);
  doc.fillColor('#166534').fontSize(13).text('Detalle'); doc.moveDown(0.4);
  tablaPDF(doc, ['Fecha', 'Lote', 'Cultivo', 'Producto', 'Cant.', 'Productor'],
    d.rows.map((r) => [(r.fecha || r.created_at || '').slice(0, 10), r.lote || '-', r.cultivo || '-', r.producto || '-', `${r.cantidad ?? ''} ${r.unidad || ''}`, r.productor_nombre || '-']),
    [70, 55, 75, 110, 70, 135]);
  doc.end();
}));

/* ===== Cosechas ===== */
router.get('/cosechas.xlsx', wrap(async (req, res) => {
  const d = await reporteCosechas(req.empresaId, parseFiltros(req.query));
  return enviarExcel(res, 'cosechas', [{ nombre: 'Cosechas', columns: [
    { header: 'Fecha', key: 'fecha', width: 14 },
    { header: 'Lote', key: 'lote', width: 12 },
    { header: 'Cultivo', key: 'cultivo', width: 14 },
    { header: 'Cantidad', key: 'cantidad', width: 12 },
    { header: 'Unidad', key: 'unidad', width: 10 },
    { header: 'Productor', key: 'productor_nombre', width: 22 },
  ], rows: d.rows }]);
}));
router.get('/cosechas.pdf', wrap(async (req, res) => {
  const d = await reporteCosechas(req.empresaId, parseFiltros(req.query));
  const doc = nuevoPDF(res, 'cosechas', 'Reporte de Cosechas',
    `Generado: ${new Date().toLocaleString('es-MX')} · ${d.rows.length} cosechas`);
  tablaPDF(doc, ['Fecha', 'Lote', 'Cultivo', 'Cantidad', 'Unidad', 'Productor'],
    d.rows.map((r) => [(r.fecha || r.created_at || '').slice(0, 10), r.lote || '-', r.cultivo || '-', r.cantidad ?? '-', r.unidad || '', r.productor_nombre || '-']),
    [75, 60, 85, 75, 65, 155]);
  doc.end();
}));

/* ===== Cantidades cosechadas ===== */
router.get('/cantidades.xlsx', wrap(async (req, res) => {
  const d = await reporteCantidadesCosechadas(req.empresaId);
  return enviarExcel(res, 'cantidades-cosechadas', [{ nombre: 'Cantidades', columns: [
    { header: 'Cultivo', key: 'cultivo', width: 18 },
    { header: 'Cosechado', key: 'cosechado', width: 14 },
    { header: 'Unidad', key: 'unidad', width: 10 },
    { header: 'Estimado', key: 'estimado', width: 14 },
    { header: 'Eventos', key: 'eventos', width: 10 },
  ], rows: d.filas }]);
}));
router.get('/cantidades.pdf', wrap(async (req, res) => {
  const d = await reporteCantidadesCosechadas(req.empresaId);
  const doc = nuevoPDF(res, 'cantidades-cosechadas', 'Cantidades Cosechadas',
    `Generado: ${new Date().toLocaleString('es-MX')}`);
  tablaPDF(doc, ['Cultivo', 'Cosechado', 'Unidad', 'Estimado', 'Cumpl.', 'Eventos'],
    d.filas.map((f) => [f.cultivo, f.cosechado, f.unidad, f.estimado || '-',
      f.estimado ? Math.round((f.cosechado / f.estimado) * 100) + '%' : '-', f.eventos]),
    [150, 90, 70, 90, 70, 45]);
  doc.end();
}));

export default router;
