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
  document.getElementById('btnSalir').addEventListener('click', salir);
}

function salir() {
  // window.close() solo funciona si esta pestaña la abrió un script; si el
  // navegador lo bloquea (pestaña abierta a mano o por el usuario), la
  // sacamos de la app igual navegando a una pagina en blanco.
  window.close();
  setTimeout(() => { location.href = 'about:blank'; }, 300);
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

function renderTemas() {
  const conocidas = new Set(CATEGORIAS);
  const hayOtros = TRAMITES.some(t => !conocidas.has(t.categoria));
  const temas = [...CATEGORIAS];
  if (hayOtros) temas.push('Otros');

  const list = document.getElementById('temaList');
  list.innerHTML =
    folderItemHtml('', 'Todos los trámites', TRAMITES.length, temaActivo === '') +
    temas.map(cat => {
      const count = cat === 'Otros'
        ? TRAMITES.filter(t => !conocidas.has(t.categoria)).length
        : TRAMITES.filter(t => t.categoria === cat).length;
      return folderItemHtml(cat, cat, count, temaActivo === cat);
    }).join('');

  list.querySelectorAll('.folder-item').forEach(li => {
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
  const cl = TEMA_FOLDER_COLORS[t.categoria] || TEMA_FOLDER_COLORS['General'];
  return `
    <div class="tc-parent">
      <div class="tc-card" style="--tc-c1:${cl.f1};--tc-c2:${cl.f2};--tc-dark:${cl.back}">
        <div class="tc-glass">
          <div class="tc-content">
            <span class="pill" data-cat="${escapeHtml(t.categoria)}">${escapeHtml(t.categoria)}</span>
            ${tags ? `<div class="tag-row">${tags}</div>` : ''}
            <span class="tc-title">${escapeHtml(t.titulo)}</span>
            <span class="tc-text">${escapeHtml(t.descripcion || 'Sin descripción')}</span>
            <span class="tc-meta">${t.pasos} paso${t.pasos === 1 ? '' : 's'} · Actualizado ${fmtDate(t.actualizado)}</span>
          </div>
          <div class="tc-bottom">
            <a class="tc-ingresar" href="/viewer.html?id=${encodeURIComponent(t.id)}">
              Ingresar <span class="msym">arrow_outward</span>
            </a>
            <div class="tc-actions">
              <a class="tc-action-btn" href="/editor.html?id=${encodeURIComponent(t.id)}" title="Editar"><span class="msym">edit</span></a>
              <button class="tc-action-btn danger" data-del="${encodeURIComponent(t.id)}" title="Eliminar"><span class="msym">delete</span></button>
            </div>
          </div>
        </div>
        <div class="tc-logo">
          <span class="tc-circle tc-circle1"></span>
          <span class="tc-circle tc-circle2"></span>
          <span class="tc-circle tc-circle3"><span class="msym">${TEMA_ICONS[t.categoria] || 'folder_open'}</span></span>
        </div>
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
