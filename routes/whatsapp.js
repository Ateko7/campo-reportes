import express from 'express';
import { parseMensaje } from '../parser.js';
import {
  getEmpresaPorWhatsapp, getEmpresa, getEmpresaPorSlug,
  getOrCreateProductor, insertReporte,
  listTiposAccion, listCultivos, listInsumos, getTipoAccion,
} from '../db.js';

const router = express.Router();

export async function configParser(empresaId) {
  const [acc, cult, ins] = await Promise.all([
    listTiposAccion(empresaId, true), listCultivos(empresaId), listInsumos(empresaId),
  ]);
  return {
    acciones: acc.map((a) => ({ clave: a.clave, palabras_clave: a.palabras_clave })),
    cultivos: cult.map((c) => c.nombre),
    insumos: ins.map((i) => i.nombre),
  };
}

export async function etiquetaTipo(empresaId, clave) {
  const t = await getTipoAccion(empresaId, clave);
  return t ? t.nombre : clave;
}

export async function construirRespuesta(empresaId, parsed) {
  const partes = [`✅ Registrado: *${await etiquetaTipo(empresaId, parsed.tipo)}*`];
  if (parsed.lote) partes.push(`📍 Lote: ${parsed.lote}`);
  if (parsed.cultivo) partes.push(`🌱 Cultivo: ${parsed.cultivo}`);
  if (parsed.producto) partes.push(`🧪 Producto: ${parsed.producto}`);
  if (parsed.cantidad != null) partes.push(`⚖️ Cantidad: ${parsed.cantidad} ${parsed.unidad || ''}`.trim());
  if (parsed.fecha) partes.push(`🗓️ Fecha: ${parsed.fecha}`);
  if (parsed.confianza < 0.4)
    partes.push('\n⚠️ Lo guardé, pero no estoy seguro de los detalles. Incluye el lote y el cultivo para registrarlo mejor.');
  return partes.join('\n');
}

function twiml(mensaje) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${esc(mensaje)}</Message></Response>`;
}

export async function procesarMensaje({ empresaId, body, from, fromName, mediaUrl, lat, lng }) {
  const telefono = (from || 'desconocido').replace('whatsapp:', '').trim();
  const productor = await getOrCreateProductor(empresaId, telefono, fromName);
  const parsed = parseMensaje(body || '', await configParser(empresaId));
  const reporte = await insertReporte({
    empresa_id: empresaId, productor_id: productor.id, tipo: parsed.tipo,
    lote: parsed.lote, cultivo: parsed.cultivo, fecha: parsed.fecha,
    producto: parsed.producto, cantidad: parsed.cantidad, unidad: parsed.unidad,
    notas: parsed.notas, mensaje_original: body, foto_url: mediaUrl || null,
    lat: lat != null && lat !== '' ? Number(lat) : null,
    lng: lng != null && lng !== '' ? Number(lng) : null, canal: 'whatsapp',
  });
  return { parsed, reporte, productor };
}

async function resolverEmpresa(to) {
  const numero = (to || '').replace('whatsapp:', '').trim();
  let emp = numero ? await getEmpresaPorWhatsapp(numero) : null;
  if (!emp && process.env.EMPRESA_DEFAULT_SLUG) emp = await getEmpresaPorSlug(process.env.EMPRESA_DEFAULT_SLUG);
  return emp;
}

router.post('/whatsapp', async (req, res) => {
  try {
    const b = req.body || {};
    const empresa = await resolverEmpresa(b.To);
    if (!empresa) return res.type('text/xml').send(twiml('No pudimos identificar tu empresa. Contacta al administrador.'));
    const numMedia = parseInt(b.NumMedia || '0', 10);
    const { parsed } = await procesarMensaje({
      empresaId: empresa.id, body: b.Body || '', from: b.From, fromName: b.ProfileName,
      mediaUrl: numMedia > 0 ? b.MediaUrl0 : null, lat: b.Latitude, lng: b.Longitude,
    });
    res.type('text/xml').send(twiml(await construirRespuesta(empresa.id, parsed)));
  } catch (e) { console.error(e); res.type('text/xml').send(twiml('Ocurrió un error al registrar. Intenta de nuevo.')); }
});

export default router;
