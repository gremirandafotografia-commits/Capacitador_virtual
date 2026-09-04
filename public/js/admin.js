let EVALUACIONES = [];
let CATEGORIAS_EVAL = [];
let INTENTOS_POR_EVAL = new Map(); // evaluacionId -> items[]

async function init() {
  const data = await Api.listEvaluaciones();
  EVALUACIONES = data.items || [];
  CATEGORIAS_EVAL = data.categorias || [];

  const selNueva = document.getElementById('nTema');
  CATEGORIAS_EVAL.forEach(c => selNueva.appendChild(new Option(c, c)));

  const selFiltro = document.getElementById('filtroEvalResultados');
  EVALUACIONES.forEach(e => selFiltro.appendChild(new Option(`${e.tema} · ${e.titulo}`, e.id)));

  renderEvaluaciones();
  await cargarTodosLosIntentos();
  renderResultados();

  bindTabs();
  bindModalNueva();
  bindResultados();

  document.getElementById('btnCerrarSesion').addEventListener('click', () => {
    AdminAuth.clearToken();
    window.location.href = '/index.html';
  });
}

function bindTabs() {
  document.querySelectorAll('.tabs [data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tabs [data-tab]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tabEvaluaciones').hidden = btn.dataset.tab !== 'evaluaciones';
      document.getElementById('tabResultados').hidden = btn.dataset.tab !== 'resultados';
    });
  });
}

/* ---------- Tab: Evaluaciones ---------- */

function renderEvaluaciones() {
  const grid = document.getElementById('gridEval');
  if (!EVALUACIONES.length) {
    grid.innerHTML = '<div class="empty">Todavía no hay evaluaciones. Creá la primera con "+ Nueva evaluación".</div>';
    return;
  }
  const porTema = CATEGORIAS_EVAL
    .map(c => ({ tema: c, items: EVALUACIONES.filter(e => !e.esFinal && e.tema === c) }))
    .filter(s => s.items.length);
  const finales = EVALUACIONES.filter(e => e.esFinal);
  const secciones = [...porTema];
  if (finales.length) secciones.push({ tema: 'Final', items: finales });

  grid.innerHTML = secciones.map(sec => `
    <section class="cat-section">
      <div class="cat-section-head" data-cat="${escapeHtml(sec.tema)}">
        <span class="dot"></span><h2>${escapeHtml(sec.tema)}</h2><span class="count">${sec.items.length}</span>
      </div>
      <div class="grid">
        ${sec.items.map(e => `
          <div class="card">
            <span class="pill" data-cat="${escapeHtml(e.tema)}">${escapeHtml(e.tema)}</span>
            <h3>${escapeHtml(e.titulo)}</h3>
            <p>${escapeHtml(e.descripcion || 'Sin descripción')}</p>
            <div class="meta">
              <span>${e.preguntas} pregunta${e.preguntas === 1 ? '' : 's'}</span>
              <span>·</span>
              <span>${e.intentos} respuesta${e.intentos === 1 ? '' : 's'}</span>
            </div>
            <div class="actions">
              <a class="btn small primary" href="/admin-evaluacion.html?id=${encodeURIComponent(e.id)}"><span class="msym" style="font-size:15px">edit</span> Editar</a>
              <a class="btn small" href="/evaluar.html?id=${encodeURIComponent(e.id)}" target="_blank"><span class="msym" style="font-size:15px">visibility</span> Ver</a>
              <button class="btn small danger" data-del-eval="${encodeURIComponent(e.id)}"><span class="msym" style="font-size:15px">delete</span></button>
            </div>
          </div>
        `).join('')}
      </div>
    </section>
  `).join('');

  grid.querySelectorAll('[data-del-eval]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ok = await confirmDialog('¿Eliminar esta evaluación y todas sus respuestas registradas? Esta acción no se puede deshacer.', { titulo: 'Eliminar evaluación' });
      if (!ok) return;
      try {
        await Api.deleteEvaluacion(decodeURIComponent(btn.dataset.delEval));
        EVALUACIONES = EVALUACIONES.filter(e => e.id !== decodeURIComponent(btn.dataset.delEval));
        renderEvaluaciones();
        toast('Evaluación eliminada');
      } catch (e) { toast(e.message, true); }
    });
  });
}

function bindModalNueva() {
  const modal = document.getElementById('modalNuevaEval');
  function toggle(show) { modal.hidden = !show; if (show) document.getElementById('nTitulo').focus(); }

  document.getElementById('btnNuevaEval').addEventListener('click', () => toggle(true));
  document.getElementById('nCancelar').addEventListener('click', () => toggle(false));
  document.getElementById('nEsFinal').addEventListener('change', (e) => {
    document.getElementById('nCampoTema').hidden = e.target.checked;
  });
  document.getElementById('nCrear').addEventListener('click', async () => {
    const titulo = document.getElementById('nTitulo').value.trim();
    if (!titulo) { toast('Escribe un título', true); return; }
    const esFinal = document.getElementById('nEsFinal').checked;
    const tema = document.getElementById('nTema').value;
    try {
      const doc = await Api.createEvaluacion({ titulo, esFinal, tema });
      window.location.href = `/admin-evaluacion.html?id=${encodeURIComponent(doc.id)}`;
    } catch (e) { toast(e.message, true); }
  });
}

/* ---------- Tab: Resultados ---------- */

async function cargarTodosLosIntentos() {
  INTENTOS_POR_EVAL = new Map();
  await Promise.all(EVALUACIONES.map(async (e) => {
    const data = await Api.listIntentos(e.id);
    INTENTOS_POR_EVAL.set(e.id, data.items || []);
  }));
}

function bindResultados() {
  document.getElementById('filtroEvalResultados').addEventListener('change', renderResultados);
  document.getElementById('btnExportarCsv').addEventListener('click', exportarCsv);
  document.getElementById('revisarCancelar').addEventListener('click', () => { document.getElementById('modalRevisar').hidden = true; });
}

function filasVisibles() {
  const filtroId = document.getElementById('filtroEvalResultados').value;
  const evals = filtroId ? EVALUACIONES.filter(e => e.id === filtroId) : EVALUACIONES;
  const filas = [];
  for (const ev of evals) {
    const intentos = INTENTOS_POR_EVAL.get(ev.id) || [];
    for (const it of intentos) filas.push({ ev, it });
  }
  return filas;
}

function renderResultados() {
  const box = document.getElementById('resultadosBox');
  const filas = filasVisibles();
  if (!filas.length) {
    box.innerHTML = '<div class="empty">Todavía no hay respuestas registradas.</div>';
    return;
  }
  const porTema = {};
  filas.forEach(f => {
    const t = f.ev.tema;
    (porTema[t] = porTema[t] || []).push(f);
  });

  box.innerHTML = Object.keys(porTema).map(tema => `
    <section class="cat-section">
      <div class="cat-section-head" data-cat="${escapeHtml(tema)}"><span class="dot"></span><h2>${escapeHtml(tema)}</h2><span class="count">${porTema[tema].length}</span></div>
      <div class="tabla-wrap">
        <table class="tabla-resultados">
          <thead><tr><th>Evaluación</th><th>Nombre</th><th>Fecha</th><th>Nota</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            ${porTema[tema].map(f => filaHtml(f)).join('')}
          </tbody>
        </table>
      </div>
    </section>
  `).join('');

  box.querySelectorAll('[data-revisar]').forEach(btn => {
    btn.addEventListener('click', () => abrirRevision(btn.dataset.revisar, btn.dataset.evalId));
  });
}

function filaHtml({ ev, it }) {
  const estado = it.pendienteRevision
    ? '<span class="badge badge-pendiente">Pendiente de revisión</span>'
    : '<span class="badge badge-ok">Revisado</span>';
  const nota = it.calificacionFinal === null ? `${it.puntajeAuto}/${it.totalAuto} (parcial)` : `${it.calificacionFinal}/100`;
  const accion = it.pendienteRevision
    ? `<button class="btn small primary" data-revisar="${it.id}" data-eval-id="${ev.id}"><span class="msym" style="font-size:14px">fact_check</span> Revisar</button>`
    : '';
  return `<tr>
    <td>${escapeHtml(ev.titulo)}</td>
    <td>${escapeHtml(it.nombre)} ${escapeHtml(it.apellido)}</td>
    <td>${fmtDate(it.fecha)}</td>
    <td>${nota}</td>
    <td>${estado}</td>
    <td>${accion}</td>
  </tr>`;
}

let revisando = null;

async function abrirRevision(intentoId, evalId) {
  const intentos = INTENTOS_POR_EVAL.get(evalId) || [];
  const intento = intentos.find(i => i.id === intentoId);
  const ev = EVALUACIONES.find(e => e.id === evalId);
  const full = await Api.getEvaluacion(evalId);
  if (!intento || !full) return;

  revisando = { intento, evalId };
  document.getElementById('revisarQuien').textContent = `${intento.nombre} ${intento.apellido} · ${ev.titulo}`;

  const abiertas = intento.respuestas.filter(r => r.tipo === 'abierta');
  document.getElementById('revisarBox').innerHTML = abiertas.map(r => {
    const p = (full.preguntas || []).find(p => p.id === r.preguntaId);
    return `
      <div class="revisar-pregunta" data-revisar-pregunta="${r.preguntaId}">
        <p><b>${escapeHtml(p ? p.texto : 'Pregunta')}</b></p>
        <p class="respuesta-abierta">${escapeHtml(r.texto || '(sin respuesta)')}</p>
        <label style="display:flex;align-items:center;gap:6px">
          <input type="checkbox" data-correcta ${r.correcta ? 'checked' : ''}> Marcar como correcta
        </label>
        <textarea data-retro placeholder="Retroalimentación (opcional)" style="min-height:60px">${escapeHtml(r.retro || '')}</textarea>
      </div>
    `;
  }).join('');

  document.getElementById('modalRevisar').hidden = false;
}

document.addEventListener('click', async (e) => {
  if (e.target.id !== 'revisarGuardar') return;
  if (!revisando) return;
  const calificaciones = Array.from(document.querySelectorAll('[data-revisar-pregunta]')).map(box => ({
    preguntaId: box.dataset.revisarPregunta,
    correcta: box.querySelector('[data-correcta]').checked,
    retro: box.querySelector('[data-retro]').value
  }));
  try {
    const actualizado = await Api.calificarIntento(revisando.evalId, revisando.intento.id, calificaciones);
    const lista = INTENTOS_POR_EVAL.get(revisando.evalId) || [];
    const idx = lista.findIndex(i => i.id === actualizado.id);
    if (idx >= 0) lista[idx] = actualizado;
    document.getElementById('modalRevisar').hidden = true;
    revisando = null;
    renderResultados();
    toast('Revisión guardada');
  } catch (err) { toast(err.message, true); }
});

function exportarCsv() {
  const filas = filasVisibles();
  if (!filas.length) { toast('No hay resultados para exportar', true); return; }
  const header = ['Tema', 'Evaluación', 'Nombre', 'Apellido', 'Fecha', 'Nota', 'Estado'];
  const rows = filas.map(({ ev, it }) => [
    ev.tema, ev.titulo, it.nombre, it.apellido, it.fecha,
    it.calificacionFinal === null ? `${it.puntajeAuto}/${it.totalAuto} parcial` : `${it.calificacionFinal}/100`,
    it.pendienteRevision ? 'Pendiente de revisión' : 'Revisado'
  ]);
  const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `evaluaciones-resultados-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

adminGuard().then(init);
