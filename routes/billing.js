import express from 'express';
import crypto from 'crypto';
import { requireRol, suscripcionActiva } from '../auth.js';
import { getEmpresa, actualizarEmpresa } from '../db.js';

const router = express.Router();

/*
  Integración con Recurrente (https://recurrente.com)
  -----------------------------------------------------
  API base:  https://app.recurrente.com/api
  Headers:   X-PUBLIC-KEY, X-SECRET-KEY   (desde el panel de Recurrente)
  Checkout:  POST /api/checkouts   -> devuelve checkout_url
  Webhooks:  eventos payment_intent.succeeded / payment_intent.failed / subscription.*
             (firmados con Svix; secreto por endpoint)

  Config por variables de entorno (.env):
    RECURRENTE_PUBLIC_KEY, RECURRENTE_SECRET_KEY
    RECURRENTE_PRICE_ID        (precio recurrente mensual creado en Recurrente)
    RECURRENTE_WEBHOOK_SECRET  (whsec_... del endpoint de webhook)
    APP_URL                    (URL pública de esta app, para success/cancel)

  NOTA: como el host de Recurrente está bloqueado en este entorno, los nombres de
  algunos campos deben verificarse contra la documentación oficial al conectar en
  producción. El flujo y los headers están basados en su API documentada.
  Sin claves configuradas, corre en MODO DEMO (activa la suscripción localmente).
*/

const API_BASE = 'https://app.recurrente.com/api';
const CURRENCY = process.env.RECURRENTE_CURRENCY || 'GTQ';
const AMOUNT_CENTS = parseInt(process.env.RECURRENTE_AMOUNT_CENTS || '19900', 10);
const PRECIO_MENSUAL = process.env.PRECIO_MENSUAL ||
  `${CURRENCY === 'GTQ' ? 'Q' : CURRENCY + ' '}${(AMOUNT_CENTS / 100).toFixed(2)} / mes`;

function tieneClaves() {
  return !!process.env.RECURRENTE_SECRET_KEY;
}
function appUrl(req) {
  return process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
}

// Petición cruda: devuelve {ok, status, data} sin lanzar (para diagnóstico y flujo)
async function recurrenteRaw(path, { method = 'GET', body } = {}) {
  const res = await fetch(API_BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-SECRET-KEY': process.env.RECURRENTE_SECRET_KEY || '',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 500) }; }
  return { ok: res.ok, status: res.status, data };
}
async function recurrenteFetch(path, opts) {
  const r = await recurrenteRaw(path, opts);
  if (!r.ok) throw new Error(`Recurrente ${r.status}: ${JSON.stringify(r.data).slice(0, 300)}`);
  return r.data;
}

function sumarUnMes(fechaISO) {
  const d = fechaISO ? new Date(fechaISO) : new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

/* ---- Estado de la suscripción ---- */
router.get('/estado', (req, res) => {
  const e = req.empresa;
  res.json({
    sub_estado: e.sub_estado,
    trial_hasta: e.trial_hasta,
    sub_hasta: e.sub_hasta,
    plan: e.plan,
    precio: PRECIO_MENSUAL,
    suscripcion_activa: suscripcionActiva(e),
    modo_demo: !tieneClaves(),
  });
});

/* ---- Iniciar checkout / suscripción ---- */
router.post('/checkout', requireRol('admin'), async (req, res) => {
  const empresa = req.empresa;

  // MODO DEMO: sin claves reales, devolvemos una URL local que activa la cuenta.
  if (!tieneClaves()) {
    return res.json({
      modo_demo: true,
      checkout_url: `${appUrl(req)}/billing/demo-exito`,
      mensaje: 'Modo demo: no hay claves de Recurrente. El enlace activa la suscripción localmente para pruebas.',
    });
  }

  try {
    const data = await recurrenteFetch('/checkouts', {
      method: 'POST',
      body: {
        items: [{
          name: `${empresa.nombre} — Campo Reportes (Plan Básico)`,
          amount_in_cents: AMOUNT_CENTS,
          currency: CURRENCY,
          quantity: 1,
          charge_type: 'recurring',
          billing_interval: 'month',
          billing_interval_count: 1,
        }],
        success_url: `${appUrl(req)}/billing/exito`,
        cancel_url: `${appUrl(req)}/billing/cancelado`,
        metadata: { empresa_id: String(empresa.id), empresa_slug: empresa.slug },
      },
    });
    if (data.id) await actualizarEmpresa(empresa.id, { recurrente_checkout_id: data.id });
    const url = data.checkout_url || data.url;
    if (!url) throw new Error('Recurrente no devolvió checkout_url');
    res.json({ checkout_url: url });
  } catch (e) {
    console.error('Error creando checkout:', e.message);
    res.status(502).json({ error: 'No se pudo crear el checkout en Recurrente.', detalle: e.message });
  }
});

/* ---- Activación demo (solo sin claves reales) ---- */
router.get('/demo-exito', requireRol('admin'), async (req, res) => {
  if (tieneClaves()) return res.redirect('/suscripcion.html');
  await actualizarEmpresa(req.empresaId, { sub_estado: 'active', sub_hasta: sumarUnMes(), plan: 'basico' });
  res.redirect('/suscripcion.html?activado=1');
});

// Al volver del pago: confirmamos el estado del checkout en Recurrente y activamos.
router.get('/exito', async (req, res) => {
  try {
    const cid = req.empresa?.recurrente_checkout_id;
    if (cid && tieneClaves()) {
      const r = await recurrenteRaw(`/checkouts/${cid}`);
      const st = String(r.data?.status || '').toLowerCase();
      const pagado = r.ok && (['paid', 'completed', 'succeeded', 'active'].includes(st) || !!r.data?.payment);
      if (pagado) {
        await actualizarEmpresa(req.empresaId, {
          sub_estado: 'active', sub_hasta: sumarUnMes(req.empresa.sub_hasta), plan: 'basico',
        });
        return res.redirect('/suscripcion.html?pago=exito');
      }
    }
  } catch (e) { console.error('exito:', e.message); }
  res.redirect('/suscripcion.html?pago=pendiente');
});
router.get('/cancelado', (_req, res) => res.redirect('/suscripcion.html?pago=cancelado'));

/* ---- Verificación de firma Svix ---- */
function verificarSvix(req) {
  const secret = process.env.RECURRENTE_WEBHOOK_SECRET;
  if (!secret) return true; // sin secreto configurado, no verificamos (desarrollo)
  try {
    const id = req.get('svix-id');
    const ts = req.get('svix-timestamp');
    const sigHeader = req.get('svix-signature') || '';
    const payload = req.body instanceof Buffer ? req.body.toString('utf8') : JSON.stringify(req.body);
    const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
    const signed = `${id}.${ts}.${payload}`;
    const esperado = crypto.createHmac('sha256', key).update(signed).digest('base64');
    return sigHeader.split(' ').some((p) => p.split(',')[1] === esperado);
  } catch { return false; }
}

/* ---- Webhook de Recurrente (público, cuerpo crudo) ---- */
router.post('/webhook', express.raw({ type: '*/*' }), async (req, res) => {
  try {
    if (!verificarSvix(req)) return res.status(400).send('firma inválida');
    let evento;
    try { evento = JSON.parse(req.body.toString('utf8')); } catch { return res.status(400).send('json inválido'); }

    const tipo = evento.type || evento.event_type || evento.event;
    const meta = evento.metadata || evento.data?.metadata || {};
    const empresaId = parseInt(meta.empresa_id, 10);
    const empresa = empresaId ? await getEmpresa(empresaId) : null;

    if (empresa) {
      if (/succeeded|paid|active|subscription\.create/i.test(tipo || '')) {
        await actualizarEmpresa(empresa.id, {
          sub_estado: 'active',
          sub_hasta: sumarUnMes(empresa.sub_hasta),
          recurrente_subscription_id: evento.subscription_id || evento.data?.subscription_id || empresa.recurrente_subscription_id,
        });
      } else if (/failed|canceled|cancelled|past_due/i.test(tipo || '')) {
        await actualizarEmpresa(empresa.id, { sub_estado: /cancel/i.test(tipo) ? 'canceled' : 'past_due' });
      }
    }
    res.json({ recibido: true });
  } catch (e) { console.error(e); res.status(500).send('error'); }
});

export default router;
