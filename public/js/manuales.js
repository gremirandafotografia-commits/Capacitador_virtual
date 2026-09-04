const CATEGORIAS_FIJAS = ['Sistema Open', 'Salesforce', 'Qupos', 'MBA Case', 'Agentes de Ayuda', 'General'];
let MANUALES = [];

async function init() {
  const data = await Api.listManuales();
  MANUALES = data.items;

  const selFiltro = document.getElementById('filtroCategoria');
  for (const c of CATEGORIAS_FIJAS) selFiltro.appendChild(new Option(c, c));

  render();

  document.getElementById('buscar').addEventListener('input', render);
  document.getElementById('filtroCategoria').addEventListener('change', render);
  document.getElementById('btnSubir').addEventListener('click', () => toggleModal(true));
  document.getElementById('fCancelar').addEventListener('click', () => toggleModal(false));
  document.getElementById('fSubir').addEventListener('click', subir);
}

function toggleModal(show) { document.getElementById('modalSubir').hidden = !show; }

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
    render();
  } catch (e) {
    toast(e.message, true);
  }
}

const ICONS = { pdf: '📕', md: '📝', markdown: '📝', html: '🌐', htm: '🌐', txt: '📄' };

function render() {
  const q = document.getElementById('buscar').value.toLowerCase();
  const cat = document.getElementById('filtroCategoria').value;
  const grid = document.getElementById('grid');
  const items = MANUALES.filter(m => {
    const matchQ = !q || m.titulo.toLowerCase().includes(q) || (m.descripcion || '').toLowerCase().includes(q);
    const matchC = !cat || m.categoria === cat;
    return matchQ && matchC;
  });

  if (!items.length) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1">No hay manuales que coincidan. Carga uno con "+ Cargar manual", o agrega archivos directamente a la carpeta <code>/manuales</code> del repositorio.</div>`;
    return;
  }

  grid.innerHTML = items.map(m => `
    <a class="card" href="/manual.html?id=${encodeURIComponent(m.id)}" style="text-decoration:none">
      <span class="pill" data-cat="${escapeHtml(m.categoria)}">${escapeHtml(m.categoria)}</span>
      <h3>${ICONS[m.tipo] || '📄'} ${escapeHtml(m.titulo)}</h3>
      <p>${escapeHtml(m.descripcion || m.archivo)}</p>
      <div class="meta"><span>${m.tipo.toUpperCase()}</span></div>
    </a>
  `).join('');
}

init();
