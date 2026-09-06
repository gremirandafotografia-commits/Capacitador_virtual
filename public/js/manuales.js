const ICONS = { pdf: 'picture_as_pdf', md: 'description', markdown: 'description', html: 'language', htm: 'language', txt: 'notes' };

let CATEGORIAS = [];
let MANUALES = [];
let categoriaActiva = null; // null = ningún tema abierto todavía; '' = "Todos" abierto explícitamente
let manualActivo = null;

async function init() {
  const [cats, data] = await Promise.all([Api.listCategorias(), Api.listManuales()]);
  CATEGORIAS = cats.items || [];
  MANUALES = data.items;

  renderTemas();
  renderLista();

  document.getElementById('buscar').addEventListener('input', renderLista);
  document.getElementById('btnSubir').addEventListener('click', () => adminGuard().then(() => toggleModal(true)));
  document.getElementById('fCancelar').addEventListener('click', () => toggleModal(false));
  document.getElementById('fSubir').addEventListener('click', subir);
}

function toggleModal(show) {
  document.getElementById('modalSubir').hidden = !show;
  if (show) {
    const sel = document.getElementById('fCategoria');
    sel.innerHTML = CATEGORIAS.map(c => `<option${c === 'General' ? ' selected' : ''}>${escapeHtml(c)}</option>`).join('');
  }
}

async function subir() {
  const file = document.getElementById('fArchivo').files[0];
  if (!file) { toast('Selecciona un archivo', true); return; }
  const meta = {
    titulo: document.getElementById('fTitulo').value.trim() || file.name,
    categoria: document.getElementById('fCategoria').value,
    descripcion: document.getElementById('fDescripcion').value.trim()
  };
  try {
    await Api.uploadManual(file, meta);
    toast('Manual cargado en /manuales');
    toggleModal(false);
    const data = await Api.listManuales();
    MANUALES = data.items;
    renderTemas();
    renderLista();
  } catch (e) {
    toast(e.message, true);
  }
}

function renderTemas() {
  const conocidas = new Set(CATEGORIAS);
  const temas = [...CATEGORIAS];
  if (MANUALES.some(m => !conocidas.has(m.categoria))) temas.push('Otros');

  const el = document.getElementById('temasManuales');
  el.innerHTML =
    folderItemHtml('Todos', 'Todos', MANUALES.length, categoriaActiva === '') +
    temas.map(cat => {
      const count = cat === 'Otros'
        ? MANUALES.filter(m => !conocidas.has(m.categoria)).length
        : MANUALES.filter(m => m.categoria === cat).length;
      return folderItemHtml(cat, cat, count, categoriaActiva === cat);
    }).join('');

  el.querySelectorAll('.folder-item').forEach(li => {
    li.addEventListener('click', () => {
      categoriaActiva = li.dataset.cat === 'Todos' ? '' : li.dataset.cat;
      renderTemas();
      renderLista();
    });
  });
}

function renderLista() {
  const q = document.getElementById('buscar').value.toLowerCase();
  const lista = document.getElementById('listaManuales');

  if (categoriaActiva === null && !q) {
    lista.innerHTML = `
      <div class="tema-placeholder">
        <span class="msym">arrow_back</span>
        <h3>Elegí un tema para ver sus manuales</h3>
        <p>Seleccioná una opción del menú de la izquierda (o buscá directamente) para ver los manuales disponibles.</p>
      </div>
    `;
    return;
  }

  const conocidas = new Set(CATEGORIAS);
  const categoriaEfectiva = categoriaActiva === null ? '' : categoriaActiva;
  const items = MANUALES.filter(m => {
    const matchQ = !q || m.titulo.toLowerCase().includes(q) || (m.descripcion || '').toLowerCase().includes(q);
    const matchC = !categoriaEfectiva || (categoriaEfectiva === 'Otros' ? !conocidas.has(m.categoria) : m.categoria === categoriaEfectiva);
    return matchQ && matchC;
  });

  if (!items.length) {
    lista.innerHTML = `<div class="empty">No hay manuales que coincidan. Carga uno con "+ Cargar manual".</div>`;
    return;
  }

  const rowHtml = m => `
    <button class="manual-row${manualActivo && manualActivo.id === m.id ? ' act' : ''}" data-id="${escapeHtml(m.id)}">
      <span class="msym icono">${ICONS[m.tipo] || 'description'}</span>
      <div class="info">
        <div class="titulo">${escapeHtml(m.titulo)}</div>
        <div class="sub">${escapeHtml(m.categoria)} · ${m.tipo.toUpperCase()}</div>
      </div>
    </button>
  `;

  if (!categoriaEfectiva) {
    const secciones = CATEGORIAS
      .map(cat => ({ cat, items: items.filter(m => m.categoria === cat) }))
      .filter(s => s.items.length);
    const otros = items.filter(m => !conocidas.has(m.categoria));
    if (otros.length) secciones.push({ cat: 'Otros', items: otros });

    lista.innerHTML = secciones.map(sec => `
      <section class="cat-section">
        <div class="cat-section-head" data-cat="${escapeHtml(sec.cat)}">
          <span class="dot"></span>
          <h2>${escapeHtml(sec.cat)}</h2><span class="count">${sec.items.length}</span>
        </div>
        <div class="manual-lista-grupo-items">${sec.items.map(rowHtml).join('')}</div>
      </section>
    `).join('');
  } else {
    lista.innerHTML = items.map(rowHtml).join('');
  }

  lista.querySelectorAll('.manual-row').forEach(btn => {
    btn.addEventListener('click', () => mostrarPreview(items.find(m => m.id === btn.dataset.id)));
  });

  if (manualActivo && !items.some(m => m.id === manualActivo.id)) {
    manualActivo = null;
    mostrarPreviewVacio();
  }
}

function mostrarPreviewVacio() {
  document.getElementById('previewManuales').innerHTML = `
    <div class="manuales-preview-empty">
      <span class="msym">visibility</span>
      <p>Elegí un manual de la lista para verlo aquí completo.</p>
    </div>
  `;
}

async function mostrarPreview(manual) {
  if (!manual) return;
  manualActivo = manual;
  renderLista();

  const preview = document.getElementById('previewManuales');
  preview.innerHTML = `
    <div class="manuales-preview-head">
      <div>
        <span class="pill" data-cat="${escapeHtml(manual.categoria)}">${escapeHtml(manual.categoria)}</span>
        <h3>${escapeHtml(manual.titulo)}</h3>
      </div>
      <a class="btn small" href="/manual.html?id=${encodeURIComponent(manual.id)}"><span class="msym" style="font-size:15px">open_in_new</span> Abrir página completa</a>
    </div>
    <div class="manuales-preview-body" id="previewBody"><div class="empty">Cargando...</div></div>
  `;

  const body = document.getElementById('previewBody');
  try {
    const contenido = await Api.getManualContenido(manual.archivo);
    if (contenido.tipo === 'html') {
      body.innerHTML = `<div class="manual-content">${contenido.html}</div>`;
    } else if (contenido.tipo === 'texto') {
      body.innerHTML = `<div class="manual-content"><pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(contenido.texto)}</pre></div>`;
    } else {
      body.innerHTML = `<iframe src="${contenido.url}"></iframe>`;
    }
  } catch (e) {
    body.innerHTML = `<div class="empty">No se pudo cargar el contenido: ${escapeHtml(e.message)}</div>`;
  }
}

init();
