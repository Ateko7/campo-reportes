// parser.js
// Convierte un mensaje de WhatsApp (español natural) en un registro estructurado.
// Es CONFIGURABLE por empresa: recibe las acciones, cultivos e insumos definidos
// por cada empresa. Si no se pasan, usa listas por defecto.
// 100% basado en reglas (funciona sin internet ni API).

const MESES = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10,
  noviembre: 11, diciembre: 12,
};

const UNIDADES = {
  ton: 'ton', tons: 'ton', tonelada: 'ton', toneladas: 'ton', t: 'ton',
  kg: 'kg', kilo: 'kg', kilos: 'kg', kilogramo: 'kg', kilogramos: 'kg',
  qq: 'qq', quintal: 'qq', quintales: 'qq',
  l: 'L', lt: 'L', lts: 'L', litro: 'L', litros: 'L',
  ha: 'ha', hectarea: 'ha', hectareas: 'ha',
  caja: 'cajas', cajas: 'cajas', bulto: 'bultos', bultos: 'bultos',
  saco: 'sacos', sacos: 'sacos',
};

// Defaults (cuando la empresa no tiene catálogos cargados)
const ACCIONES_DEFAULT = [
  { clave: 'estimacion', palabras: 'estim,proyect,espero cosechar,calculo,voy a cosechar,pienso cosechar' },
  { clave: 'siembra', palabras: 'sembr,siembr,plant,trasplant' },
  { clave: 'cosecha', palabras: 'cosech,coseche,levant,recolect,corte' },
  { clave: 'aplicacion', palabras: 'apliqu,aplic,fumig,fertiliz,abon,herbicid,fungicid,insecticid,cure,curar' },
  { clave: 'riego', palabras: 'rieg,regue,irrig' },
];
const CULTIVOS_DEFAULT = [
  'maíz', 'maiz', 'trigo', 'soya', 'soja', 'frijol', 'frijoles', 'café', 'cafe',
  'arroz', 'sorgo', 'cebada', 'papa', 'papas', 'tomate', 'tomates', 'chile',
  'aguacate', 'palta', 'caña', 'algodón', 'algodon', 'girasol', 'cebolla',
  'zanahoria', 'lechuga', 'fresa', 'fresas', 'uva', 'uvas', 'mango', 'limón',
  'limon', 'naranja', 'plátano', 'platano', 'banano', 'brócoli', 'brocoli',
  'espárrago', 'esparrago', 'avena', 'garbanzo', 'lenteja',
];
const INSUMOS_DEFAULT = [
  'glifosato', 'urea', 'paraquat', 'atrazina', 'gramoxone', 'roundup',
  'nitrogeno', 'nitrógeno', 'fosforo', 'fósforo', 'potasio', 'npk', 'foliar',
  'mancozeb', 'clorpirifos', 'abamectina', 'cobre', 'azufre', 'boro',
  'fertilizante', 'herbicida', 'fungicida', 'insecticida', 'abono',
];
const NORMALIZA_CULTIVO = {
  maiz: 'maíz', cafe: 'café', soja: 'soya', limon: 'limón',
  algodon: 'algodón', platano: 'plátano', brocoli: 'brócoli', esparrago: 'espárrago',
};

function stripAccents(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}
function hoyISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function detectTipo(textNorm, acciones) {
  for (const a of acciones) {
    const palabras = (a.palabras_clave ?? a.palabras ?? '')
      .split(',').map((p) => stripAccents(p.trim().toLowerCase())).filter(Boolean);
    if (palabras.some((k) => textNorm.includes(k))) return a.clave;
  }
  return 'nota';
}

function detectLote(text) {
  let m = text.match(/\b(?:lote|parcela|potrero|cuadro|tabl[oó]n|campo|finca)\s*[:#]?\s*([a-z0-9][a-z0-9\-]*)/i);
  if (m) return m[1].toUpperCase();
  m = text.match(/\bL\s*-?\s*(\d{1,4})\b/i);
  if (m) return `L${m[1]}`;
  return null;
}

function detectCultivo(textNorm, cultivos) {
  for (const c of cultivos) {
    const base = stripAccents(c.toLowerCase());
    if (textNorm.includes(base)) return NORMALIZA_CULTIVO[base] || c;
  }
  return null;
}

function detectCantidadUnidad(text) {
  const re = /(\d+(?:[.,]\d+)?)\s*(toneladas?|tons?|t\b|kilos?|kilogramos?|kg|quintales?|qq|litros?|lts?|lt|l\b|hect[aá]reas?|ha|cajas?|bultos?|sacos?)/i;
  const m = text.match(re);
  if (!m) return { cantidad: null, unidad: null };
  const cantidad = parseFloat(m[1].replace(',', '.'));
  const key = stripAccents(m[2].toLowerCase()).replace(/\.$/, '');
  return { cantidad, unidad: UNIDADES[key] || m[2].toLowerCase() };
}

function detectFecha(text, textNorm) {
  if (/\bhoy\b/.test(textNorm)) return hoyISO(0);
  if (/\bayer\b/.test(textNorm)) return hoyISO(-1);
  if (/\banteayer\b|\bantier\b/.test(textNorm)) return hoyISO(-2);
  if (/\bma[nñ]ana\b/.test(textNorm)) return hoyISO(1);
  let m = text.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (m) {
    const d = +m[1], mo = +m[2];
    let y = m[3] ? +m[3] : new Date().getFullYear();
    if (y < 100) y += 2000;
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12)
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  m = textNorm.match(/\b(\d{1,2})\s+de\s+([a-z]+)(?:\s+de\s+(\d{4}))?/);
  if (m && MESES[m[2]]) {
    const d = +m[1], mo = MESES[m[2]];
    const y = m[3] ? +m[3] : new Date().getFullYear();
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return null;
}

function detectProducto(textNorm, original, insumos) {
  for (const i of insumos) {
    const needle = stripAccents(i.toLowerCase());
    const idx = textNorm.indexOf(needle);
    if (idx >= 0) return original.substr(idx, i.length);
  }
  return null;
}

/**
 * parseMensaje(texto, config)
 * config = { acciones:[{clave,palabras_clave}], cultivos:[nombre], insumos:[nombre] }
 */
export function parseMensaje(texto, config = {}) {
  const original = (texto || '').trim();
  const textNorm = stripAccents(original.toLowerCase());

  const acciones = (config.acciones && config.acciones.length) ? config.acciones : ACCIONES_DEFAULT;
  const cultivos = (config.cultivos && config.cultivos.length) ? config.cultivos : CULTIVOS_DEFAULT;
  const insumos = (config.insumos && config.insumos.length) ? config.insumos : INSUMOS_DEFAULT;

  const tipo = detectTipo(textNorm, acciones);
  const lote = detectLote(original);
  const cultivo = detectCultivo(textNorm, cultivos);
  const fecha = detectFecha(original, textNorm) || (tipo !== 'nota' ? hoyISO(0) : null);
  const { cantidad, unidad } = detectCantidadUnidad(original);
  const producto = tipo === 'aplicacion' ? detectProducto(textNorm, original, insumos) : null;

  let score = 0;
  if (tipo !== 'nota') score += 2;
  if (lote) score++;
  if (cultivo) score++;
  if (cantidad != null) score++;
  if (producto) score++;

  return {
    tipo, lote, cultivo, fecha, producto, cantidad, unidad,
    notas: original,
    confianza: Number(Math.min(1, score / 5).toFixed(2)),
  };
}

export default parseMensaje;
