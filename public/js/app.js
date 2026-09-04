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
    grid.innerHTML = `<div class="empty" style="grid-column: 1/-1">
      No hay trámites que coincidan. Crea uno nuevo con "+ Nuevo trámite".
    </div>`;
    return;
  }

  grid.innerHTML = items.map(t => `
    <div class="card">
      <span class="pill" data-cat="${escapeHtml(t.categoria)}">${escapeHtml(t.categoria)}</span>
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
  `).join('');

  grid.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Eliminar este trámite y todos sus archivos? Esta acción no se puede deshacer.')) return;
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
