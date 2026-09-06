const CATEGORY_COLORS = {
  'Sistema Open': '#0072BC',
  'Salesforce': '#1E77A8',
  'Qupos': '#C97600',
  'MBA Case': '#6C4FBC',
  'Agentes de Ayuda': '#C13F3B',
  'General': '#56636F'
};

let DOC = null;
let TRAMITES_AUX = [];
let CATEGORIAS_AUX = [];
let MANUALES_AUX = [];
const stepRuntime = new Map(); // stepId -> { annotator, capture }

function qs(name) { return new URLSearchParams(location.search).get(name); }
function makeStepId() { return 's' + Math.random().toString(36).slice(2, 9); }

function mensajeSubida(base, res) {
  if (!res.comprimido) return base;
  return `${base} (comprimido de ${fmtBytes(res.tamanoOriginal)} a ${fmtBytes(res.tamanoFinal)})`;
}

// Sin esto, soltar un archivo fuera de una zona valida (o apenas
// desviado del recuadro exacto) hace que el navegador navegue fuera de
// la app para intentar mostrar ese archivo directamente -se ve como si
// la pagina se "rompiera" o se quedara pegada. Cada zona valida ya hace
// su propio preventDefault+stopPropagation, asi que esto solo actua
// como red de seguridad para el resto de la pagina.
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

// Permite soltar un archivo directamente sobre `el` en vez de tener que
// abrir siempre el selector nativo del sistema operativo (que en Windows
// puede tardar en generar miniaturas/buscar sobre carpetas con videos).
function bindDropZone(el, onFile) {
  if (!el) return;
  ['dragenter', 'dragover'].forEach(ev => el.addEventListener(ev, (e) => {
    e.preventDefault();
    e.stopPropagation();
    el.classList.add('dragover');
  }));
  ['dragleave', 'dragend'].forEach(ev => el.addEventListener(ev, (e) => {
    if (ev === 'dragleave' && el.contains(e.relatedTarget)) return;
    el.classList.remove('dragover');
  }));
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    el.classList.remove('dragover');
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) onFile(file);
  });
}

function fmtTiempo(seg) {
  const m = Math.floor(seg / 60);
  const s = Math.floor(seg % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Maneja el flujo de "transcribir audio" (iniciar, consultar cada pocos
// segundos hasta que termine, listar los fragmentos con su tiempo). Se
// reutiliza tanto para el video externo de referencia como para el
// video propio de cada paso -la logica es identica, solo cambia de
// donde sale el nombre de archivo y que se hace con "Usar".
function crearTranscriptor({ btn, getVideoEl, box, estadoEl, listaEl, getNombreArchivo, onUsar, descargarBtn }) {
  let segmentosActuales = [];

  function descargarTranscripcion() {
    const nombreArchivo = getNombreArchivo();
    const base = (nombreArchivo || 'transcripcion').replace(/\.[^./]+$/, '');
    const texto = segmentosActuales.map(s => `[${fmtTiempo(s.inicio)}] ${s.texto}`).join('\n');
    const blob = new Blob([texto], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${base}-transcripcion.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
  if (descargarBtn) descargarBtn.addEventListener('click', descargarTranscripcion);

  function renderSegmentos(segmentos) {
    segmentosActuales = segmentos || [];
    if (descargarBtn) descargarBtn.hidden = !segmentosActuales.length;
    if (!segmentos.length) {
      listaEl.innerHTML = '<span class="helper">No se detectó texto en el audio.</span>';
      return;
    }
    listaEl.innerHTML = segmentos.map((s, i) => `
      <div class="transcripcion-seg" data-idx="${i}">
        <span class="ts">${fmtTiempo(s.inicio)}</span>
        <span class="txt">${escapeHtml(s.texto)}</span>
        <button type="button" class="btn small ghost btn-usar" data-idx="${i}">Usar</button>
      </div>
    `).join('');
    listaEl.querySelectorAll('.transcripcion-seg').forEach((el) => {
      const idx = parseInt(el.dataset.idx, 10);
      el.addEventListener('click', (e) => {
        if (e.target.closest('.btn-usar')) return;
        const videoEl = getVideoEl();
        if (!videoEl) return;
        videoEl.currentTime = segmentos[idx].inicio;
        videoEl.play().catch(() => { /* el usuario puede darle play manualmente */ });
        listaEl.querySelectorAll('.transcripcion-seg').forEach(x => x.classList.remove('activo'));
        el.classList.add('activo');
      });
    });
    listaEl.querySelectorAll('.btn-usar').forEach((btnUsar) => {
      btnUsar.addEventListener('click', () => onUsar(segmentos[parseInt(btnUsar.dataset.idx, 10)].texto));
    });
  }

  async function consultar(nombreArchivo) {
    const job = await Api.getTranscripcion(DOC.id, nombreArchivo);
    if (job.error) { estadoEl.textContent = job.error; return true; }
    if (!job.done) { estadoEl.textContent = 'Transcribiendo el audio... esto puede tardar varios minutos en videos largos.'; return false; }
    estadoEl.textContent = '';
    renderSegmentos(job.segmentos || []);
    return true;
  }

  btn.addEventListener('click', async () => {
    const nombreArchivo = getNombreArchivo();
    if (!nombreArchivo) return;
    box.hidden = false;
    listaEl.innerHTML = '';
    estadoEl.textContent = 'Iniciando transcripción...';
    btn.disabled = true;
    try {
      await Api.iniciarTranscripcion(DOC.id, nombreArchivo);
      for (let i = 0; i < 200; i++) {
        const terminado = await consultar(nombreArchivo);
        if (terminado) break;
        await new Promise((r) => setTimeout(r, 3000));
      }
    } catch (e) {
      estadoEl.textContent = e.message;
    } finally {
      btn.disabled = false;
    }
  });

  return {
    revisarExistente() {
      const nombreArchivo = getNombreArchivo();
      if (!nombreArchivo) return;
      Api.getTranscripcion(DOC.id, nombreArchivo)
        .then((job) => {
          if (job.iniciada && job.done && !job.error) {
            box.hidden = false;
            renderSegmentos(job.segmentos || []);
          }
        })
        .catch(() => { /* sin transcripcion previa, no pasa nada */ });
    }
  };
}

// Dictado de notas por voz usando la Web Speech API del navegador (Chrome).
// El texto reconocido se agrega a la descripcion del paso a medida que la
// persona habla, sin necesidad de grabar video ni pasar por el servidor.
function crearDictado({ btn, indicador, onTexto }) {
  const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognitionCtor) {
    btn.disabled = true;
    btn.title = 'Este navegador no soporta dictado por voz (probá con Chrome)';
    return;
  }
  const recognition = new SpeechRecognitionCtor();
  recognition.lang = 'es-CR';
  recognition.continuous = true;
  recognition.interimResults = false;
  let activo = false;

  recognition.addEventListener('result', (e) => {
    let texto = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) texto += e.results[i][0].transcript;
    }
    texto = texto.trim();
    if (texto) onTexto(texto);
  });
  recognition.addEventListener('error', (e) => {
    if (e.error === 'no-speech' || e.error === 'aborted') return;
    toast('Error de dictado: ' + e.error, true);
  });
  recognition.addEventListener('end', () => {
    // El navegador corta el reconocimiento cada cierto tiempo aunque uno
    // siga hablando; si la persona no le dio "Detener", lo reiniciamos
    // para que el dictado se sienta continuo.
    if (activo) {
      try { recognition.start(); } catch (e) { /* ya estaba iniciado */ }
    } else {
      btn.classList.remove('activo');
      indicador.classList.remove('on');
    }
  });

  btn.addEventListener('click', () => {
    if (activo) {
      activo = false;
      recognition.stop();
      toast('Dictado detenido');
    } else {
      activo = true;
      btn.classList.add('activo');
      indicador.classList.add('on');
      toast('Escuchando... las notas se agregan a este paso');
      try { recognition.start(); } catch (e) { /* ya estaba iniciado */ }
    }
  });
}

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
  document.getElementById('mCategoria').addEventListener('change', (e) => {
    DOC.categoria = e.target.value;
    document.getElementById('tagColor').value = CATEGORY_COLORS[DOC.categoria] || '#0072BC';
  });
  document.getElementById('mDescripcion').addEventListener('input', (e) => { DOC.descripcion = e.target.value; });

  document.getElementById('btnAgregarEtiqueta').addEventListener('click', agregarEtiqueta);
  document.getElementById('tagTexto').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); agregarEtiqueta(); }
  });

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
  const zonaVideoExterno = document.getElementById('videoExternoZona');
  const btnTranscribir = document.getElementById('btnTranscribir');
  const transcripcionBox = document.getElementById('transcripcionBox');
  const transcripcionEstado = document.getElementById('transcripcionEstado');
  const transcripcionLista = document.getElementById('transcripcionLista');
  const btnDescargarTranscripcion = document.getElementById('btnDescargarTranscripcion');
  // Texto del fragmento de transcripcion que se eligio con "Usar": se
  // precarga como descripcion del proximo paso creado con "Capturar
  // fotograma", para no tener que escuchar el video de nuevo y
  // transcribir el paso a mano.
  let textoSegmentoSeleccionado = null;

  function nombreArchivoVideoExterno() {
    return (DOC.videoExterno && DOC.videoExterno.src) ? DOC.videoExterno.src.split('/').pop() : null;
  }

  async function subirVideoExterno(file) {
    if (!file) return;
    toast('Subiendo video externo...');
    try {
      const res = await Api.uploadMedia(DOC.id, file, file.name, (msg) => toast(msg));
      DOC.videoExterno = { src: res.src, nombre: file.name };
      videoEl.src = res.src;
      videoEl.hidden = false;
      btnCapturar.disabled = false;
      btnTranscribir.disabled = false;
      transcripcionBox.hidden = true;
      toast(mensajeSubida('Video externo cargado', res));
    } catch (e) { toast(e.message, true); }
  }

  inputVideo.addEventListener('change', () => subirVideoExterno(inputVideo.files[0]));
  bindDropZone(zonaVideoExterno, (file) => subirVideoExterno(file));

  const transcriptorExterno = crearTranscriptor({
    btn: btnTranscribir,
    getVideoEl: () => videoEl,
    box: transcripcionBox,
    estadoEl: transcripcionEstado,
    listaEl: transcripcionLista,
    descargarBtn: btnDescargarTranscripcion,
    getNombreArchivo: nombreArchivoVideoExterno,
    onUsar: (texto) => {
      textoSegmentoSeleccionado = texto;
      toast('Texto listo: se va a usar en el próximo paso que captures con "Capturar fotograma"');
    }
  });

  if (DOC.videoExterno && DOC.videoExterno.src) {
    videoEl.src = DOC.videoExterno.src;
    videoEl.hidden = false;
    btnCapturar.disabled = false;
    btnTranscribir.disabled = false;
    // Si ya se transcribio este video antes (persiste en el servidor
    // mientras no se reinicie), la mostramos sin que haga falta
    // volver a pedirla.
    transcriptorExterno.revisarExistente();
  }

  btnCapturar.addEventListener('click', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    canvas.getContext('2d').drawImage(videoEl, 0, 0);
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    try {
      const res = await Api.uploadMedia(DOC.id, blob, 'fotograma.png');
      const paso = {
        id: makeStepId(),
        titulo: `Paso ${DOC.pasos.length + 1} (del video)`,
        texto: textoSegmentoSeleccionado ? escapeHtml(textoSegmentoSeleccionado) : '',
        media: { tipo: 'imagen', src: res.src },
        anotaciones: []
      };
      textoSegmentoSeleccionado = null;
      DOC.pasos.push(paso);
      renderSteps();
      toast('Fotograma capturado como nuevo paso');
      document.querySelector(`[data-step][data-id="${paso.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) { toast(e.message, true); }
  });

}

function agregarEtiqueta() {
  const input = document.getElementById('tagTexto');
  const texto = input.value.trim();
  if (!texto) return;
  const color = document.getElementById('tagColor').value;
  DOC.etiquetas = DOC.etiquetas || [];
  DOC.etiquetas.push({ id: makeStepId(), texto, color });
  input.value = '';
  renderEtiquetas();
}

function renderMeta() {
  document.getElementById('mTitulo').value = DOC.titulo || '';
  document.getElementById('mDescripcion').value = DOC.descripcion || '';
  const sel = document.getElementById('mCategoria');
  sel.innerHTML = '';
  for (const c of CATEGORIAS_AUX) sel.appendChild(new Option(c, c, false, c === DOC.categoria));
  document.getElementById('tagColor').value = CATEGORY_COLORS[DOC.categoria] || '#0072BC';
  renderEtiquetas();
}

function renderEtiquetas() {
  DOC.etiquetas = DOC.etiquetas || [];
  const box = document.getElementById('tagEditor');
  if (!DOC.etiquetas.length) {
    box.innerHTML = '<span class="helper">Sin etiquetas todavía.</span>';
    return;
  }
  box.innerHTML = DOC.etiquetas.map(e => `
    <span class="tag-pill editable" style="--tc:${escapeHtml(e.color)}">
      ${escapeHtml(e.texto)}
      <button type="button" data-tag-del="${e.id}" title="Quitar etiqueta">&times;</button>
    </span>
  `).join('');
  box.querySelectorAll('[data-tag-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      DOC.etiquetas = DOC.etiquetas.filter(e => e.id !== btn.dataset.tagDel);
      renderEtiquetas();
    });
  });
}

function renderSteps() {
  const list = document.getElementById('stepList');
  list.innerHTML = '';
  document.getElementById('stepsEmpty').hidden = DOC.pasos.length > 0;
  stepRuntime.clear();

  let prevSeccion = '';
  DOC.pasos.forEach((paso, idx) => {
    const seccion = (paso.seccion || '').trim();
    if (seccion && seccion !== prevSeccion) {
      const head = document.createElement('div');
      head.className = 'seccion-head';
      head.innerHTML = `<span class="msym" style="font-size:15px">folder_open</span> ${escapeHtml(seccion)}`;
      list.appendChild(head);
    }
    prevSeccion = seccion;

    const tpl = document.getElementById('tplStep').content.cloneNode(true);
    const stepEl = tpl.querySelector('[data-step]');
    stepEl.dataset.id = paso.id;
    stepEl.querySelector('.step-num').textContent = idx + 1;
    const tituloInput = stepEl.querySelector('.step-titulo');
    tituloInput.value = paso.titulo || '';
    tituloInput.addEventListener('input', () => { paso.titulo = tituloInput.value; });

    const seccionInput = stepEl.querySelector('.step-seccion');
    seccionInput.value = paso.seccion || '';
    seccionInput.addEventListener('input', () => { paso.seccion = seccionInput.value; });
    seccionInput.addEventListener('change', () => renderSteps());

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
  } else if (sel.tipo === 'etiqueta') {
    html += `<label>Color <input type="color" data-p="color" value="${sel.color}"></label>`;
    html += `<span class="helper">Doble clic sobre la etiqueta para editar el texto</span>`;
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
    div.textContent = 'Sin imagen ni video todavía. Graba, toma un pantallazo, sube un archivo o arrastralo aquí.';
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
  const btnPausar = stepEl.querySelector('[data-accion="pausar"]');
  const btnDetener = stepEl.querySelector('[data-accion="detener"]');
  const indicador = stepEl.querySelector('[data-indicador]');
  const indicadorTexto = stepEl.querySelector('[data-indicador-texto]');
  const inputVideo = stepEl.querySelector('[data-subir="video"]');
  const inputImagen = stepEl.querySelector('[data-subir="imagen"]');
  const btnFrame = stepEl.querySelector('[data-accion="frame-video"]');
  const btnTranscribirPaso = stepEl.querySelector('[data-accion="transcribir"]');
  const transcripcionBoxPaso = stepEl.querySelector('[data-transcripcion-box]');
  const transcripcionEstadoPaso = stepEl.querySelector('[data-transcripcion-estado]');
  const transcripcionListaPaso = stepEl.querySelector('[data-transcripcion-lista]');
  const btnDescargarTranscripcionPaso = stepEl.querySelector('[data-transcripcion-descargar]');
  const btnDictar = stepEl.querySelector('[data-accion="dictar"]');
  const dictadoIndicador = stepEl.querySelector('[data-dictado-indicador]');
  const rte = stepEl.querySelector('[data-texto]');
  const allCaptureBtns = [btnPantalla, btnCamara, btnShot];

  function nombreArchivoPaso() {
    return (paso.media && paso.media.tipo === 'video' && paso.media.src) ? paso.media.src.split('/').pop() : null;
  }

  function actualizarBotonTranscribir() {
    btnTranscribirPaso.disabled = !nombreArchivoPaso();
  }

  const transcriptorPaso = crearTranscriptor({
    btn: btnTranscribirPaso,
    getVideoEl: () => stage.querySelector('video'),
    box: transcripcionBoxPaso,
    estadoEl: transcripcionEstadoPaso,
    listaEl: transcripcionListaPaso,
    descargarBtn: btnDescargarTranscripcionPaso,
    getNombreArchivo: nombreArchivoPaso,
    onUsar: (texto) => {
      rte.innerHTML = rte.innerHTML ? `${rte.innerHTML}<br>${escapeHtml(texto)}` : escapeHtml(texto);
      paso.texto = rte.innerHTML;
      toast('Texto agregado a la descripción del paso');
    }
  });
  actualizarBotonTranscribir();
  transcriptorPaso.revisarExistente();

  crearDictado({
    btn: btnDictar,
    indicador: dictadoIndicador,
    onTexto: (texto) => {
      rte.innerHTML = rte.innerHTML ? `${rte.innerHTML}<br>${escapeHtml(texto)}` : escapeHtml(texto);
      paso.texto = rte.innerHTML;
    }
  });

  function setRecording(on) {
    indicador.classList.toggle('on', on);
    indicador.classList.remove('paused');
    indicadorTexto.textContent = 'Grabando...';
    btnPausar.hidden = !on;
    btnPausar.innerHTML = '<span class="msym" style="font-size:16px">pause_circle</span> Pausar';
    btnDetener.hidden = !on;
    allCaptureBtns.forEach(b => b.disabled = on);
  }

  function setPausado(paused) {
    indicador.classList.toggle('paused', paused);
    indicadorTexto.textContent = paused ? 'Pausado' : 'Grabando...';
    btnPausar.innerHTML = paused
      ? '<span class="msym" style="font-size:16px">play_circle</span> Reanudar'
      : '<span class="msym" style="font-size:16px">pause_circle</span> Pausar';
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
  btnPausar.addEventListener('click', () => {
    if (capture.isPaused) {
      capture.resume();
      setPausado(false);
    } else {
      capture.pause();
      setPausado(true);
    }
  });
  btnDetener.addEventListener('click', async () => {
    const blob = await capture.stop();
    setRecording(false);
    if (!blob || !blob.size) return;
    toast('Subiendo grabación...');
    try {
      const res = await Api.uploadMedia(DOC.id, blob, `paso-${Date.now()}.webm`, (msg) => toast(msg));
      paso.media = { tipo: 'video', src: res.src };
      renderStageMedia(stage, paso);
      actualizarBotonTranscribir();
      toast(mensajeSubida('Grabación guardada en el paso', res));
    } catch (e) { toast(e.message, true); }
  });

  btnShot.addEventListener('click', async () => {
    try {
      btnShot.disabled = true;
      const blob = await grabScreenshot();
      const res = await Api.uploadMedia(DOC.id, blob, `pantallazo-${Date.now()}.png`);
      paso.media = { tipo: 'imagen', src: res.src };
      renderStageMedia(stage, paso);
      actualizarBotonTranscribir();
      toast('Pantallazo agregado');
    } catch (e) {
      toast('No se pudo tomar el pantallazo: ' + e.message, true);
    } finally {
      btnShot.disabled = false;
    }
  });

  async function subirVideoPaso(file) {
    if (!file) return;
    toast('Subiendo video...');
    try {
      const res = await Api.uploadMedia(DOC.id, file, file.name, (msg) => toast(msg));
      paso.media = { tipo: 'video', src: res.src };
      renderStageMedia(stage, paso);
      actualizarBotonTranscribir();
      toast(mensajeSubida('Video agregado al paso', res));
    } catch (e) { toast(e.message, true); }
  }
  async function subirImagenPaso(file) {
    if (!file) return;
    try {
      const res = await Api.uploadMedia(DOC.id, file, file.name);
      paso.media = { tipo: 'imagen', src: res.src };
      renderStageMedia(stage, paso);
      actualizarBotonTranscribir();
      toast('Imagen agregada al paso');
    } catch (e) { toast(e.message, true); }
  }

  inputVideo.addEventListener('change', () => subirVideoPaso(inputVideo.files[0]));
  inputImagen.addEventListener('change', () => subirImagenPaso(inputImagen.files[0]));

  bindDropZone(stage, (file) => {
    if (file.type.startsWith('video/')) subirVideoPaso(file);
    else if (file.type.startsWith('image/')) subirImagenPaso(file);
    else toast('Solo se pueden soltar archivos de video o imagen aqui', true);
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

adminGuard().then(init);
