const ICONS = { pdf: 'picture_as_pdf', md: 'description', markdown: 'description', html: 'language', htm: 'language', txt: 'notes' };

let CATEGORIAS = [];
let MANUALES = [];
let categoriaActiva = null; // null = ningún tema abierto todavía; '' = "Todos" abierto explícitamente

async function init() {
  const [cats, data] = await Promise.all([Api.listCategorias(), Api.listManuales()]);
  CATEGORIAS = cats.items || [];
  MANUALES = data.items;

  renderTemas();
  render();

  document.getElementById('buscar').addEventListener('input', render);
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
    render();
  } catch (e) {
    toast(e.message, true);
  }
}

function renderTemas() {
  const conocidas = new Set(CATEGORIAS);
  const temas = [...CATEGORIAS];
  if (MANUALES.some(m => !conocidas.has(m.categoria))) temas.push('Otros');

  const list = document.getElementById('temaList');
  list.innerHTML =
    folderItemHtml('', 'Todos', MANUALES.length, categoriaActiva === '') +
    temas.map(cat => {
      const count = cat === 'Otros'
        ? MANUALES.filter(m => !conocidas.has(m.categoria)).length
        : MANUALES.filter(m => m.categoria === cat).length;
      return folderItemHtml(cat, cat, count, categoriaActiva === cat);
    }).join('');

  list.querySelectorAll('.folder-item').forEach(li => {
    li.addEventListener('click', () => {
      categoriaActiva = li.dataset.cat;
      renderTemas();
      render();
    });
  });
}

function render() {
  const q = document.getElementById('buscar').value.toLowerCase();
  const grid = document.getElementById('grid');

  if (categoriaActiva === null && !q) {
    grid.innerHTML = `
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
    grid.innerHTML = `<div class="empty">No hay manuales que coincidan. Carga uno con "+ Cargar manual".</div>`;
    return;
  }

  if (!categoriaEfectiva) {
    const secciones = CATEGORIAS
      .map(cat => ({ cat, items: items.filter(m => m.categoria === cat) }))
      .filter(s => s.items.length);
    const otros = items.filter(m => !conocidas.has(m.categoria));
    if (otros.length) secciones.push({ cat: 'Otros', items: otros });

    grid.innerHTML = secciones.map(sec => `
      <section class="cat-section">
        <div class="cat-section-head" data-cat="${escapeHtml(sec.cat)}">
          <span class="dot"></span>
          <h2>${escapeHtml(sec.cat)}</h2><span class="count">${sec.items.length}</span>
        </div>
        <div class="grid">${sec.items.map(cardHtml).join('')}</div>
      </section>
    `).join('');
    return;
  }

  grid.innerHTML = `
    <div class="tema-content-head">
      <h2>${escapeHtml(categoriaActiva)}</h2>
      <span class="count">${items.length} manual${items.length === 1 ? '' : 'es'}</span>
    </div>
    <div class="grid">${items.map(cardHtml).join('')}</div>
  `;
}

function cardHtml(m) {
  const cl = folderColor(m.categoria);
  return `
    <div class="tc-parent">
      <div class="tc-card" style="--tc-c1:${cl.f1};--tc-c2:${cl.f2};--tc-dark:${cl.back}">
        <div class="tc-glass">
          <div class="tc-content">
            <span class="pill" data-cat="${escapeHtml(m.categoria)}">${escapeHtml(m.categoria)}</span>
            <span class="tc-title">${escapeHtml(m.titulo)}</span>
            <span class="tc-text">${escapeHtml(m.descripcion || 'Sin descripción')}</span>
            <span class="tc-meta">${m.tipo.toUpperCase()}</span>
          </div>
          <div class="tc-bottom">
            <a class="tc-ingresar" href="/manual.html?id=${encodeURIComponent(m.id)}">
              Abrir <span class="msym">arrow_outward</span>
            </a>
          </div>
        </div>
        <div class="tc-logo">
          <span class="tc-circle tc-circle1"></span>
          <span class="tc-circle tc-circle2"></span>
          <span class="tc-circle tc-circle3"><span class="msym">${ICONS[m.tipo] || 'description'}</span></span>
        </div>
      </div>
    </div>
  `;
}

init();
