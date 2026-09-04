let TRAMITES = [];
let CATEGORIAS = [];

async function init() {
  const data = await Api.listTramites();
  TRAMITES = data.items;
  CATEGORIAS = data.categorias;

  const selFiltro = document.getElementById('filtroCategoria');
  const selNuevo = document.getElementById('nCategoria');
  for (const c of CATEGORIAS) {
    selFiltro.appendChild(new Option(c, c));
    selNuevo.appendChild(new Option(c, c));
  }

  render();

  document.getElementById('buscar').addEventListener('input', render);
  document.getElementById('filtroCategoria').addEventListener('change', render);
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

function cardHtml(t) {
  const tags = (t.etiquetas || []).map(e =>
    `<span class="tag-pill" style="--tc:${escapeHtml(e.color)}">${escapeHtml(e.texto)}</span>`
  ).join('');
  return `
    <div class="card">
      <span class="pill" data-cat="${escapeHtml(t.categoria)}">${escapeHtml(t.categoria)}</span>
      ${tags ? `<div class="tag-row">${tags}</div>` : ''}
      <h3>${escapeHtml(t.titulo)}</h3>
      <p>${escapeHtml(t.descripcion || 'Sin descripción')}</p>
      <div class="meta">
        <span>${t.pasos} paso${t.pasos === 1 ? '' : 's'}</span>
        <span>·</span>
        <span>Actualizado ${fmtDate(t.actualizado)}</span>
      </div>
      <div class="actions">
        <a class="btn small primary" href="/viewer.html?id=${encodeURIComponent(t.id)}"><span class="msym" style="font-size:15px">visibility</span> Ver</a>
        <a class="btn small" href="/editor.html?id=${encodeURIComponent(t.id)}"><span class="msym" style="font-size:15px">edit</span> Editar</a>
        <button class="btn small danger" data-del="${encodeURIComponent(t.id)}"><span class="msym" style="font-size:15px">delete</span></button>
      </div>
    </div>
  `;
}

function render() {
  const q = document.getElementById('buscar').value.toLowerCase();
  const cat = document.getElementById('filtroCategoria').value;
  const grid = document.getElementById('grid');
  const items = TRAMITES.filter(t => {
    const matchQ = !q || t.titulo.toLowerCase().includes(q) || (t.descripcion || '').toLowerCase().includes(q);
    const matchC = !cat || t.categoria === cat;
    return matchQ && matchC;
  });

  if (!items.length) {
    grid.innerHTML = `<div class="empty">No hay trámites que coincidan. Crea uno nuevo con "+ Nuevo trámite".</div>`;
    return;
  }

  const conocidas = new Set(CATEGORIAS);
  const secciones = CATEGORIAS
    .map(c => ({ cat: c, items: items.filter(t => t.categoria === c) }))
    .filter(s => s.items.length);
  const otros = items.filter(t => !conocidas.has(t.categoria));
  if (otros.length) secciones.push({ cat: null, items: otros });

  grid.innerHTML = secciones.map(sec => `
    <section class="cat-section">
      <div class="cat-section-head" data-cat="${escapeHtml(sec.cat || 'General')}">
        <span class="dot"></span>
        <h2>${escapeHtml(sec.cat || 'Otros')}</h2>
        <span class="count">${sec.items.length}</span>
      </div>
      <div class="grid">${sec.items.map(cardHtml).join('')}</div>
    </section>
  `).join('');

  grid.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ok = await confirmDialog('¿Eliminar este trámite y todos sus archivos? Esta acción no se puede deshacer.', { titulo: 'Eliminar trámite' });
      if (!ok) return;
      try {
        await Api.deleteTramite(btn.dataset.del);
        TRAMITES = TRAMITES.filter(t => t.id !== decodeURIComponent(btn.dataset.del));
        render();
        toast('Trámite eliminado');
      } catch (e) {
        toast(e.message, true);
      }
    });
  });
}

init();
