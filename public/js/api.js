function adminHeaders() {
  const token = (typeof AdminAuth !== 'undefined') && AdminAuth.getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function checkAdminAuth(r) {
  if (r.status === 401 && typeof AdminAuth !== 'undefined') {
    AdminAuth.clearToken();
    throw new Error('Tu sesion de administracion expiro. Recarga la pagina para volver a ingresar la contrasena.');
  }
  return r;
}

const Api = {
  async listTramites() {
    const r = await fetch('/api/tramites');
    return r.json();
  },
  async getTramite(slug) {
    const r = await fetch(`/api/tramites/${encodeURIComponent(slug)}`);
    if (!r.ok) throw new Error('No se encontro el tramite');
    return r.json();
  },
  async createTramite(data) {
    const r = await fetch('/api/tramites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!r.ok) throw new Error((await r.json()).error || 'Error al crear');
    return r.json();
  },
  async saveTramite(slug, data) {
    const r = await fetch(`/api/tramites/${encodeURIComponent(slug)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!r.ok) throw new Error((await r.json()).error || 'Error al guardar');
    return r.json();
  },
  async deleteTramite(slug) {
    const r = await fetch(`/api/tramites/${encodeURIComponent(slug)}`, { method: 'DELETE' });
    if (!r.ok) throw new Error('Error al eliminar');
    return r.json();
  },
  async uploadMedia(slug, blob, filename) {
    const fd = new FormData();
    fd.append('archivo', blob, filename || 'captura');
    let r;
    try {
      r = await fetch(`/api/tramites/${encodeURIComponent(slug)}/media`, { method: 'POST', body: fd });
    } catch (e) {
      throw new Error('No se pudo conectar con el servidor para subir el archivo.');
    }
    if (!r.ok) {
      let msg = 'Error al subir archivo';
      try { msg = (await r.json()).error || msg; } catch (e) { /* respuesta no era JSON */ }
      throw new Error(msg);
    }
    return r.json();
  },
  async listManuales() {
    const r = await fetch('/api/manuales');
    return r.json();
  },
  async getManualContenido(archivo) {
    const r = await fetch(`/api/manuales/contenido?archivo=${encodeURIComponent(archivo)}`);
    if (!r.ok) throw new Error('No se pudo cargar el manual');
    return r.json();
  },
  async uploadManual(file, meta) {
    const fd = new FormData();
    fd.append('archivo', file);
    fd.append('titulo', meta.titulo || '');
    fd.append('categoria', meta.categoria || 'General');
    fd.append('descripcion', meta.descripcion || '');
    fd.append('tags', meta.tags || '');
    const r = await fetch('/api/manuales/upload', { method: 'POST', body: fd });
    if (!r.ok) throw new Error('Error al subir manual');
    return r.json();
  },
  async saveManualMeta(id, meta) {
    const r = await fetch(`/api/manuales/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(meta)
    });
    if (!r.ok) throw new Error('Error al guardar manual');
    return r.json();
  },
  async listEvaluaciones() {
    const r = await fetch('/api/evaluaciones');
    return r.json();
  },
  async getEvaluacion(id) {
    const r = await fetch(`/api/evaluaciones/${encodeURIComponent(id)}`);
    if (!r.ok) throw new Error('No se encontro la evaluacion');
    return r.json();
  },
  async createEvaluacion(data) {
    const r = await fetch('/api/evaluaciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminHeaders() },
      body: JSON.stringify(data)
    });
    await checkAdminAuth(r);
    if (!r.ok) throw new Error((await r.json()).error || 'Error al crear');
    return r.json();
  },
  async saveEvaluacion(id, data) {
    const r = await fetch(`/api/evaluaciones/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...adminHeaders() },
      body: JSON.stringify(data)
    });
    await checkAdminAuth(r);
    if (!r.ok) throw new Error((await r.json()).error || 'Error al guardar');
    return r.json();
  },
  async deleteEvaluacion(id) {
    const r = await fetch(`/api/evaluaciones/${encodeURIComponent(id)}`, { method: 'DELETE', headers: adminHeaders() });
    await checkAdminAuth(r);
    if (!r.ok) throw new Error('Error al eliminar');
    return r.json();
  },
  async enviarIntento(id, data) {
    const r = await fetch(`/api/evaluaciones/${encodeURIComponent(id)}/intentos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!r.ok) throw new Error((await r.json()).error || 'Error al enviar la evaluacion');
    return r.json();
  },
  async listIntentos(id) {
    const r = await fetch(`/api/evaluaciones/${encodeURIComponent(id)}/intentos`, { headers: adminHeaders() });
    await checkAdminAuth(r);
    return r.json();
  },
  async calificarIntento(id, intentoId, calificaciones) {
    const r = await fetch(`/api/evaluaciones/${encodeURIComponent(id)}/intentos/${encodeURIComponent(intentoId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...adminHeaders() },
      body: JSON.stringify({ calificaciones })
    });
    await checkAdminAuth(r);
    if (!r.ok) throw new Error((await r.json()).error || 'Error al calificar');
    return r.json();
  }
};

function toast(msg, isError) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.toggle('error', !!isError);
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2800);
}

/* Confirmación dentro de la app (reemplaza al confirm() nativo del navegador,
   que se ve como un cartel externo del sistema operativo). */
function confirmDialog(mensaje, opts) {
  opts = opts || {};
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal" style="max-width:420px">
        <h2>${escapeHtml(opts.titulo || 'Confirmar')}</h2>
        <p style="color:var(--text-dim);margin:0">${escapeHtml(mensaje)}</p>
        <div class="modal-actions">
          <button class="btn" data-confirm-cancelar>${escapeHtml(opts.cancelarTexto || 'Cancelar')}</button>
          <button class="btn danger" data-confirm-ok>${escapeHtml(opts.confirmarTexto || 'Eliminar')}</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);

    function close(result) {
      document.removeEventListener('keydown', onKey);
      backdrop.remove();
      resolve(result);
    }
    function onKey(e) {
      if (e.key === 'Escape') close(false);
    }
    backdrop.querySelector('[data-confirm-cancelar]').addEventListener('click', () => close(false));
    backdrop.querySelector('[data-confirm-ok]').addEventListener('click', () => close(true));
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(false); });
    document.addEventListener('keydown', onKey);
    backdrop.querySelector('[data-confirm-ok]').focus();
  });
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtBytes(n) {
  if (!n || n < 0) return '0 KB';
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' });
}
