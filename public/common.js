// Utilidades compartidas: fetch autenticado, branding y navegación.

export async function api(path, opts = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
    body: opts.body && typeof opts.body !== 'string' ? JSON.stringify(opts.body) : opts.body,
  });
  if (res.status === 401) { location.href = '/login.html'; throw new Error('No autenticado'); }
  if (res.status === 402) { location.href = '/suscripcion.html'; throw new Error('Suscripción requerida'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.mensaje || 'Error');
  return data;
}

let _sesion = null;
export async function sesion() {
  if (_sesion) return _sesion;
  const res = await fetch('/auth/yo', { credentials: 'same-origin' });
  if (res.status === 401) { location.href = '/login.html'; throw new Error('No autenticado'); }
  _sesion = await res.json();
  return _sesion;
}

// Aplica branding (color + nombre + logo) y pinta la barra de navegación.
export async function montarShell(activo) {
  const s = await sesion();
  const e = s.empresa;
  if (e.color_primario) {
    document.documentElement.style.setProperty('--verde', e.color_primario);
    document.documentElement.style.setProperty('--verde-bg', hexToSoft(e.color_primario));
  }
  const nav = document.getElementById('nav');
  if (nav) {
    const links = [
      ['/', 'Tablero', 'tablero'],
      ['/reportes', 'Reportes', 'reportes'],
      ['/configuracion', 'Configuración', 'config'],
      ['/suscripcion.html', 'Suscripción', 'suscripcion'],
    ];
    nav.innerHTML = `
      <div class="brand">
        ${e.logo_url ? `<img class="logo-img" src="${e.logo_url}" alt="logo"/>` : '<span class="logo">🌱</span>'}
        <div>
          <h1>${e.nombre}</h1>
          <p>Campo Reportes</p>
        </div>
      </div>
      <nav class="navlinks">
        ${links.map(([href, txt, id]) =>
          `<a href="${href}" class="${activo === id ? 'activo' : ''}">${txt}</a>`).join('')}
      </nav>
      <div class="usermenu">
        <span class="umail">${s.usuario.nombre} · ${s.usuario.rol}</span>
        <button id="btnLogout" class="btn btn-ghost">Salir</button>
      </div>`;
    document.getElementById('btnLogout').onclick = async () => {
      await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' });
      location.href = '/login.html';
    };
  }

  // Aviso de suscripción
  if (!e.suscripcion_activa && !location.pathname.startsWith('/suscripcion')) {
    const b = document.createElement('div');
    b.className = 'banner-sub';
    b.innerHTML = e.sub_estado === 'pending'
      ? `🟡 Activa tu suscripción para empezar a usar la plataforma. <a href="/suscripcion.html">Activar plan</a>`
      : `⚠️ Tu suscripción no está activa. <a href="/suscripcion.html">Reactivar plan</a> para seguir usando la plataforma.`;
    document.body.prepend(b);
  } else if (e.sub_estado === 'trialing' && e.trial_hasta) {
    const dias = Math.ceil((new Date(e.trial_hasta) - new Date()) / 86400000);
    if (dias <= 7) {
      const b = document.createElement('div');
      b.className = 'banner-trial';
      b.innerHTML = `🎁 Prueba gratis: te quedan <b>${dias} día(s)</b>. <a href="/suscripcion.html">Ver planes</a>`;
      document.body.prepend(b);
    }
  }
  return s;
}

function hexToSoft(hex) {
  // versión muy clara del color para fondos
  const h = hex.replace('#', '');
  if (h.length !== 6) return '#f0fdf4';
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  const mez = (c) => Math.round(c + (255 - c) * 0.92);
  return `rgb(${mez(r)}, ${mez(g)}, ${mez(b)})`;
}
