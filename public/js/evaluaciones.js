async function init() {
  const data = await Api.listEvaluaciones();
  const grid = document.getElementById('grid');
  // Las practicas de refuerzo son personales (generadas para un empleado
  // puntual) y se comparten por enlace directo, no se listan para todos.
  const items = (data.items || []).filter(e => !e.esPractica);

  if (!items.length) {
    grid.innerHTML = `<div class="empty">Todavía no hay evaluaciones cargadas. Se crean desde "Administración".</div>`;
    return;
  }

  const finales = items.filter(e => e.esFinal);
  const porTema = data.categorias
    .map(cat => ({ tema: cat, items: items.filter(e => !e.esFinal && e.tema === cat) }))
    .filter(s => s.items.length);

  const secciones = [...porTema];
  if (finales.length) secciones.push({ tema: 'Final', items: finales });

  grid.innerHTML = secciones.map(sec => `
    <section class="cat-section">
      <div class="cat-section-head" data-cat="${escapeHtml(sec.tema)}">
        <span class="dot"></span>
        <h2>${escapeHtml(sec.tema)}</h2>
        <span class="count">${sec.items.length}</span>
      </div>
      <div class="grid">
        ${sec.items.map(cardHtml).join('')}
      </div>
    </section>
  `).join('');
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
