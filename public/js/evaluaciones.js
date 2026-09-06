let EVALUACIONES = [];
let CATEGORIAS = [];
let temaActivo = null; // null = ningún tema abierto todavía; '' = "Todas" abierto explícitamente

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

  if (temaActivo === null) {
    grid.innerHTML = `
      <div class="tema-placeholder">
        <span class="msym">arrow_back</span>
        <h3>Elegí un tema para ver sus evaluaciones</h3>
        <p>Seleccioná una opción del menú de la izquierda para ver las evaluaciones disponibles.</p>
      </div>
    `;
    return;
  }

  if (temaActivo === '') {
    const secciones = CATEGORIAS
      .map(cat => ({ cat, items: EVALUACIONES.filter(e => !e.esFinal && e.tema === cat) }))
      .filter(s => s.items.length);
    const finales = EVALUACIONES.filter(e => e.esFinal);
    if (finales.length) secciones.push({ cat: 'Final', items: finales });

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

  const items = temaActivo === 'Final'
    ? EVALUACIONES.filter(e => e.esFinal)
    : EVALUACIONES.filter(e => !e.esFinal && e.tema === temaActivo);

  if (!items.length) {
    grid.innerHTML = `<div class="empty">No hay evaluaciones en este tema.</div>`;
    return;
  }

  grid.innerHTML = `
    <div class="tema-content-head">
      <h2>${escapeHtml(temaActivo)}</h2>
      <span class="count">${items.length} evaluación${items.length === 1 ? '' : 'es'}</span>
    </div>
    <div class="grid">${items.map(cardHtml).join('')}</div>
  `;
}

function cardHtml(e) {
  const cl = folderColor(e.esFinal ? 'Final' : e.tema);
  return `
    <div class="tc-parent">
      <div class="tc-card" style="--tc-c1:${cl.f1};--tc-c2:${cl.f2};--tc-dark:${cl.back}">
        <div class="tc-glass">
          <div class="tc-content">
            <span class="pill" data-cat="${escapeHtml(e.tema)}">${escapeHtml(e.tema)}</span>
            <span class="tc-title">${escapeHtml(e.titulo)}</span>
            <span class="tc-text">${escapeHtml(e.descripcion || 'Sin descripción')}</span>
            <span class="tc-meta">${e.preguntas} pregunta${e.preguntas === 1 ? '' : 's'} · ${e.intentos} respuesta${e.intentos === 1 ? '' : 's'} registrada${e.intentos === 1 ? '' : 's'}</span>
          </div>
          <div class="tc-bottom">
            <a class="tc-ingresar" href="/evaluar.html?id=${encodeURIComponent(e.id)}">
              Comenzar <span class="msym">arrow_outward</span>
            </a>
          </div>
        </div>
        <div class="tc-logo">
          <span class="tc-circle tc-circle1"></span>
          <span class="tc-circle tc-circle2"></span>
          <span class="tc-circle tc-circle3"><span class="msym">${TEMA_ICONS[e.tema] || 'quiz'}</span></span>
        </div>
      </div>
    </div>
  `;
}

init();
