let EVALUACIONES = [];
let CATEGORIAS = [];
let temaActivo = '';

async function init() {
  const data = await Api.listEvaluaciones();
  EVALUACIONES = (data.items || []).filter(e => !e.esPractica);
  CATEGORIAS = data.categorias || [];

  renderTemas();
  render();
}

function temas() {
  const t = [...CATEGORIAS];
  if (EVALUACIONES.some(e => e.esFinal)) t.push('Final');
  return t;
}

function renderTemas() {
  const list = document.getElementById('temaList');
  list.innerHTML =
    folderItemHtml('', 'Todas', EVALUACIONES.length, temaActivo === '') +
    temas().map(cat => {
      const count = cat === 'Final'
        ? EVALUACIONES.filter(e => e.esFinal).length
        : EVALUACIONES.filter(e => !e.esFinal && e.tema === cat).length;
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

function render() {
  const grid = document.getElementById('grid');
  if (!EVALUACIONES.length) {
    grid.innerHTML = `<div class="empty">Todavía no hay evaluaciones cargadas. Se crean desde "Administración".</div>`;
    return;
  }

  const items = EVALUACIONES.filter(e => {
    if (!temaActivo) return true;
    if (temaActivo === 'Final') return e.esFinal;
    return !e.esFinal && e.tema === temaActivo;
  });

  if (!items.length) {
    grid.innerHTML = `<div class="empty">No hay evaluaciones en este tema.</div>`;
    return;
  }

  grid.innerHTML = `
    <div class="tema-content-head">
      <h2>${escapeHtml(temaActivo || 'Todas')}</h2>
      <span class="count">${items.length} evaluación${items.length === 1 ? '' : 'es'}</span>
    </div>
    <div class="grid">${items.map(cardHtml).join('')}</div>
  `;
}

function cardHtml(e) {
  return `
    <a class="card" href="/evaluar.html?id=${encodeURIComponent(e.id)}">
      <span class="pill" data-cat="${escapeHtml(e.tema)}">${escapeHtml(e.tema)}</span>
      <h3>${escapeHtml(e.titulo)}</h3>
      <p>${escapeHtml(e.descripcion || 'Sin descripción')}</p>
      <div class="meta">
        <span>${e.preguntas} pregunta${e.preguntas === 1 ? '' : 's'}</span>
        <span>·</span>
        <span>${e.intentos} respuesta${e.intentos === 1 ? '' : 's'} registrada${e.intentos === 1 ? '' : 's'}</span>
      </div>
    </a>
  `;
}

init();
