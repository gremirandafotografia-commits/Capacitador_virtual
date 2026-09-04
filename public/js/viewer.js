function qs(name) { return new URLSearchParams(location.search).get(name); }

async function init() {
  const id = qs('id');
  let doc;
  try {
    doc = await Api.getTramite(id);
  } catch (e) {
    document.getElementById('notFound').hidden = false;
    return;
  }

  document.getElementById('app').hidden = false;
  document.title = `${doc.titulo} · CATA`;
  document.getElementById('linkEditar').href = `/editor.html?id=${encodeURIComponent(doc.id)}`;

  const pill = document.getElementById('vCategoria');
  pill.textContent = doc.categoria;
  pill.dataset.cat = doc.categoria;
  document.getElementById('vTitulo').textContent = doc.titulo;
  document.getElementById('vDescripcion').textContent = doc.descripcion || '';

  const tagsBox = document.getElementById('vEtiquetas');
  if (doc.etiquetas && doc.etiquetas.length) {
    tagsBox.innerHTML = doc.etiquetas.map(e =>
      `<span class="tag-pill" style="--tc:${escapeHtml(e.color)}">${escapeHtml(e.texto)}</span>`
    ).join('');
  }

  const cont = document.getElementById('vPasos');
  if (!doc.pasos || !doc.pasos.length) {
    cont.innerHTML = '<div class="empty">Este trámite todavía no tiene pasos.</div>';
  } else {
    let prevSeccion = '';
    doc.pasos.forEach((paso, idx) => {
      const seccion = (paso.seccion || '').trim();
      if (seccion && seccion !== prevSeccion) {
        const head = document.createElement('div');
        head.className = 'seccion-head';
        head.innerHTML = `<span class="msym" style="font-size:16px">folder_open</span> ${escapeHtml(seccion)}`;
        cont.appendChild(head);
      }
      prevSeccion = seccion;

      const stepDiv = document.createElement('div');
      stepDiv.className = 'viewer-step';
      stepDiv.innerHTML = `
        <h3><span class="step-num">${idx + 1}</span> ${escapeHtml(paso.titulo || 'Paso ' + (idx + 1))}</h3>
        <div class="viewer-text" style="margin-bottom:12px">${paso.texto || ''}</div>
      `;
      if (paso.media) {
        const stageWrap = document.createElement('div');
        stageWrap.className = 'stage-wrap';
        const stage = document.createElement('div');
        stage.className = 'stage';
        stageWrap.appendChild(stage);
        stepDiv.appendChild(stageWrap);

        let mediaEl;
        if (paso.media.tipo === 'video') {
          mediaEl = document.createElement('video');
          mediaEl.src = paso.media.src;
          mediaEl.controls = true;
        } else {
          mediaEl = document.createElement('img');
          mediaEl.src = paso.media.src;
        }
        stage.appendChild(mediaEl);
        renderAnnotationsReadonly(stage, paso.anotaciones || []);
      }
      cont.appendChild(stepDiv);
    });
  }

  const rel = document.getElementById('vRelacionados');
  if (doc.vinculos && doc.vinculos.length) {
    const links = doc.vinculos.filter(v => v.destino).map(v => {
      const href = v.tipo === 'tramite'
        ? `/viewer.html?id=${encodeURIComponent(v.destino)}`
        : `/manual.html?id=${encodeURIComponent(v.destino)}`;
      const icon = v.tipo === 'tramite' ? 'description' : 'menu_book';
      return `<a class="related-link" href="${href}"><span class="msym">${icon}</span> ${escapeHtml(v.etiqueta || v.destino)}</a>`;
    }).join('');
    rel.innerHTML = `<h3>Documentos relacionados</h3><div class="viewer-related">${links}</div>`;
  }
}

init();
