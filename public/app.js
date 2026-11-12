import { api, montarShell } from './common.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

let ACCIONES = {};         // clave -> {nombre, icono, color}
let mapa, capaMarcadores;

const EJEMPLOS = [
  ['Siembra', 'Sembré hoy el lote 4 de maíz, 3 hectáreas'],
  ['Aplicación', 'Apliqué glifosato en el lote 2 ayer, 5 litros'],
  ['Cosecha', 'Coseché el lote 7 de trigo, 12 toneladas'],
  ['Estimación', 'Estimo cosechar 8 toneladas de maíz esta semana en el lote 4'],
  ['Riego', 'Regué el lote 3 de soya hoy'],
];

function initMapa() {
  if (typeof L === 'undefined') {
    $('#mapa').innerHTML = '<p class="muted" style="padding:16px">No se pudo cargar el mapa.</p>';
    return;
  }
  try {
    L.Icon.Default.prototype.options.imagePath = 'vendor/leaflet/images/';
    mapa = L.map('mapa').setView([19.4326, -99.1332], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 18,
    }).addTo(mapa);
    capaMarcadores = L.layerGroup().addTo(mapa);
  } catch (e) { console.warn('Mapa no disponible:', e); }
}

function badge(tipo) {
  const a = ACCIONES[tipo] || { nombre: tipo, color: '#64748b' };
  return `<span class="badge" style="background:${a.color}">${a.nombre}</span>`;
}

function filtrosQS() {
  const p = new URLSearchParams();
  if ($('#fQ').value) p.set('q', $('#fQ').value);
  if ($('#fTipo').value) p.set('tipo', $('#fTipo').value);
  if ($('#fLote').value) p.set('lote', $('#fLote').value);
  if ($('#fCultivo').value) p.set('cultivo', $('#fCultivo').value);
  if ($('#fDesde').value) p.set('desde', $('#fDesde').value);
  if ($('#fHasta').value) p.set('hasta', $('#fHasta').value);
  return p;
}

async function cargarAcciones() {
  const acc = await api('/api/acciones');
  ACCIONES = Object.fromEntries(acc.map((a) => [a.clave, a]));
  $('#fTipo').innerHTML = '<option value="">Todas las acciones</option>' +
    acc.map((a) => `<option value="${a.clave}">${a.icono} ${a.nombre}</option>`).join('');
}

async function cargarStats() {
  const s = await api('/api/stats');
  const porTipo = Object.fromEntries(s.porTipo.map((t) => [t.tipo, t.n]));
  const claves = Object.keys(ACCIONES).slice(0, 3);
  const kpis = [
    { num: s.total, lbl: 'Reportes totales', ico: '📋' },
    { num: s.productores, lbl: 'Productores', ico: '👨‍🌾' },
    ...claves.map((c) => ({ num: porTipo[c] || 0, lbl: ACCIONES[c].nombre, ico: ACCIONES[c].icono })),
  ];
  $('#kpis').innerHTML = kpis.map((k) =>
    `<div class="kpi"><span class="ico">${k.ico}</span><div class="num">${k.num}</div><div class="lbl">${k.lbl}</div></div>`
  ).join('');
  rellenar('#fLote', s.lotes, 'Todos los lotes');
  rellenar('#fCultivo', s.cultivos, 'Todos los cultivos');
}

function rellenar(sel, valores, ph) {
  const el = $(sel), actual = el.value;
  el.innerHTML = `<option value="">${ph}</option>` + valores.map((v) => `<option value="${v}">${v}</option>`).join('');
  el.value = actual;
}

async function cargarReportes() {
  const rows = await api('/api/reportes?' + filtrosQS().toString());
  $('#vacio').hidden = rows.length > 0;
  $('#tbody').innerHTML = rows.map((r) => {
    const d = [];
    if (r.producto) d.push(`🧪 ${r.producto}`);
    if (r.cantidad != null) d.push(`${r.cantidad} ${r.unidad || ''}`.trim());
    if (r.foto_url) d.push('📷');
    if (r.lat && r.lng) d.push('📍');
    return `<tr>
      <td>${badge(r.tipo)}</td>
      <td class="mono">${r.lote || '—'}</td>
      <td>${r.cultivo || '—'}</td>
      <td>${d.join(' · ') || '<span class="muted">—</span>'}</td>
      <td>${r.productor_nombre || '—'}</td>
      <td class="muted mono">${(r.fecha || r.created_at || '').slice(0, 10)}</td>
      <td><span class="link" data-id="${r.id}">Ver</span></td>
    </tr>`;
  }).join('');
  $$('#tbody .link').forEach((el) => el.addEventListener('click', () => verDetalle(el.dataset.id)));

  if (mapa && capaMarcadores) {
    capaMarcadores.clearLayers();
    const geo = rows.filter((r) => r.lat && r.lng);
    geo.forEach((r) => L.marker([r.lat, r.lng]).addTo(capaMarcadores)
      .bindPopup(`<b>${(ACCIONES[r.tipo] || {}).nombre || r.tipo}</b><br>${r.lote || ''} ${r.cultivo || ''}<br><small>${r.productor_nombre || ''}</small>`));
    if (geo.length) {
      const g = L.featureGroup(geo.map((r) => L.marker([r.lat, r.lng])));
      mapa.fitBounds(g.getBounds().pad(0.3));
    }
  }
  const qs = filtrosQS().toString();
  $('#btnExcel').href = '/export/excel' + (qs ? '?' + qs : '');
  $('#btnPdf').href = '/export/pdf' + (qs ? '?' + qs : '');
}

async function verDetalle(id) {
  const r = await api('/api/reportes/' + id);
  const fila = (k, v) => v != null && v !== '' ? `<div class="det-row"><span class="k">${k}</span><span class="v">${v}</span></div>` : '';
  const campos = r.campos || {};
  const extra = Object.entries(campos).map(([k, v]) => fila(k, v)).join('');
  $('#detalleContenido').innerHTML = `
    <h2>${badge(r.tipo)}</h2>
    ${fila('Lote', r.lote)}${fila('Cultivo', r.cultivo)}${fila('Producto/Insumo', r.producto)}
    ${fila('Cantidad', r.cantidad != null ? `${r.cantidad} ${r.unidad || ''}` : null)}
    ${fila('Fecha del evento', r.fecha)}${fila('Productor', r.productor_nombre)}
    ${fila('Teléfono', r.productor_telefono)}${fila('GPS', r.lat && r.lng ? `${r.lat}, ${r.lng}` : null)}
    ${extra}${fila('Registrado', r.created_at)}
    ${r.mensaje_original ? `<div class="det-msg">💬 "${r.mensaje_original}"</div>` : ''}
    ${r.foto_url ? `<div class="det-foto"><img src="${r.foto_url}" alt="foto"/></div>` : ''}`;
  abrir('#modalDetalle');
}

function abrir(sel) { $(sel).hidden = false; }
$$('[data-close]').forEach((b) => b.addEventListener('click', (e) => e.target.closest('.modal').hidden = true));
$$('.modal').forEach((m) => m.addEventListener('click', (e) => { if (e.target === m) m.hidden = true; }));

function initSimulador() {
  $('#ejemplos').innerHTML = '<span>Ejemplos:</span>' +
    EJEMPLOS.map(([t, ej]) => `<button class="chip" data-ej="${ej}">${t}</button>`).join('');
  $$('.chip').forEach((c) => c.addEventListener('click', () => $('#simBody').value = c.dataset.ej));
  $('#btnSimular').addEventListener('click', () => { $('#simRespuesta').hidden = true; abrir('#modalSim'); });
  $('#simEnviar').addEventListener('click', async () => {
    const body = $('#simBody').value.trim();
    if (!body) return alert('Escribe un mensaje');
    const payload = { body, from: $('#simTel').value, fromName: $('#simNombre').value };
    if ($('#simGeo').checked) {
      payload.lat = (19.4326 + (Math.random() - 0.5) * 2).toFixed(5);
      payload.lng = (-99.1332 + (Math.random() - 0.5) * 2).toFixed(5);
    }
    const res = await api('/api/simular', { method: 'POST', body: payload });
    $('#simRespuesta').hidden = false;
    $('#simRespuesta').textContent = res.respuesta_whatsapp;
    $('#simBody').value = '';
    await refrescar();
  });
}

let deb;
$('#fQ').addEventListener('input', () => { clearTimeout(deb); deb = setTimeout(cargarReportes, 300); });
['#fTipo', '#fLote', '#fCultivo', '#fDesde', '#fHasta'].forEach((s) => $(s).addEventListener('change', cargarReportes));
$('#btnLimpiar').addEventListener('click', () => {
  ['#fQ', '#fTipo', '#fLote', '#fCultivo', '#fDesde', '#fHasta'].forEach((s) => $(s).value = '');
  cargarReportes();
});
$('#btnRefrescar').addEventListener('click', refrescar);

async function refrescar() {
  await cargarStats();
  await cargarReportes();
}

(async function init() {
  await montarShell('tablero');
  await cargarAcciones();
  initMapa();
  initSimulador();
  await refrescar();
  setInterval(cargarReportes, 15000);
})();
