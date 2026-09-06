function qs(name) { return new URLSearchParams(location.search).get(name); }
let MANUAL = null;

async function init() {
  const id = qs('id');
  const data = await Api.listManuales();
  MANUAL = data.items.find(m => m.id === id);
  if (!MANUAL) { document.getElementById('notFound').hidden = false; return; }

  document.getElementById('app').hidden = false;
  document.title = `${MANUAL.titulo} · CATA`;
  fillHeader();

  const body = document.getElementById('mBody');
  try {
    const contenido = await Api.getManualContenido(MANUAL.archivo);
    if (contenido.tipo === 'html') {
      body.innerHTML = `<div class="manual-content">${contenido.html}</div>`;
    } else if (contenido.tipo === 'texto') {
      body.innerHTML = `<div class="manual-content"><pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(contenido.texto)}</pre></div>`;
    } else {
      body.innerHTML = `<iframe class="manual-frame" src="${contenido.url}"></iframe>`;
    }
  } catch (e) {
    body.innerHTML = `<div class="empty">No se pudo cargar el contenido: ${escapeHtml(e.message)}</div>`;
  }

  document.getElementById('btnEditarMeta').addEventListener('click', () => adminGuard().then(() => {
    document.getElementById('eTitulo').value = MANUAL.titulo;
    document.getElementById('eCategoria').value = MANUAL.categoria;
    document.getElementById('eDescripcion').value = MANUAL.descripcion || '';
    document.getElementById('modalMeta').hidden = false;
  }));
  document.getElementById('eCancelar').addEventListener('click', () => { document.getElementById('modalMeta').hidden = true; });
  document.getElementById('eGuardar').addEventListener('click', guardarMeta);
  document.getElementById('btnEliminar').addEventListener('click', () => adminGuard().then(eliminar));
}

async function eliminar() {
  const ok = await confirmDialog(`¿Eliminar "${MANUAL.titulo}"? Esta acción no se puede deshacer.`, { titulo: 'Eliminar manual' });
  if (!ok) return;
  try {
    await Api.deleteManual(MANUAL.id);
    toast('Manual eliminado');
    location.href = '/manuales.html';
  } catch (e) {
    toast(e.message, true);
  }
}

function fillHeader() {
  const pill = document.getElementById('mCategoria');
  pill.textContent = MANUAL.categoria;
  pill.dataset.cat = MANUAL.categoria;
  document.getElementById('mTitulo').textContent = MANUAL.titulo;
  document.getElementById('mDescripcion').textContent = MANUAL.descripcion || '';
  const descarga = document.getElementById('mDescarga');
  descarga.href = `/manuales/${MANUAL.archivo}`;
  descarga.hidden = false;
  const descargaPdf = document.getElementById('mDescargaPdf');
  descargaPdf.href = Api.manualPdfUrl(MANUAL.archivo);
  descargaPdf.hidden = false;
}

async function guardarMeta() {
  const meta = {
    titulo: document.getElementById('eTitulo').value.trim() || MANUAL.titulo,
    categoria: document.getElementById('eCategoria').value,
    descripcion: document.getElementById('eDescripcion').value.trim(),
    tags: MANUAL.tags || []
  };
  try {
    await Api.saveManualMeta(MANUAL.id, meta);
    Object.assign(MANUAL, meta);
    fillHeader();
    document.getElementById('modalMeta').hidden = true;
    toast('Datos del manual actualizados');
  } catch (e) {
    toast(e.message, true);
  }
}

init();
