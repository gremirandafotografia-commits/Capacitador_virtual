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
  async listCategorias() {
    const r = await fetch('/api/categorias');
    return r.json();
  },
  async crearCategoria(nombre) {
    const r = await fetch('/api/categorias', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminHeaders() },
      body: JSON.stringify({ nombre })
    });
    await checkAdminAuth(r);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'No se pudo crear el tema');
    return data;
  },
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
      headers: { 'Content-Type': 'application/json', ...adminHeaders() },
      body: JSON.stringify(data)
    });
    await checkAdminAuth(r);
    if (!r.ok) throw new Error((await r.json()).error || 'Error al crear');
    return r.json();
  },
  async saveTramite(slug, data) {
    const r = await fetch(`/api/tramites/${encodeURIComponent(slug)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...adminHeaders() },
      body: JSON.stringify(data)
    });
    await checkAdminAuth(r);
    if (!r.ok) throw new Error((await r.json()).error || 'Error al guardar');
    return r.json();
  },
  async deleteTramite(slug) {
    const r = await fetch(`/api/tramites/${encodeURIComponent(slug)}`, { method: 'DELETE', headers: adminHeaders() });
    await checkAdminAuth(r);
    if (!r.ok) throw new Error('Error al eliminar');
    return r.json();
  },
  // Algunos proxys intermedios (el tunel publico de Codespaces, por
  // ejemplo) rechazan de entrada cualquier subida de mas de ~16MB con un
  // 413, antes de que llegue al servidor. Por debajo de este tamano se
  // manda todo en una sola peticion (mas simple y mas rapido); por
  // encima se parte en pedazos de 8MB.
  UMBRAL_SUBIDA_POR_PARTES: 8 * 1024 * 1024,

  // onEstado(mensaje) es opcional: se llama con un texto corto en cada
  // paso largo (subida por partes, espera de compresion) para que quien
  // llama pueda mostrar progreso -sin esto, una subida grande se ve
  // igual de "colgada" este funcionando bien o no.
  async uploadMedia(slug, blob, filename, onEstado) {
    if (blob.size > Api.UMBRAL_SUBIDA_POR_PARTES) {
      return Api.uploadMediaPorPartes(slug, blob, filename, onEstado);
    }
    const fd = new FormData();
    fd.append('archivo', blob, filename || 'captura');
    let r;
    try {
      r = await fetch(`/api/tramites/${encodeURIComponent(slug)}/media`, { method: 'POST', headers: adminHeaders(), body: fd });
    } catch (e) {
      throw new Error('No se pudo conectar con el servidor para subir el archivo.');
    }
    await checkAdminAuth(r);
    if (!r.ok) {
      let msg = 'Error al subir archivo';
      try { msg = (await r.json()).error || msg; } catch (e) { /* respuesta no era JSON */ }
      throw new Error(msg);
    }
    const data = await r.json();
    if (!data.comprimiendo) return data;
    return Api.esperarCompresion(slug, data, onEstado);
  },

  async uploadMediaPorPartes(slug, blob, filename, onEstado) {
    const CHUNK = Api.UMBRAL_SUBIDA_POR_PARTES;
    const uploadId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const total = Math.ceil(blob.size / CHUNK);
    let data = null;
    for (let i = 0; i < total; i++) {
      if (onEstado) onEstado(`Subiendo video... parte ${i + 1} de ${total}`);
      const parte = blob.slice(i * CHUNK, Math.min((i + 1) * CHUNK, blob.size));
      const fd = new FormData();
      fd.append('chunk', parte, filename || 'archivo');
      fd.append('uploadId', uploadId);
      fd.append('index', String(i));
      fd.append('total', String(total));
      fd.append('filename', filename || '');
      fd.append('mimetype', blob.type || '');
      let r;
      try {
        r = await fetch(`/api/tramites/${encodeURIComponent(slug)}/media/chunk`, { method: 'POST', headers: adminHeaders(), body: fd });
      } catch (e) {
        throw new Error('No se pudo conectar con el servidor para subir el archivo.');
      }
      await checkAdminAuth(r);
      if (!r.ok) {
        let msg = 'Error al subir archivo';
        try { msg = (await r.json()).error || msg; } catch (e) { /* respuesta no era JSON */ }
        throw new Error(msg);
      }
      data = await r.json();
    }
    if (!data.comprimiendo) return data;
    return Api.esperarCompresion(slug, data, onEstado);
  },
  // La subida responde apenas el archivo esta guardado; si el servidor
  // esta comprimiendolo (puede tardar varios minutos en un video largo),
  // se consulta el estado cada pocos segundos en vez de dejar una sola
  // conexion abierta todo ese tiempo (eso es lo que cortaban los proxys).
  async esperarCompresion(slug, data, onEstado) {
    const maxIntentos = 200; // ~10 minutos a 3s cada uno
    for (let i = 0; i < maxIntentos; i++) {
      // Se repite en cada vuelta (no solo al principio) para que el
      // aviso siga visible todo el tiempo que tarde -si solo se avisara
      // una vez, desaparece a los pocos segundos y da la sensacion de
      // que la subida quedo colgada aunque siga funcionando bien.
      if (onEstado) {
        onEstado(i === 0
          ? 'Video subido. Optimizando el archivo (puede tardar varios minutos en videos largos)...'
          : `Optimizando el video... (${i * 3}s)`);
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
      let r;
      try {
        r = await fetch(`/api/tramites/${encodeURIComponent(slug)}/media/${encodeURIComponent(data.nombre)}/estado`);
      } catch (e) { continue; }
      if (!r.ok) continue;
      const job = await r.json();
      if (!job.done) continue;
      if (job.comprimido) {
        return { ...data, src: job.src, nombre: job.nombre, tipo: job.tipo, comprimido: true, tamanoFinal: job.tamanoFinal };
      }
      return data;
    }
    return data; // se agoto la espera: se sigue usando el original sin comprimir
  },
  async iniciarTranscripcion(slug, nombre) {
    const r = await fetch(`/api/tramites/${encodeURIComponent(slug)}/media/${encodeURIComponent(nombre)}/transcribir`, {
      method: 'POST', headers: adminHeaders()
    });
    await checkAdminAuth(r);
    if (!r.ok) throw new Error((await r.json()).error || 'No se pudo iniciar la transcripcion');
    return r.json();
  },
  async getTranscripcion(slug, nombre) {
    const r = await fetch(`/api/tramites/${encodeURIComponent(slug)}/media/${encodeURIComponent(nombre)}/transcripcion`, {
      headers: adminHeaders()
    });
    await checkAdminAuth(r);
    if (!r.ok) throw new Error('No se pudo consultar la transcripcion');
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
    const r = await fetch('/api/manuales/upload', { method: 'POST', headers: adminHeaders(), body: fd });
    await checkAdminAuth(r);
    if (!r.ok) throw new Error('Error al subir manual');
    return r.json();
  },
  async saveManualMeta(id, meta) {
    const r = await fetch(`/api/manuales/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...adminHeaders() },
      body: JSON.stringify(meta)
    });
    await checkAdminAuth(r);
    if (!r.ok) throw new Error('Error al guardar manual');
    return r.json();
  },
  async deleteManual(id) {
    const r = await fetch(`/api/manuales/${encodeURIComponent(id)}`, { method: 'DELETE', headers: adminHeaders() });
    await checkAdminAuth(r);
    if (!r.ok) throw new Error('Error al eliminar manual');
    return r.json();
  },
  manualPdfUrl(id) {
    return `/api/manuales/${encodeURIComponent(id)}/exportar-pdf`;
  },
  certificadoUrl(evaluacionId, intentoId) {
    return `/api/evaluaciones/${encodeURIComponent(evaluacionId)}/intentos/${encodeURIComponent(intentoId)}/certificado`;
  },
  async exportarResultadosPdf(filas) {
    const r = await fetch('/api/admin/resultados-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminHeaders() },
      body: JSON.stringify({ filas })
    });
    await checkAdminAuth(r);
    if (!r.ok) throw new Error((await r.json()).error || 'No se pudo generar el PDF');
    return r.blob();
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
  async generarPreguntasIA(data) {
    const r = await fetch('/api/ia/generar-preguntas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminHeaders() },
      body: JSON.stringify(data)
    });
    await checkAdminAuth(r);
    const out = await r.json();
    if (!r.ok) throw new Error(out.error || 'No se pudo generar preguntas con IA');
    return out;
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
  },
  async enviarInvitaciones(id, empleadoIds) {
    const r = await fetch(`/api/evaluaciones/${encodeURIComponent(id)}/invitaciones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminHeaders() },
      body: JSON.stringify({ empleadoIds })
    });
    await checkAdminAuth(r);
    if (!r.ok) throw new Error((await r.json()).error || 'Error al enviar invitaciones');
    return r.json();
  },
  async listEmpleadosPublico() {
    const r = await fetch('/api/empleados/publico');
    return r.json();
  },
  async listEmpleados() {
    const r = await fetch('/api/empleados', { headers: adminHeaders() });
    await checkAdminAuth(r);
    return r.json();
  },
  async crearEmpleado(data) {
    const r = await fetch('/api/empleados', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminHeaders() },
      body: JSON.stringify(data)
    });
    await checkAdminAuth(r);
    if (!r.ok) throw new Error((await r.json()).error || 'Error al crear empleado');
    return r.json();
  },
  async guardarEmpleado(id, data) {
    const r = await fetch(`/api/empleados/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...adminHeaders() },
      body: JSON.stringify(data)
    });
    await checkAdminAuth(r);
    if (!r.ok) throw new Error((await r.json()).error || 'Error al guardar empleado');
    return r.json();
  },
  async eliminarEmpleado(id) {
    const r = await fetch(`/api/empleados/${encodeURIComponent(id)}`, { method: 'DELETE', headers: adminHeaders() });
    await checkAdminAuth(r);
    if (!r.ok) throw new Error('Error al eliminar empleado');
    return r.json();
  },
  async progresoEmpleado(id) {
    const r = await fetch(`/api/empleados/${encodeURIComponent(id)}/progreso`, { headers: adminHeaders() });
    await checkAdminAuth(r);
    if (!r.ok) throw new Error('Error al consultar el progreso');
    return r.json();
  },
  async generarPractica(id) {
    const r = await fetch(`/api/empleados/${encodeURIComponent(id)}/practica`, { method: 'POST', headers: adminHeaders() });
    await checkAdminAuth(r);
    if (!r.ok) throw new Error((await r.json()).error || 'Error al generar la practica');
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
