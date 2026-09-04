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
    const r = await fetch(`/api/tramites/${encodeURIComponent(slug)}/media`, { method: 'POST', body: fd });
    if (!r.ok) throw new Error('Error al subir archivo');
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

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' });
}
