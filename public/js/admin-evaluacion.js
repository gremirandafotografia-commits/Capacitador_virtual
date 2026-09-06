let EVAL = null;
let TRAMITES_AUX = [];
let CATEGORIAS_AUX = [];
let MANUALES_AUX = [];

function qs(name) { return new URLSearchParams(location.search).get(name); }
function makeId() { return 'x' + Math.random().toString(36).slice(2, 9); }

async function init() {
  const id = qs('id');
  if (!id) { toast('Falta el id de la evaluación', true); return; }

  const [doc, listadoEval, listadoTramites, listadoManuales] = await Promise.all([
    Api.getEvaluacion(id),
    Api.listEvaluaciones(),
    Api.listTramites(),
    Api.listManuales()
  ]);
  EVAL = doc;
  CATEGORIAS_AUX = listadoEval.categorias;
  TRAMITES_AUX = listadoTramites.items;
  MANUALES_AUX = listadoManuales.items || [];

  document.getElementById('app').hidden = false;
  document.getElementById('tituloTopbar').textContent = EVAL.titulo;
  document.getElementById('linkVer').href = `/evaluar.html?id=${encodeURIComponent(EVAL.id)}`;

  renderMeta();
  renderPreguntas();
  bindGlobal();
  bindGenerarIA();
}

function renderMeta() {
  document.getElementById('mTitulo').value = EVAL.titulo || '';
  document.getElementById('mDescripcion').value = EVAL.descripcion || '';
  document.getElementById('mEsFinal').checked = !!EVAL.esFinal;
  document.getElementById('campoTema').hidden = !!EVAL.esFinal;

  const selTema = document.getElementById('mTema');
  selTema.innerHTML = '';
  CATEGORIAS_AUX.forEach(c => selTema.appendChild(new Option(c, c, false, c === EVAL.tema)));

  const selTramite = document.getElementById('mTramite');
  selTramite.innerHTML = '<option value="">(ninguno)</option>';
  TRAMITES_AUX.forEach(t => selTramite.appendChild(new Option(t.titulo, t.id, false, t.id === EVAL.tramiteId)));
}

function bindGlobal() {
  document.getElementById('mTitulo').addEventListener('input', (e) => {
    EVAL.titulo = e.target.value;
    document.getElementById('tituloTopbar').textContent = EVAL.titulo || 'Editor de evaluación';
  });
  document.getElementById('mDescripcion').addEventListener('input', (e) => { EVAL.descripcion = e.target.value; });
  document.getElementById('mEsFinal').addEventListener('change', (e) => {
    EVAL.esFinal = e.target.checked;
    document.getElementById('campoTema').hidden = EVAL.esFinal;
    if (EVAL.esFinal) EVAL.tema = 'Final';
    else EVAL.tema = document.getElementById('mTema').value;
  });
  document.getElementById('mTema').addEventListener('change', (e) => { EVAL.tema = e.target.value; });
  document.getElementById('mTramite').addEventListener('change', (e) => { EVAL.tramiteId = e.target.value; });

  document.getElementById('btnAgregarPregunta').addEventListener('click', () => {
    EVAL.preguntas.push({ id: makeId(), texto: '', tipo: 'opcion', opciones: [] });
    renderPreguntas();
  });

  document.getElementById('btnGuardar').addEventListener('click', guardar);
}

function renderPreguntas() {
  const list = document.getElementById('preguntaList');
  list.innerHTML = '';
  document.getElementById('preguntasEmpty').hidden = EVAL.preguntas.length > 0;

  EVAL.preguntas.forEach((p, idx) => {
    const tpl = document.getElementById('tplPregunta').content.cloneNode(true);
    const el = tpl.querySelector('[data-pregunta]');
    el.querySelector('.step-num').textContent = idx + 1;

    const textoInput = el.querySelector('.pregunta-texto');
    textoInput.value = p.texto || '';
    textoInput.addEventListener('input', () => { p.texto = textoInput.value; });

    const tipoSel = el.querySelector('.pregunta-tipo');
    tipoSel.value = p.tipo;
    tipoSel.addEventListener('change', () => {
      p.tipo = tipoSel.value;
      if (p.tipo === 'vf') {
        p.opciones = [
          { id: makeId(), texto: 'Verdadero', correcta: false },
          { id: makeId(), texto: 'Falso', correcta: false }
        ];
      } else if (p.tipo === 'opcion' && (!p.opciones || !p.opciones.length)) {
        p.opciones = [];
      }
      renderPreguntas();
    });

    el.querySelector('[data-mover="-1"]').addEventListener('click', () => moverPregunta(idx, -1));
    el.querySelector('[data-mover="1"]').addEventListener('click', () => moverPregunta(idx, 1));
    el.querySelector('[data-eliminar-pregunta]').addEventListener('click', async () => {
      const ok = await confirmDialog('¿Eliminar esta pregunta?', { titulo: 'Eliminar pregunta' });
      if (!ok) return;
      EVAL.preguntas.splice(idx, 1);
      renderPreguntas();
    });

    const opcionesList = el.querySelector('[data-opciones-list]');
    const btnAgregarOpcion = el.querySelector('[data-agregar-opcion]');
    const helperAbierta = el.querySelector('[data-abierta-helper]');

    if (p.tipo === 'abierta') {
      opcionesList.hidden = true;
      btnAgregarOpcion.hidden = true;
      helperAbierta.hidden = false;
    } else {
      p.opciones = p.opciones || [];
      p.opciones.forEach(o => opcionesList.appendChild(buildOpcionRow(p, o)));
      btnAgregarOpcion.hidden = (p.tipo === 'vf');
      btnAgregarOpcion.addEventListener('click', () => {
        p.opciones.push({ id: makeId(), texto: '', correcta: false });
        renderPreguntas();
      });
    }

    list.appendChild(el);
  });
}

function buildOpcionRow(pregunta, opcion) {
  const tpl = document.getElementById('tplOpcion').content.cloneNode(true);
  const row = tpl.querySelector('[data-opcion-row]');
  const radio = row.querySelector('[data-opcion-correcta]');
  const texto = row.querySelector('.opcion-texto');

  radio.name = `correcta-${pregunta.id}`;
  radio.checked = !!opcion.correcta;
  radio.addEventListener('change', () => {
    pregunta.opciones.forEach(o => { o.correcta = (o.id === opcion.id); });
  });

  texto.value = opcion.texto || '';
  texto.addEventListener('input', () => { opcion.texto = texto.value; });

  row.querySelector('[data-eliminar-opcion]').addEventListener('click', () => {
    pregunta.opciones = pregunta.opciones.filter(o => o.id !== opcion.id);
    renderPreguntas();
  });

  return row;
}

function moverPregunta(idx, dir) {
  const j = idx + dir;
  if (j < 0 || j >= EVAL.preguntas.length) return;
  [EVAL.preguntas[idx], EVAL.preguntas[j]] = [EVAL.preguntas[j], EVAL.preguntas[idx]];
  renderPreguntas();
}

async function guardar() {
  for (const p of EVAL.preguntas) {
    if (p.tipo !== 'abierta' && (p.opciones || []).filter(o => o.correcta).length !== 1) {
      toast('Cada pregunta de opción múltiple / verdadero-falso necesita exactamente una opción marcada como correcta', true);
      return;
    }
  }
  try {
    await Api.saveEvaluacion(EVAL.id, EVAL);
    toast('Evaluación guardada');
  } catch (e) {
    toast(e.message, true);
  }
}

/* ---------- Generador asistido de preguntas con IA ---------- */

let DRAFTS_IA = [];

function bindGenerarIA() {
  const modal = document.getElementById('modalGenerarIA');
  const selManual = document.getElementById('iaManual');
  const textoBox = document.getElementById('iaTexto');

  selManual.innerHTML = '<option value="">(pegar texto manualmente)</option>' +
    MANUALES_AUX.map(m => `<option value="${escapeHtml(m.archivo)}">${escapeHtml(m.titulo)} · ${escapeHtml(m.categoria)}</option>`).join('');

  function toggle(show) {
    modal.hidden = !show;
    if (show) {
      document.getElementById('iaResultado').innerHTML = '';
      DRAFTS_IA = [];
    }
  }

  document.getElementById('btnGenerarIA').addEventListener('click', () => toggle(true));
  document.getElementById('iaCancelar').addEventListener('click', () => toggle(false));

  selManual.addEventListener('change', async () => {
    const archivo = selManual.value;
    textoBox.value = '';
    if (!archivo) return;
    try {
      const contenido = await Api.getManualContenido(archivo);
      if (contenido.tipo === 'texto') {
        textoBox.value = contenido.texto;
      } else if (contenido.tipo === 'html') {
        const tmp = document.createElement('div');
        tmp.innerHTML = contenido.html;
        textoBox.value = (tmp.innerText || tmp.textContent || '').trim();
      } else {
        textoBox.placeholder = 'Este tipo de manual (por ejemplo PDF) no se puede leer automáticamente todavía: pegá aquí el texto relevante.';
      }
    } catch (e) {
      toast(e.message, true);
    }
  });

  document.getElementById('iaGenerar').addEventListener('click', async () => {
    const texto = textoBox.value.trim();
    if (!texto) { toast('Elegí un manual o pegá el texto del que se generarán las preguntas', true); return; }
    const cantidad = document.getElementById('iaCantidad').value;
    const btn = document.getElementById('iaGenerar');
    const resultado = document.getElementById('iaResultado');
    btn.disabled = true;
    resultado.innerHTML = `<p class="helper"><span class="msym spin" style="font-size:16px;vertical-align:-3px">progress_activity</span> Generando preguntas, puede tardar unos segundos...</p>`;
    try {
      const data = await Api.generarPreguntasIA({ texto, cantidad });
      DRAFTS_IA = data.preguntas.map(p => ({ ...p, incluir: true }));
      renderDraftsIA();
    } catch (e) {
      resultado.innerHTML = '';
      toast(e.message, true);
    } finally {
      btn.disabled = false;
    }
  });
}

function renderDraftsIA() {
  const resultado = document.getElementById('iaResultado');
  if (!DRAFTS_IA.length) { resultado.innerHTML = ''; return; }

  resultado.innerHTML = `
    <p class="helper">${DRAFTS_IA.length} pregunta${DRAFTS_IA.length === 1 ? '' : 's'} generada${DRAFTS_IA.length === 1 ? '' : 's'}. Desmarcá las que no querés, editá el texto si hace falta y agregalas a la evaluación.</p>
    <div id="iaDraftList"></div>
    <div class="modal-actions">
      <button class="btn primary" id="iaAgregarSeleccionadas"><span class="msym" style="font-size:16px">add_circle</span> Agregar seleccionadas</button>
    </div>
  `;

  const list = document.getElementById('iaDraftList');
  list.innerHTML = DRAFTS_IA.map((p, idx) => `
    <div class="ia-draft-item">
      <div class="ia-draft-head">
        <input type="checkbox" data-ia-check="${idx}" ${p.incluir ? 'checked' : ''}>
        <textarea rows="2" data-ia-texto="${idx}">${escapeHtml(p.texto)}</textarea>
      </div>
      <div class="ia-draft-opciones">
        ${p.opciones.map(o => `<span class="op${o.correcta ? ' correcta' : ''}">${o.correcta ? '✓' : '·'} ${escapeHtml(o.texto)}</span>`).join('')}
      </div>
    </div>
  `).join('');

  list.querySelectorAll('[data-ia-check]').forEach(cb => {
    cb.addEventListener('change', () => { DRAFTS_IA[+cb.dataset.iaCheck].incluir = cb.checked; });
  });
  list.querySelectorAll('[data-ia-texto]').forEach(ta => {
    ta.addEventListener('input', () => { DRAFTS_IA[+ta.dataset.iaTexto].texto = ta.value; });
  });

  document.getElementById('iaAgregarSeleccionadas').addEventListener('click', () => {
    const seleccionadas = DRAFTS_IA.filter(p => p.incluir);
    if (!seleccionadas.length) { toast('Marcá al menos una pregunta', true); return; }
    seleccionadas.forEach(p => {
      EVAL.preguntas.push({
        id: makeId(),
        texto: p.texto.trim(),
        tipo: p.tipo,
        opciones: p.opciones.map(o => ({ id: makeId(), texto: o.texto, correcta: !!o.correcta }))
      });
    });
    document.getElementById('modalGenerarIA').hidden = true;
    renderPreguntas();
    toast(`${seleccionadas.length} pregunta${seleccionadas.length === 1 ? '' : 's'} agregada${seleccionadas.length === 1 ? '' : 's'}. Recordá guardar los cambios.`);
  });
}

adminGuard().then(init);
