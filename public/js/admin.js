const NOTA_APROBATORIA = 70;

let EVALUACIONES = [];
let CATEGORIAS_EVAL = [];
let INTENTOS_POR_EVAL = new Map(); // evaluacionId -> items[]
let EMPLEADOS = [];

async function init() {
  const data = await Api.listEvaluaciones();
  EVALUACIONES = data.items || [];
  CATEGORIAS_EVAL = data.categorias || [];

  const empData = await Api.listEmpleados();
  EMPLEADOS = empData.items || [];

  const selNueva = document.getElementById('nTema');
  CATEGORIAS_EVAL.forEach(c => selNueva.appendChild(new Option(c, c)));

  const selFiltro = document.getElementById('filtroEvalResultados');
  EVALUACIONES.forEach(e => selFiltro.appendChild(new Option(`${e.tema} · ${e.titulo}`, e.id)));
  const selFiltroEmp = document.getElementById('filtroEmpleadoResultados');
  EMPLEADOS.forEach(e => selFiltroEmp.appendChild(new Option(`${e.apellido}, ${e.nombre}`, e.id)));

  renderTemasEval();
  renderEvaluaciones();
  renderEmpleados();
  await cargarTodosLosIntentos();
  renderResultados();

  bindTabs();
  bindModalNueva();
  bindResultados();
  bindEmpleados();
  bindInvitar();

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
      document.getElementById('tabEmpleados').hidden = btn.dataset.tab !== 'empleados';
    });
  });
  document.querySelectorAll('#tabResultados .tabs [data-subtab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#tabResultados .tabs [data-subtab]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('subtabEvaluacion').hidden = btn.dataset.subtab !== 'evaluacion';
      document.getElementById('subtabEmpleado').hidden = btn.dataset.subtab !== 'empleado';
      if (btn.dataset.subtab === 'empleado') renderResultadosPorEmpleado();
    });
  });
}

/* ---------- Tab: Evaluaciones ---------- */

let temaActivoEval = '';
let seccionesAbiertasEval = new Set();

function renderTemasEval() {
  const list = document.getElementById('temaListEval');
  const finales = EVALUACIONES.filter(e => e.esFinal);
  const practicas = EVALUACIONES.filter(e => e.esPractica);
  const temas = [...CATEGORIAS_EVAL];
  if (finales.length) temas.push('Final');
  if (practicas.length) temas.push('Prácticas de refuerzo');

  list.innerHTML =
    folderItemHtml('', 'Todas', EVALUACIONES.length, temaActivoEval === '') +
    temas.map(cat => {
      let count;
      if (cat === 'Final') count = finales.length;
      else if (cat === 'Prácticas de refuerzo') count = practicas.length;
      else count = EVALUACIONES.filter(e => !e.esFinal && !e.esPractica && e.tema === cat).length;
      return folderItemHtml(cat, cat, count, temaActivoEval === cat);
    }).join('');

  list.querySelectorAll('.folder-item').forEach(li => {
    li.addEventListener('click', () => {
      temaActivoEval = li.dataset.cat;
      renderTemasEval();
      renderEvaluaciones();
    });
  });
}

function renderEvaluaciones() {
  const grid = document.getElementById('gridEval');
  if (!EVALUACIONES.length) {
    grid.innerHTML = '<div class="empty">Todavía no hay evaluaciones. Creá la primera con "+ Nueva evaluación".</div>';
    return;
  }

  const matches = e => {
    if (!temaActivoEval) return true;
    if (temaActivoEval === 'Final') return e.esFinal;
    if (temaActivoEval === 'Prácticas de refuerzo') return e.esPractica;
    return !e.esFinal && !e.esPractica && e.tema === temaActivoEval;
  };
  const items = EVALUACIONES.filter(matches);

  if (!items.length) {
    grid.innerHTML = '<div class="empty">No hay evaluaciones en este tema.</div>';
    return;
  }

  if (!temaActivoEval) {
    const porTema = CATEGORIAS_EVAL
      .map(c => ({ tema: c, items: EVALUACIONES.filter(e => !e.esFinal && !e.esPractica && e.tema === c) }))
      .filter(s => s.items.length);
    const finales = EVALUACIONES.filter(e => e.esFinal);
    const practicas = EVALUACIONES.filter(e => e.esPractica);
    const secciones = [...porTema];
    if (finales.length) secciones.push({ tema: 'Final', items: finales });
    if (practicas.length) secciones.push({ tema: 'Prácticas de refuerzo', items: practicas });

    grid.innerHTML = secciones.map(sec => {
      const abierta = seccionesAbiertasEval.has(sec.tema);
      const cl = folderColor(sec.tema);
      return `
        <section class="cat-section${abierta ? '' : ' colapsada'}">
          <div class="cat-section-head acordeon-head" data-cat="${escapeHtml(sec.tema)}" style="--ac-c1:${cl.f1};--ac-c2:${cl.back}">
            <span class="ac-icon"><span class="msym">${TEMA_ICONS[sec.tema] || 'folder_open'}</span></span>
            <h2>${escapeHtml(sec.tema)}</h2><span class="count">${sec.items.length}</span>
            <span class="msym cat-section-chevron">expand_more</span>
          </div>
          <div class="grid"${abierta ? '' : ' hidden'}>
            ${sec.items.map(cardEvaluacionHtml).join('')}
          </div>
        </section>
      `;
    }).join('');

    grid.querySelectorAll('.cat-section-head').forEach(head => {
      head.addEventListener('click', () => {
        const cat = head.dataset.cat;
        if (seccionesAbiertasEval.has(cat)) seccionesAbiertasEval.delete(cat);
        else seccionesAbiertasEval.add(cat);
        renderEvaluaciones();
      });
    });
  } else {
    grid.innerHTML = `
      <div class="tema-content-head">
        <h2>${escapeHtml(temaActivoEval)}</h2>
        <span class="count">${items.length} evaluación${items.length === 1 ? '' : 'es'}</span>
      </div>
      <div class="grid">${items.map(cardEvaluacionHtml).join('')}</div>
    `;
  }

  grid.querySelectorAll('[data-del-eval]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ok = await confirmDialog('¿Eliminar esta evaluación y todas sus respuestas registradas? Esta acción no se puede deshacer.', { titulo: 'Eliminar evaluación' });
      if (!ok) return;
      try {
        await Api.deleteEvaluacion(decodeURIComponent(btn.dataset.delEval));
        EVALUACIONES = EVALUACIONES.filter(e => e.id !== decodeURIComponent(btn.dataset.delEval));
        renderTemasEval();
        renderEvaluaciones();
        toast('Evaluación eliminada');
      } catch (e) { toast(e.message, true); }
    });
  });

  grid.querySelectorAll('[data-invitar]').forEach(btn => {
    btn.addEventListener('click', () => abrirInvitar(btn.dataset.invitar));
  });
}

function cardEvaluacionHtml(e) {
  const dueno = e.esPractica ? EMPLEADOS.find(emp => emp.id === e.empleadoId) : null;
  return `
    <div class="card">
      <span class="pill" data-cat="${escapeHtml(e.tema)}">${escapeHtml(e.tema)}</span>
      <h3>${escapeHtml(e.titulo)}</h3>
      <p>${escapeHtml(e.descripcion || 'Sin descripción')}</p>
      ${dueno ? `<p class="helper" style="margin:0">Para: ${escapeHtml(dueno.nombre)} ${escapeHtml(dueno.apellido)}</p>` : ''}
      <div class="meta">
        <span>${e.preguntas} pregunta${e.preguntas === 1 ? '' : 's'}</span>
        <span>·</span>
        <span>${e.intentos} respuesta${e.intentos === 1 ? '' : 's'}</span>
      </div>
      <div class="actions">
        <a class="btn small primary" href="/admin-evaluacion.html?id=${encodeURIComponent(e.id)}"><span class="msym" style="font-size:15px">edit</span> Editar</a>
        <a class="btn small" href="/evaluar.html?id=${encodeURIComponent(e.id)}" target="_blank"><span class="msym" style="font-size:15px">visibility</span> Ver</a>
        <button class="btn small" data-invitar="${e.id}"><span class="msym" style="font-size:15px">mail</span> Invitar</button>
        <button class="btn small danger" data-del-eval="${encodeURIComponent(e.id)}"><span class="msym" style="font-size:15px">delete</span></button>
      </div>
    </div>
  `;
}

function bindModalNueva() {
  const modal = document.getElementById('modalNuevaEval');
  function toggle(show) { modal.hidden = !show; if (show) document.getElementById('nTitulo').focus(); }

  document.getElementById('btnNuevaEval').addEventListener('click', () => toggle(true));
  document.getElementById('nCancelar').addEventListener('click', () => toggle(false));
  document.getElementById('nEsFinal').addEventListener('change', (e) => {
    document.getElementById('nCampoTema').hidden = e.target.checked;
  });

  document.getElementById('nTemaNuevo').addEventListener('click', () => {
    const box = document.getElementById('nTemaNuevoBox');
    box.hidden = !box.hidden;
    if (!box.hidden) document.getElementById('nTemaNuevoInput').focus();
  });
  document.getElementById('nTemaNuevoGuardar').addEventListener('click', async () => {
    const input = document.getElementById('nTemaNuevoInput');
    const nombre = input.value.trim();
    if (!nombre) { toast('Escribe el nombre del tema', true); return; }
    try {
      const data = await Api.crearCategoria(nombre);
      CATEGORIAS_EVAL = data.items;
      const sel = document.getElementById('nTema');
      const opt = new Option(data.nombre, data.nombre, false, true);
      sel.appendChild(opt);
      input.value = '';
      document.getElementById('nTemaNuevoBox').hidden = true;
      renderTemasEval();
      toast(`Tema "${data.nombre}" agregado`);
    } catch (e) { toast(e.message, true); }
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

/* ---------- Tab: Empleados ---------- */

function renderEmpleados() {
  const tbody = document.getElementById('tablaEmpleados');
  if (!EMPLEADOS.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty" style="border:none">Todavía no hay empleados registrados. Agregá el primero con "+ Agregar empleado".</td></tr>';
    return;
  }
  tbody.innerHTML = EMPLEADOS.map(e => `
    <tr>
      <td>${escapeHtml(e.nombre)} ${escapeHtml(e.apellido)}</td>
      <td>${escapeHtml(e.email)}</td>
      <td>${escapeHtml(e.puesto || '—')}</td>
      <td>${e.activo === false ? '<span class="badge badge-pendiente">Inactivo</span>' : '<span class="badge badge-ok">Activo</span>'}</td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn small" data-editar-emp="${e.id}"><span class="msym" style="font-size:14px">edit</span></button>
          <button class="btn small danger" data-eliminar-emp="${e.id}"><span class="msym" style="font-size:14px">delete</span></button>
        </div>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-editar-emp]').forEach(btn => {
    btn.addEventListener('click', () => abrirEmpleadoModal(btn.dataset.editarEmp));
  });
  tbody.querySelectorAll('[data-eliminar-emp]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ok = await confirmDialog('¿Eliminar este empleado? Sus resultados anteriores se conservan, pero ya no va a poder recibir invitaciones.', { titulo: 'Eliminar empleado' });
      if (!ok) return;
      try {
        await Api.eliminarEmpleado(btn.dataset.eliminarEmp);
        EMPLEADOS = EMPLEADOS.filter(e => e.id !== btn.dataset.eliminarEmp);
        renderEmpleados();
        toast('Empleado eliminado');
      } catch (e) { toast(e.message, true); }
    });
  });
}

let editandoEmpleadoId = null;

function bindEmpleados() {
  document.getElementById('btnNuevoEmpleado').addEventListener('click', () => abrirEmpleadoModal(null));
  document.getElementById('empCancelar').addEventListener('click', () => { document.getElementById('modalEmpleado').hidden = true; });
  document.getElementById('empGuardar').addEventListener('click', guardarEmpleado);
}

function abrirEmpleadoModal(id) {
  editandoEmpleadoId = id || null;
  const emp = id ? EMPLEADOS.find(e => e.id === id) : null;
  document.getElementById('empleadoModalTitulo').textContent = emp ? 'Editar empleado' : 'Agregar empleado';
  document.getElementById('empNombre').value = emp ? emp.nombre : '';
  document.getElementById('empApellido').value = emp ? emp.apellido : '';
  document.getElementById('empEmail').value = emp ? emp.email : '';
  document.getElementById('empPuesto').value = emp ? (emp.puesto || '') : '';
  document.getElementById('empActivo').checked = emp ? emp.activo !== false : true;
  document.getElementById('modalEmpleado').hidden = false;
  document.getElementById('empNombre').focus();
}

async function guardarEmpleado() {
  const data = {
    nombre: document.getElementById('empNombre').value.trim(),
    apellido: document.getElementById('empApellido').value.trim(),
    email: document.getElementById('empEmail').value.trim(),
    puesto: document.getElementById('empPuesto').value.trim(),
    activo: document.getElementById('empActivo').checked
  };
  if (!data.nombre || !data.apellido) { toast('Nombre y apellido son obligatorios', true); return; }
  if (!data.email) { toast('El email es obligatorio', true); return; }
  try {
    if (editandoEmpleadoId) {
      const actualizado = await Api.guardarEmpleado(editandoEmpleadoId, data);
      const idx = EMPLEADOS.findIndex(e => e.id === editandoEmpleadoId);
      if (idx >= 0) EMPLEADOS[idx] = actualizado;
      toast('Empleado actualizado');
    } else {
      const creado = await Api.crearEmpleado(data);
      EMPLEADOS.push(creado);
      document.getElementById('filtroEmpleadoResultados').appendChild(new Option(`${creado.apellido}, ${creado.nombre}`, creado.id));
      toast('Empleado agregado');
    }
    document.getElementById('modalEmpleado').hidden = true;
    renderEmpleados();
  } catch (e) { toast(e.message, true); }
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
  document.getElementById('filtroEmpleadoResultados').addEventListener('change', renderResultados);
  document.getElementById('filtroFechaDesde').addEventListener('change', renderResultados);
  document.getElementById('filtroFechaHasta').addEventListener('change', renderResultados);
  document.getElementById('btnExportarCsv').addEventListener('click', exportarCsv);
  document.getElementById('btnExportarPdf').addEventListener('click', exportarPdf);
  document.getElementById('revisarCancelar').addEventListener('click', () => { document.getElementById('modalRevisar').hidden = true; });
}

function filasVisibles() {
  const filtroId = document.getElementById('filtroEvalResultados').value;
  const filtroEmp = document.getElementById('filtroEmpleadoResultados').value;
  const desde = document.getElementById('filtroFechaDesde').value;
  const hasta = document.getElementById('filtroFechaHasta').value;
  const evals = filtroId ? EVALUACIONES.filter(e => e.id === filtroId) : EVALUACIONES;
  const filas = [];
  for (const ev of evals) {
    const intentos = INTENTOS_POR_EVAL.get(ev.id) || [];
    for (const it of intentos) {
      if (filtroEmp && it.empleadoId !== filtroEmp) continue;
      if (desde && it.fecha < desde) continue;
      if (hasta && it.fecha > `${hasta}T23:59:59`) continue;
      filas.push({ ev, it });
    }
  }
  return filas;
}

function renderResultados() {
  const box = document.getElementById('resultadosBox');
  const filas = filasVisibles();
  if (!filas.length) {
    box.innerHTML = '<div class="empty">No hay respuestas registradas que coincidan con los filtros.</div>';
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

/* ---------- Resultados por empleado + práctica de refuerzo ---------- */

// Espeja progresoEmpleado()/resumenPorTema() de server.js, pero a partir
// de los datos ya cargados en memoria (evita pedir el progreso persona
// por persona al servidor). Un tema solo cuenta como aprobado cuando
// TODAS sus evaluaciones lo estan -son tramites distintos, no versiones
// alternativas de la misma pregunta.
function progresoDeEmpleado(empleadoId) {
  return EVALUACIONES.filter(ev => !ev.esFinal && !ev.esPractica).map(ev => {
    const intentos = (INTENTOS_POR_EVAL.get(ev.id) || []).filter(it => it.empleadoId === empleadoId);
    let aprobada = false, mejorNota = null, ultimaFecha = null;
    intentos.forEach(it => {
      if (it.calificacionFinal !== null && it.calificacionFinal !== undefined) {
        if (mejorNota === null || it.calificacionFinal > mejorNota) mejorNota = it.calificacionFinal;
        if (it.calificacionFinal >= NOTA_APROBATORIA) aprobada = true;
      }
      if (!ultimaFecha || it.fecha > ultimaFecha) ultimaFecha = it.fecha;
    });
    return { evaluacionId: ev.id, titulo: ev.titulo, tema: ev.tema, aprobada, mejorNota, ultimaFecha };
  });
}

function resumenPorTemaCliente(evaluacionesEmpleado) {
  const porTema = new Map();
  evaluacionesEmpleado.forEach(e => {
    if (!porTema.has(e.tema)) porTema.set(e.tema, { tema: e.tema, total: 0, aprobadas: 0 });
    const t = porTema.get(e.tema);
    t.total++;
    if (e.aprobada) t.aprobadas++;
  });
  return Array.from(porTema.values());
}

function renderResultadosPorEmpleado() {
  const box = document.getElementById('resumenEmpleadosBox');
  if (!EMPLEADOS.length) {
    box.innerHTML = '<div class="empty" style="grid-column:1/-1">Todavía no hay empleados registrados. Agregalos en la pestaña "Empleados".</div>';
    return;
  }
  box.innerHTML = EMPLEADOS.map(empleadoResumenHtml).join('');
  box.querySelectorAll('[data-generar-practica]').forEach(btn => {
    btn.addEventListener('click', () => generarPractica(btn.dataset.generarPractica));
  });
}

function empleadoResumenHtml(emp) {
  const evals = progresoDeEmpleado(emp.id);
  const temas = resumenPorTemaCliente(evals).filter(t => t.total > 0);
  const temasAprobados = temas.filter(t => t.aprobadas === t.total);
  const temasPendientes = temas.filter(t => t.aprobadas < t.total);
  const evalsPendientes = evals.filter(e => !e.aprobada);
  const notas = evals.map(e => e.mejorNota).filter(n => n !== null && n !== undefined);
  const promedio = notas.length ? Math.round(notas.reduce((a, b) => a + b, 0) / notas.length) : null;
  const fechas = evals.map(e => e.ultimaFecha).filter(Boolean).sort();
  const ultima = fechas.length ? fechas[fechas.length - 1] : null;

  return `
    <div class="card">
      <h3 style="margin:0 0 2px">${escapeHtml(emp.nombre)} ${escapeHtml(emp.apellido)}</h3>
      <p style="margin:0 0 8px;color:var(--text-dim);font-size:12.5px">${escapeHtml(emp.email)}</p>
      <div class="tag-row">
        ${temasAprobados.map(t => `<span class="tag-pill" style="--tc:#6C9E2C">${escapeHtml(t.tema)}</span>`).join('')}
        ${temasPendientes.map(t => `<span class="tag-pill" style="--tc:#D9534F">${escapeHtml(t.tema)} (${t.aprobadas}/${t.total})</span>`).join('')}
        ${!temas.length ? '<span class="helper">Sin evaluaciones disponibles todavía</span>' : ''}
      </div>
      <div class="meta" style="margin-top:8px">
        <span>Promedio: ${promedio === null ? '—' : promedio + '/100'}</span>
        <span>·</span>
        <span>Última actividad: ${ultima ? fmtDate(ultima) : 'Sin actividad'}</span>
      </div>
      <div class="actions" style="margin-top:10px">
        <button class="btn small primary" data-generar-practica="${emp.id}" ${evalsPendientes.length ? '' : 'disabled'}>
          <span class="msym" style="font-size:15px">fitness_center</span> Generar práctica${evalsPendientes.length ? ` (${evalsPendientes.length} pendiente${evalsPendientes.length === 1 ? '' : 's'})` : ''}
        </button>
      </div>
    </div>
  `;
}

async function generarPractica(empleadoId) {
  try {
    const doc = await Api.generarPractica(empleadoId);
    EVALUACIONES.push({
      id: doc.id, titulo: doc.titulo, tema: doc.tema, esFinal: false, esPractica: true,
      empleadoId: doc.empleadoId, tramiteId: '', descripcion: doc.descripcion,
      actualizado: doc.actualizado, preguntas: doc.preguntas.length, intentos: 0
    });
    INTENTOS_POR_EVAL.set(doc.id, []);
    renderTemasEval();
    renderEvaluaciones();
    toast('Práctica de refuerzo creada. Enviala desde la lista de Evaluaciones (sección "Prácticas de refuerzo").');
  } catch (e) { toast(e.message, true); }
}

/* ---------- Invitaciones por correo ---------- */

let invitarEvalId = null;

function bindInvitar() {
  document.getElementById('invitarCancelar').addEventListener('click', () => { document.getElementById('modalInvitar').hidden = true; });
  document.getElementById('invitarEnviar').addEventListener('click', enviarInvitaciones);
}

function abrirInvitar(evalId) {
  const ev = EVALUACIONES.find(e => e.id === evalId);
  if (!ev) return;
  invitarEvalId = evalId;
  document.getElementById('invitarEvalTitulo').textContent = ev.titulo;

  const conEmail = EMPLEADOS.filter(e => e.email && e.activo !== false);
  document.getElementById('invitarVacio').hidden = conEmail.length > 0;

  const yaCompletaron = new Set(
    (INTENTOS_POR_EVAL.get(evalId) || [])
      .filter(it => it.calificacionFinal !== null)
      .map(it => it.empleadoId)
  );

  document.getElementById('invitarLista').innerHTML = conEmail.map(emp => {
    const marcado = ev.esPractica ? emp.id === ev.empleadoId : !yaCompletaron.has(emp.id);
    return `
      <label style="display:flex;align-items:center;gap:8px">
        <input type="checkbox" value="${emp.id}" ${marcado ? 'checked' : ''}>
        <span>${escapeHtml(emp.nombre)} ${escapeHtml(emp.apellido)}</span>
        <span style="margin-left:auto;color:var(--text-dim);font-size:12px">${escapeHtml(emp.email)}</span>
      </label>
    `;
  }).join('');

  document.getElementById('modalInvitar').hidden = false;
}

async function enviarInvitaciones() {
  const ids = Array.from(document.querySelectorAll('#invitarLista input:checked')).map(i => i.value);
  if (!ids.length) { toast('Selecciona al menos un empleado', true); return; }
  const btn = document.getElementById('invitarEnviar');
  btn.disabled = true;
  try {
    const r = await Api.enviarInvitaciones(invitarEvalId, ids);
    toast(`Invitaciones enviadas: ${r.enviados}/${r.total}${r.fallidos ? ` (${r.fallidos} fallaron)` : ''}`);
    document.getElementById('modalInvitar').hidden = true;
  } catch (e) {
    toast(e.message, true);
  } finally {
    btn.disabled = false;
  }
}

/* ---------- Revisión de respuestas abiertas ---------- */

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

async function exportarPdf() {
  const filas = filasVisibles();
  if (!filas.length) { toast('No hay resultados para exportar', true); return; }
  const filasPdf = filas.map(({ ev, it }) => ({
    tema: ev.tema,
    evaluacion: ev.titulo,
    empleado: `${it.apellido}, ${it.nombre}`,
    fecha: (it.fecha || '').slice(0, 10),
    nota: it.calificacionFinal === null ? `${it.puntajeAuto}/${it.totalAuto} parcial` : `${it.calificacionFinal}/100`,
    estado: it.pendienteRevision ? 'Pendiente de revisión' : 'Revisado'
  }));
  try {
    const blob = await Api.exportarResultadosPdf(filasPdf);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `evaluaciones-resultados-${new Date().toISOString().slice(0, 10)}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    toast(e.message, true);
  }
}

adminGuard().then(init);
