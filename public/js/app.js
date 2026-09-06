let TRAMITES = [];
let CATEGORIAS = [];
let temaActivo = null; // null = ningún tema abierto todavía; '' = "Todos" abierto explícitamente

async function init() {
  const data = await Api.listTramites();
  TRAMITES = data.items;
  CATEGORIAS = data.categorias;

  const selNuevo = document.getElementById('nCategoria');
  for (const c of CATEGORIAS) {
    selNuevo.appendChild(new Option(c, c));
  }

  renderTemas();
  render();

  document.getElementById('buscar').addEventListener('input', render);
  document.getElementById('btnNuevo').addEventListener('click', () => toggleModal(true));
  document.getElementById('nCancelar').addEventListener('click', () => toggleModal(false));
  document.getElementById('nCrear').addEventListener('click', crear);
}

function toggleModal(show) {
  document.getElementById('modalNuevo').hidden = !show;
  if (show) document.getElementById('nTitulo').focus();
}

async function crear() {
  const titulo = document.getElementById('nTitulo').value.trim();
  if (!titulo) { toast('Escribe un título', true); return; }
  const categoria = document.getElementById('nCategoria').value;
  const descripcion = document.getElementById('nDescripcion').value.trim();
  try {
    const doc = await Api.createTramite({ titulo, categoria, descripcion });
    window.location.href = `/editor.html?id=${encodeURIComponent(doc.id)}`;
  } catch (e) {
    toast(e.message, true);
  }
}

const TEMA_ICONS = {
  '': 'apps', 'Sistema Open': 'dns', 'Salesforce': 'cloud', 'Qupos': 'point_of_sale',
  'MBA Case': 'work', 'Agentes de Ayuda': 'support_agent', 'General': 'folder_open', 'Otros': 'folder_open'
};
const TEMA_GRAD = {
  '': ['#00196E', '#0072BC', '#4FA8DE'],
  'Sistema Open': ['#00568F', '#0072BC', '#4FA8DE'],
  'Salesforce': ['#124b6b', '#1E77A8', '#5AA9CE'],
  'Qupos': ['#8a5600', '#C97600', '#F0A02C'],
  'MBA Case': ['#4a3480', '#6C4FBC', '#9f7fe0'],
  'Agentes de Ayuda': ['#8a2b28', '#C13F3B', '#e2726e'],
  'General': ['#384049', '#56636F', '#8593a1'],
  'Otros': ['#384049', '#56636F', '#8593a1']
};

function renderTemas() {
  const conocidas = new Set(CATEGORIAS);
  const hayOtros = TRAMITES.some(t => !conocidas.has(t.categoria));
  const temas = [...CATEGORIAS];
  if (hayOtros) temas.push('Otros');

  const list = document.getElementById('temaList');
  const itemHtml = (cat, label, count) => {
    const [c1, c2, c3] = TEMA_GRAD[cat] || TEMA_GRAD['General'];
    return `
      <li class="tw-main${temaActivo === cat ? ' act' : ''}" data-cat="${escapeHtml(cat)}" style="--tw-c1:${c1};--tw-c2:${c2};--tw-c3:${c3}">
        <div class="tw-card"></div>
        <div class="tw-card_back">
          <div class="tw-data">
            <div class="tw-img"><span class="msym">${TEMA_ICONS[cat] || 'folder_open'}</span></div>
            <div class="tw-text">
              <div class="tw-text_m">${escapeHtml(label)}</div>
              <div class="tw-text_s">${count} trámite${count === 1 ? '' : 's'}</div>
            </div>
          </div>
        </div>
      </li>
    `;
  };

  list.innerHTML =
    itemHtml('', 'Todos los trámites', TRAMITES.length) +
    temas.map(cat => {
      const count = cat === 'Otros'
        ? TRAMITES.filter(t => !conocidas.has(t.categoria)).length
        : TRAMITES.filter(t => t.categoria === cat).length;
      return itemHtml(cat, cat, count);
    }).join('');

  list.querySelectorAll('.tw-main').forEach(li => {
    li.addEventListener('click', () => {
      temaActivo = li.dataset.cat;
      renderTemas();
      render();
    });
  });
}

function cardHtml(t) {
  const tags = (t.etiquetas || []).map(e =>
    `<span class="tag-pill" style="--tc:${escapeHtml(e.color)}">${escapeHtml(e.texto)}</span>`
  ).join('');
  return `
    <div class="tema-card">
      <span class="pill" data-cat="${escapeHtml(t.categoria)}">${escapeHtml(t.categoria)}</span>
      ${tags ? `<div class="tag-row">${tags}</div>` : ''}
      <h3>${escapeHtml(t.titulo)}</h3>
      <p class="resumen">${escapeHtml(t.descripcion || 'Sin descripción')}</p>
      <div class="meta">
        <span>${t.pasos} paso${t.pasos === 1 ? '' : 's'}</span>
        <span>·</span>
        <span>Actualizado ${fmtDate(t.actualizado)}</span>
      </div>
      <div class="tema-card-actions">
        <a class="btn-ingresar" href="/viewer.html?id=${encodeURIComponent(t.id)}">
          Ingresar <span class="msym">arrow_outward</span>
        </a>
        <a class="btn small" href="/editor.html?id=${encodeURIComponent(t.id)}"><span class="msym" style="font-size:15px">edit</span> Editar</a>
        <button class="btn small danger" data-del="${encodeURIComponent(t.id)}"><span class="msym" style="font-size:15px">delete</span></button>
      </div>
    </div>
  `;
}

function render() {
  const q = document.getElementById('buscar').value.toLowerCase();
  const grid = document.getElementById('grid');
  const conocidas = new Set(CATEGORIAS);

  if (temaActivo === null && !q) {
    grid.innerHTML = `
      <div class="tema-placeholder">
        <span class="msym">arrow_back</span>
        <h3>Elegí un tema para ver sus trámites</h3>
        <p>Seleccioná una opción del menú de la izquierda (o buscá directamente) para abrir su contenido.</p>
      </div>
    `;
    return;
  }

  const temaEfectivo = temaActivo === null ? '' : temaActivo;
  const items = TRAMITES.filter(t => {
    const matchQ = !q || t.titulo.toLowerCase().includes(q) || (t.descripcion || '').toLowerCase().includes(q);
    const matchC = !temaEfectivo || (temaEfectivo === 'Otros' ? !conocidas.has(t.categoria) : t.categoria === temaEfectivo);
    return matchQ && matchC;
  });

  if (!items.length) {
    grid.innerHTML = `<div class="empty">No hay trámites que coincidan. Crea uno nuevo con "+ Nuevo trámite".</div>`;
    return;
  }

  let html;
  if (!temaEfectivo) {
    const secciones = CATEGORIAS
      .map(c => ({ cat: c, items: items.filter(t => t.categoria === c) }))
      .filter(s => s.items.length);
    const otros = items.filter(t => !conocidas.has(t.categoria));
    if (otros.length) secciones.push({ cat: null, items: otros });

    html = secciones.map(sec => `
      <section class="cat-section">
        <div class="cat-section-head" data-cat="${escapeHtml(sec.cat || 'General')}">
          <span class="dot"></span>
          <h2>${escapeHtml(sec.cat || 'Otros')}</h2>
          <span class="count">${sec.items.length}</span>
        </div>
        <div class="grid">${sec.items.map(cardHtml).join('')}</div>
      </section>
    `).join('');
  } else {
    html = `
      <div class="tema-content-head">
        <h2>${escapeHtml(temaActivo)}</h2>
        <span class="count">${items.length} trámite${items.length === 1 ? '' : 's'}</span>
      </div>
      <div class="grid">${items.map(cardHtml).join('')}</div>
    `;
  }
  grid.innerHTML = html;

  grid.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ok = await confirmDialog('¿Eliminar este trámite y todos sus archivos? Esta acción no se puede deshacer.', { titulo: 'Eliminar trámite' });
      if (!ok) return;
      try {
        await Api.deleteTramite(btn.dataset.del);
        TRAMITES = TRAMITES.filter(t => t.id !== decodeURIComponent(btn.dataset.del));
        renderTemas();
        render();
        toast('Trámite eliminado');
      } catch (e) {
        toast(e.message, true);
      }
    });
  });
}

init();
