function qs(name) { return new URLSearchParams(location.search).get(name); }

let EVAL = null;

async function init() {
  const id = qs('id');
  try {
    EVAL = await Api.getEvaluacion(id);
  } catch (e) {
    document.getElementById('notFound').hidden = false;
    return;
  }

  document.getElementById('app').hidden = false;
  document.title = `${EVAL.titulo} · CATA`;
  const pill = document.getElementById('eTema');
  pill.textContent = EVAL.tema;
  pill.dataset.cat = EVAL.tema;
  document.getElementById('eTitulo').textContent = EVAL.titulo;
  document.getElementById('eDescripcion').textContent = EVAL.descripcion || '';

  const form = document.getElementById('preguntasForm');
  if (!EVAL.preguntas || !EVAL.preguntas.length) {
    form.innerHTML = '<div class="empty">Esta evaluación todavía no tiene preguntas.</div>';
    document.getElementById('btnEnviar').disabled = true;
    return;
  }

  form.innerHTML = EVAL.preguntas.map((p, idx) => `
    <section class="card" data-pregunta="${p.id}">
      <h3 style="margin-top:0"><span class="step-num" style="display:inline-flex;width:22px;height:22px;font-size:11px;vertical-align:middle;margin-right:6px">${idx + 1}</span>${escapeHtml(p.texto)}</h3>
      ${p.tipo === 'abierta'
        ? `<textarea data-respuesta-abierta placeholder="Escribe tu respuesta..." style="min-height:90px"></textarea>`
        : (p.opciones || []).map(o => `
            <label style="display:flex;align-items:center;gap:8px;padding:8px 4px;cursor:pointer">
              <input type="radio" name="p-${p.id}" value="${o.id}" data-respuesta-opcion>
              <span>${escapeHtml(o.texto)}</span>
            </label>
          `).join('')
      }
    </section>
  `).join('');

  document.getElementById('btnEnviar').addEventListener('click', enviar);
}

async function enviar() {
  const nombre = document.getElementById('eNombre').value.trim();
  const apellido = document.getElementById('eApellido').value.trim();
  if (!nombre || !apellido) { toast('Escribe tu nombre y apellido', true); return; }

  const respuestas = EVAL.preguntas.map(p => {
    const box = document.querySelector(`[data-pregunta="${p.id}"]`);
    if (p.tipo === 'abierta') {
      return { preguntaId: p.id, texto: box.querySelector('[data-respuesta-abierta]').value };
    }
    const checked = box.querySelector('[data-respuesta-opcion]:checked');
    return { preguntaId: p.id, opcionId: checked ? checked.value : null };
  });

  const btn = document.getElementById('btnEnviar');
  btn.disabled = true;
  try {
    const intento = await Api.enviarIntento(EVAL.id, { nombre, apellido, respuestas });
    mostrarResultado(intento);
  } catch (e) {
    toast(e.message, true);
    btn.disabled = false;
  }
}

function mostrarResultado(intento) {
  document.getElementById('identidadCard').hidden = true;
  document.getElementById('preguntasForm').hidden = true;
  document.getElementById('btnEnviar').hidden = true;
  const card = document.getElementById('resultadoCard');
  card.hidden = false;

  if (intento.pendienteRevision) {
    document.getElementById('resultadoTitulo').textContent = '¡Evaluación enviada!';
    document.getElementById('resultadoDetalle').textContent =
      `Respondiste correctamente ${intento.puntajeAuto} de ${intento.totalAuto} preguntas de opción múltiple. ` +
      `Las preguntas de respuesta abierta quedan pendientes de revisión por parte de jefatura.`;
  } else {
    document.getElementById('resultadoTitulo').textContent = `Nota final: ${intento.calificacionFinal}/100`;
    document.getElementById('resultadoDetalle').textContent =
      `Respondiste correctamente ${intento.puntajeAuto} de ${intento.totalAuto} preguntas.`;
  }
}

init();
