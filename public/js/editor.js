let DOC = null;
let TRAMITES_AUX = [];
let CATEGORIAS_AUX = [];
let MANUALES_AUX = [];
const stepRuntime = new Map(); // stepId -> { annotator, capture }

function qs(name) { return new URLSearchParams(location.search).get(name); }
function makeStepId() { return 's' + Math.random().toString(36).slice(2, 9); }

async function init() {
  const id = qs('id');
  if (!id) { toast('Falta el id del trámite', true); return; }

  const [doc, listado, manuales] = await Promise.all([
    Api.getTramite(id),
    Api.listTramites(),
    Api.listManuales()
  ]);
  DOC = doc;
  TRAMITES_AUX = listado.items;
  CATEGORIAS_AUX = listado.categorias;
  MANUALES_AUX = manuales.items;

  document.getElementById('app').hidden = false;
  document.getElementById('tituloTopbar').textContent = DOC.titulo;
  document.getElementById('linkVer').href = `/viewer.html?id=${encodeURIComponent(DOC.id)}`;

  renderMeta();
  renderSteps();
  renderLinks();
  bindGlobal();
}

function bindGlobal() {
  document.getElementById('mTitulo').addEventListener('input', (e) => {
    DOC.titulo = e.target.value;
    document.getElementById('tituloTopbar').textContent = DOC.titulo || 'Editor de trámite';
  });
  document.getElementById('mCategoria').addEventListener('change', (e) => { DOC.categoria = e.target.value; });
  document.getElementById('mDescripcion').addEventListener('input', (e) => { DOC.descripcion = e.target.value; });

  document.getElementById('btnAgregarPaso').addEventListener('click', () => {
    DOC.pasos.push({ id: makeStepId(), titulo: `Paso ${DOC.pasos.length + 1}`, texto: '', media: null, anotaciones: [] });
    renderSteps();
  });

  document.getElementById('btnAgregarVinculo').addEventListener('click', () => {
    DOC.vinculos.push({ id: makeStepId(), tipo: 'tramite', destino: '', etiqueta: '' });
    renderLinks();
  });

  document.getElementById('btnGuardar').addEventListener('click', guardar);

  const inputVideo = document.getElementById('inputVideoExterno');
  const videoEl = document.getElementById('videoExterno');
  const btnCapturar = document.getElementById('btnCapturarFotograma');
  inputVideo.addEventListener('change', async () => {
    const file = inputVideo.files[0];
    if (!file) return;
    toast('Subiendo video externo...');
    try {
      const res = await Api.uploadMedia(DOC.id, file, file.name);
      DOC.videoExterno = { src: res.src, nombre: file.name };
      videoEl.src = res.src;
      videoEl.hidden = false;
      btnCapturar.disabled = false;
      toast('Video externo cargado');
    } catch (e) { toast(e.message, true); }
  });
  if (DOC.videoExterno && DOC.videoExterno.src) {
    videoEl.src = DOC.videoExterno.src;
    videoEl.hidden = false;
    btnCapturar.disabled = false;
  }
  btnCapturar.addEventListener('click', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    canvas.getContext('2d').drawImage(videoEl, 0, 0);
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    try {
      const res = await Api.uploadMedia(DOC.id, blob, 'fotograma.png');
      const paso = { id: makeStepId(), titulo: `Paso ${DOC.pasos.length + 1} (del video)`, texto: '', media: { tipo: 'imagen', src: res.src }, anotaciones: [] };
      DOC.pasos.push(paso);
      renderSteps();
      toast('Fotograma capturado como nuevo paso');
      document.querySelector(`[data-step][data-id="${paso.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) { toast(e.message, true); }
  });
}

function renderMeta() {
  document.getElementById('mTitulo').value = DOC.titulo || '';
  document.getElementById('mDescripcion').value = DOC.descripcion || '';
  const sel = document.getElementById('mCategoria');
  sel.innerHTML = '';
  for (const c of CATEGORIAS_AUX) sel.appendChild(new Option(c, c, false, c === DOC.categoria));
}

function renderSteps() {
  const list = document.getElementById('stepList');
  list.innerHTML = '';
  document.getElementById('stepsEmpty').hidden = DOC.pasos.length > 0;
  stepRuntime.clear();

  DOC.pasos.forEach((paso, idx) => {
    const tpl = document.getElementById('tplStep').content.cloneNode(true);
    const stepEl = tpl.querySelector('[data-step]');
    stepEl.dataset.id = paso.id;
    stepEl.querySelector('.step-num').textContent = idx + 1;
    const tituloInput = stepEl.querySelector('.step-titulo');
    tituloInput.value = paso.titulo || '';
    tituloInput.addEventListener('input', () => { paso.titulo = tituloInput.value; });

    stepEl.querySelector('[data-mover="-1"]').addEventListener('click', () => moverPaso(idx, -1));
    stepEl.querySelector('[data-mover="1"]').addEventListener('click', () => moverPaso(idx, 1));
    stepEl.querySelector('[data-eliminar-paso]').addEventListener('click', async () => {
      const ok = await confirmDialog('¿Eliminar este paso?', { titulo: 'Eliminar paso' });
      if (!ok) return;
      DOC.pasos.splice(idx, 1);
      renderSteps();
    });

    const rte = stepEl.querySelector('[data-texto]');
    rte.innerHTML = paso.texto || '';
    rte.addEventListener('input', () => { paso.texto = rte.innerHTML; });
    stepEl.querySelectorAll('.rte-toolbar [data-cmd]').forEach(btn => {
      const cmd = btn.dataset.cmd;
      if (btn.tagName === 'INPUT') {
        btn.addEventListener('input', () => { rte.focus(); document.execCommand(cmd, false, btn.value); paso.texto = rte.innerHTML; });
      } else {
        btn.addEventListener('click', () => { rte.focus(); document.execCommand(cmd, false, null); paso.texto = rte.innerHTML; });
      }
    });

    const stage = stepEl.querySelector('[data-stage]');
    const annotator = new Annotator(stage, {
      editable: true,
      onChange: () => { paso.anotaciones = annotator.serialize(); }
    });

    const propsBox = stepEl.querySelector('[data-anno-props]');
    annotator.onSelectionChange((sel) => renderAnnoProps(propsBox, annotator, sel));

    renderStageMedia(stage, paso);
    annotator.load(paso.anotaciones || []);

    const toolbar = stepEl.querySelector('[data-anno-toolbar]');
    toolbar.querySelectorAll('[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => {
        toolbar.querySelectorAll('[data-tool]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        annotator.setTool(btn.dataset.tool);
      });
    });
    toolbar.querySelector('[data-tool-imagen]').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const dataUrl = await fileToDataUrl(file);
      annotator.setPendingImage(dataUrl);
    });
    stepEl.querySelector('[data-borrar-anno]').addEventListener('click', () => annotator.deleteSelected());

    const capture = new MediaCapture();
    stepRuntime.set(paso.id, { annotator, capture });
    bindCapture(stepEl, paso, stage, annotator, capture);

    list.appendChild(stepEl);
  });
}

function renderAnnoProps(box, annotator, sel) {
  if (!sel) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  let html = '';
  if (['rect', 'ellipse', 'arrow'].includes(sel.tipo)) {
    html += `<label>Color <input type="color" data-p="color" value="${sel.color}"></label>`;
    html += `<label>Grosor <input type="range" min="1" max="10" data-p="grosor" value="${sel.grosor || 3}"></label>`;
  } else if (sel.tipo === 'texto') {
    html += `<label>Color <input type="color" data-p="color" value="${sel.color}"></label>`;
    html += `<label>Tamaño <input type="range" min="10" max="60" data-p="tamano" value="${sel.tamano || 20}"></label>`;
    html += `<label><input type="checkbox" data-p="negrita" ${sel.negrita ? 'checked' : ''}> Negrita</label>`;
    html += `<span class="helper">Doble clic sobre el texto para editarlo</span>`;
  } else if (sel.tipo === 'callout') {
    html += `<label>Estilo <select data-p="estilo">
      <option value="tip">💡 Tip</option><option value="aviso">⚠️ Aviso</option>
      <option value="importante">❗ Importante</option><option value="info">ℹ️ Info</option>
    </select></label>`;
    html += `<span class="helper">Doble clic sobre el texto para editarlo</span>`;
  } else if (sel.tipo === 'imagen') {
    html += `<span class="helper">Arrastra para mover, usa la esquina para redimensionar</span>`;
  }
  box.innerHTML = html;
  if (sel.tipo === 'callout') box.querySelector('[data-p="estilo"]').value = sel.estilo;
  box.querySelectorAll('[data-p]').forEach(input => {
    input.addEventListener('input', () => {
      const key = input.dataset.p;
      let val = input.type === 'checkbox' ? input.checked : input.value;
      if (input.type === 'range') val = Number(val);
      annotator.updateSelected({ [key]: val });
    });
  });
}

function renderStageMedia(stage, paso) {
  const old = stage.querySelector('img, video, .empty-stage');
  if (old) old.remove();
  if (!paso.media) {
    const div = document.createElement('div');
    div.className = 'empty-stage';
    div.textContent = 'Sin imagen ni video todavía. Graba, toma un pantallazo o sube un archivo.';
    stage.prepend(div);
    return;
  }
  let el;
  if (paso.media.tipo === 'video') {
    el = document.createElement('video');
    el.src = paso.media.src;
    el.controls = true;
  } else {
    el = document.createElement('img');
    el.src = paso.media.src;
  }
  stage.prepend(el);
}

function bindCapture(stepEl, paso, stage, annotator, capture) {
  const btnPantalla = stepEl.querySelector('[data-accion="pantalla"]');
  const btnCamara = stepEl.querySelector('[data-accion="camara"]');
  const btnShot = stepEl.querySelector('[data-accion="pantallazo"]');
  const btnDetener = stepEl.querySelector('[data-accion="detener"]');
  const indicador = stepEl.querySelector('[data-indicador]');
  const inputVideo = stepEl.querySelector('[data-subir="video"]');
  const inputImagen = stepEl.querySelector('[data-subir="imagen"]');
  const btnFrame = stepEl.querySelector('[data-accion="frame-video"]');
  const allCaptureBtns = [btnPantalla, btnCamara, btnShot];

  function setRecording(on) {
    indicador.classList.toggle('on', on);
    btnDetener.hidden = !on;
    allCaptureBtns.forEach(b => b.disabled = on);
  }

  async function startRec(kind) {
    try {
      setRecording(true);
      await capture.start(kind, { mic: true });
    } catch (e) {
      setRecording(false);
      toast('No se pudo iniciar la captura: ' + e.message, true);
    }
  }

  btnPantalla.addEventListener('click', () => startRec('pantalla'));
  btnCamara.addEventListener('click', () => startRec('camara'));
  btnDetener.addEventListener('click', async () => {
    const blob = await capture.stop();
    setRecording(false);
    if (!blob || !blob.size) return;
    toast('Subiendo grabación...');
    try {
      const res = await Api.uploadMedia(DOC.id, blob, `paso-${Date.now()}.webm`);
      paso.media = { tipo: 'video', src: res.src };
      renderStageMedia(stage, paso);
      toast('Grabación guardada en el paso');
    } catch (e) { toast(e.message, true); }
  });

  btnShot.addEventListener('click', async () => {
    try {
      btnShot.disabled = true;
      const blob = await grabScreenshot();
      const res = await Api.uploadMedia(DOC.id, blob, `pantallazo-${Date.now()}.png`);
      paso.media = { tipo: 'imagen', src: res.src };
      renderStageMedia(stage, paso);
      toast('Pantallazo agregado');
    } catch (e) {
      toast('No se pudo tomar el pantallazo: ' + e.message, true);
    } finally {
      btnShot.disabled = false;
    }
  });

  inputVideo.addEventListener('change', async () => {
    const file = inputVideo.files[0];
    if (!file) return;
    try {
      const res = await Api.uploadMedia(DOC.id, file, file.name);
      paso.media = { tipo: 'video', src: res.src };
      renderStageMedia(stage, paso);
      toast('Video agregado al paso');
    } catch (e) { toast(e.message, true); }
  });
  inputImagen.addEventListener('change', async () => {
    const file = inputImagen.files[0];
    if (!file) return;
    try {
      const res = await Api.uploadMedia(DOC.id, file, file.name);
      paso.media = { tipo: 'imagen', src: res.src };
      renderStageMedia(stage, paso);
      toast('Imagen agregada al paso');
    } catch (e) { toast(e.message, true); }
  });

  btnFrame.addEventListener('click', async () => {
    const videoEl = stage.querySelector('video');
    if (!videoEl) {
      toast('Este paso no tiene un video cargado para capturar', true);
      return;
    }
    try {
      btnFrame.disabled = true;
      const canvas = document.createElement('canvas');
      canvas.width = videoEl.videoWidth;
      canvas.height = videoEl.videoHeight;
      canvas.getContext('2d').drawImage(videoEl, 0, 0);
      const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
      const res = await Api.uploadMedia(DOC.id, blob, `fotograma-${Date.now()}.png`);
      const nuevoPaso = { id: makeStepId(), titulo: `Paso ${DOC.pasos.length + 1} (fotograma)`, texto: '', media: { tipo: 'imagen', src: res.src }, anotaciones: [] };
      DOC.pasos.splice(DOC.pasos.indexOf(paso) + 1, 0, nuevoPaso);
      renderSteps();
      toast('Fotograma capturado como nuevo paso');
      document.querySelector(`[data-step][data-id="${nuevoPaso.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {
      toast('No se pudo capturar el fotograma: ' + e.message, true);
    } finally {
      btnFrame.disabled = false;
    }
  });
}

function moverPaso(idx, dir) {
  const j = idx + dir;
  if (j < 0 || j >= DOC.pasos.length) return;
  [DOC.pasos[idx], DOC.pasos[j]] = [DOC.pasos[j], DOC.pasos[idx]];
  renderSteps();
}

function renderLinks() {
  const list = document.getElementById('linkList');
  list.innerHTML = '';
  if (!DOC.vinculos.length) {
    const p = document.createElement('p');
    p.className = 'helper';
    p.textContent = 'Sin vínculos todavía.';
    list.appendChild(p);
  }
  DOC.vinculos.forEach((v, idx) => {
    const tpl = document.getElementById('tplLinkRow').content.cloneNode(true);
    const row = tpl.querySelector('[data-link-row]');
    const selTipo = row.querySelector('[data-link-tipo]');
    const selDestino = row.querySelector('[data-link-destino]');
    const inputEtiqueta = row.querySelector('[data-link-etiqueta]');

    selTipo.value = v.tipo;
    inputEtiqueta.value = v.etiqueta || '';

    function fillDestino() {
      selDestino.innerHTML = '';
      const opts = v.tipo === 'tramite'
        ? TRAMITES_AUX.filter(t => t.id !== DOC.id).map(t => ({ id: t.id, label: t.titulo }))
        : MANUALES_AUX.map(m => ({ id: m.id, label: m.titulo }));
      if (!opts.length) selDestino.appendChild(new Option('(no hay elementos disponibles)', ''));
      for (const o of opts) selDestino.appendChild(new Option(o.label, o.id, false, o.id === v.destino));
      if (!v.destino && opts[0]) v.destino = opts[0].id;
    }
    fillDestino();

    selTipo.addEventListener('change', () => { v.tipo = selTipo.value; v.destino = ''; fillDestino(); });
    selDestino.addEventListener('change', () => { v.destino = selDestino.value; });
    inputEtiqueta.addEventListener('input', () => { v.etiqueta = inputEtiqueta.value; });
    row.querySelector('[data-link-eliminar]').addEventListener('click', () => {
      DOC.vinculos.splice(idx, 1);
      renderLinks();
    });

    list.appendChild(row);
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function guardar() {
  try {
    await Api.saveTramite(DOC.id, DOC);
    toast('Trámite guardado');
  } catch (e) {
    toast(e.message, true);
  }
}

init();
