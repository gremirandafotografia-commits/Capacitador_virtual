/* Capa de anotaciones reutilizable: se usa en el editor (modo edición)
   y en el visor (modo solo lectura). Las coordenadas se guardan en % (0-100)
   relativas al escenario, para que se vean igual sin importar el tamaño de pantalla. */

const CALLOUT_STYLES = {
  tip: { icon: '💡', label: 'Tip' },
  aviso: { icon: '⚠️', label: 'Aviso' },
  importante: { icon: '❗', label: 'Importante' },
  info: { icon: 'ℹ️', label: 'Info' }
};

function makeAnnoId() {
  return 'a' + Math.random().toString(36).slice(2, 9);
}

class Annotator {
  constructor(stageEl, opts) {
    this.stage = stageEl;
    this.editable = !!(opts && opts.editable);
    this.onChange = (opts && opts.onChange) || (() => {});
    this.items = [];
    this.selectedId = null;
    this.pendingTool = null;

    this.layer = document.createElement('div');
    this.layer.className = 'anno-layer';
    // La capa no intercepta clics por defecto: así el video/imagen de abajo
    // recibe los clics (play, controles) tanto en el editor como en el visor.
    // Solo captura clics mientras hay una herramienta de anotación activa (ver setTool).
    this.layer.style.pointerEvents = 'none';
    this.stage.appendChild(this.layer);

    if (this.editable) {
      this.stage.addEventListener('click', (e) => this._onStageClick(e));
    }
  }

  load(items) {
    this.items = (items || []).map(a => ({ ...a }));
    this.selectedId = null;
    this._render();
  }

  serialize() {
    return this.items.map(a => ({ ...a }));
  }

  setTool(tool) {
    this.pendingTool = tool;
    this.stage.style.cursor = tool ? 'crosshair' : '';
    this.layer.style.pointerEvents = tool ? 'auto' : 'none';
  }

  deleteSelected() {
    if (!this.selectedId) return;
    this.items = this.items.filter(a => a.id !== this.selectedId);
    this.selectedId = null;
    this._render();
    this.onChange();
  }

  updateSelected(patch) {
    const a = this.items.find(x => x.id === this.selectedId);
    if (!a) return;
    Object.assign(a, patch);
    this._render();
    this.onChange();
  }

  getSelected() {
    return this.items.find(x => x.id === this.selectedId) || null;
  }

  onSelectionChange(fn) { this._onSel = fn; }

  _pct(clientX, clientY) {
    const r = this.stage.getBoundingClientRect();
    let x = ((clientX - r.left) / r.width) * 100;
    let y = ((clientY - r.top) / r.height) * 100;
    return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };
  }

  _onStageClick(e) {
    if (!this.pendingTool) return;
    if (e.target.closest('.anno-el')) return;
    const p = this._pct(e.clientX, e.clientY);
    const id = makeAnnoId();
    let item;
    if (this.pendingTool === 'rect') {
      item = { id, tipo: 'rect', x: p.x, y: p.y, w: 18, h: 12, color: '#ff3b30', grosor: 3 };
    } else if (this.pendingTool === 'ellipse') {
      item = { id, tipo: 'ellipse', x: p.x, y: p.y, w: 16, h: 16, color: '#ff3b30', grosor: 3 };
    } else if (this.pendingTool === 'arrow') {
      item = { id, tipo: 'arrow', x1: p.x, y1: p.y, x2: Math.min(96, p.x + 15), y2: Math.min(96, p.y + 8), color: '#ff3b30', grosor: 3 };
    } else if (this.pendingTool === 'texto') {
      item = { id, tipo: 'texto', x: p.x, y: p.y, texto: 'Texto', color: '#ffffff', tamano: 20, negrita: true };
    } else if (this.pendingTool === 'etiqueta') {
      item = { id, tipo: 'etiqueta', x: p.x, y: p.y, w: 22, texto: 'Etiqueta', color: '#0072BC' };
    } else if (this.pendingTool.startsWith('callout:')) {
      const estilo = this.pendingTool.split(':')[1];
      item = { id, tipo: 'callout', x: p.x, y: p.y, w: 26, texto: CALLOUT_STYLES[estilo].label + ': escribe aquí', estilo };
    } else if (this.pendingTool === 'imagen') {
      const src = this._pendingImageSrc;
      if (!src) return;
      item = { id, tipo: 'imagen', x: p.x, y: p.y, w: 14, h: 14, src };
    }
    if (!item) return;
    this.items.push(item);
    this.setTool(null);
    this.selectedId = id;
    this._render();
    this.onChange();
  }

  setPendingImage(src) {
    this._pendingImageSrc = src;
    this.setTool('imagen');
  }

  _select(id) {
    this.selectedId = id;
    this._render();
    if (this._onSel) this._onSel(this.getSelected());
  }

  _render() {
    this.layer.innerHTML = '';
    for (const a of this.items) {
      const el = this._buildEl(a);
      this.layer.appendChild(el);
    }
  }

  _buildEl(a) {
    const wrap = document.createElement('div');
    wrap.className = 'anno-el' + (a.id === this.selectedId ? ' selected' : '');
    wrap.dataset.id = a.id;

    if (a.tipo === 'rect' || a.tipo === 'ellipse') {
      wrap.style.left = a.x + '%';
      wrap.style.top = a.y + '%';
      wrap.style.width = a.w + '%';
      wrap.style.height = a.h + '%';
      const shape = document.createElement('div');
      shape.className = 'anno-shape ' + a.tipo;
      shape.style.width = '100%';
      shape.style.height = '100%';
      shape.style.borderWidth = (a.grosor || 3) + 'px';
      shape.style.borderColor = a.color;
      wrap.appendChild(shape);
      this._addResizeHandle(wrap, a);
    } else if (a.tipo === 'arrow') {
      const minX = Math.min(a.x1, a.x2), minY = Math.min(a.y1, a.y2);
      const w = Math.max(Math.abs(a.x2 - a.x1), 2), h = Math.max(Math.abs(a.y2 - a.y1), 2);
      wrap.style.left = minX + '%';
      wrap.style.top = minY + '%';
      wrap.style.width = w + '%';
      wrap.style.height = h + '%';
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'anno-arrow-svg');
      svg.setAttribute('viewBox', '0 0 100 100');
      svg.setAttribute('preserveAspectRatio', 'none');
      const markerId = 'arrowhead-' + a.id;
      svg.innerHTML = `
        <defs><marker id="${markerId}" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill="${a.color}"/></marker></defs>
        <line x1="${a.x1 === minX ? 0 : 100}" y1="${a.y1 === minY ? 0 : 100}"
              x2="${a.x2 === minX ? 0 : 100}" y2="${a.y2 === minY ? 0 : 100}"
              stroke="${a.color}" stroke-width="${a.grosor || 3}" vector-effect="non-scaling-stroke"
              marker-end="url(#${markerId})"/>`;
      wrap.appendChild(svg);
      if (this.editable) {
        this._addEndpointHandle(wrap, a, 'x1', 'y1');
        this._addEndpointHandle(wrap, a, 'x2', 'y2');
      }
    } else if (a.tipo === 'texto') {
      wrap.style.left = a.x + '%';
      wrap.style.top = a.y + '%';
      const t = document.createElement('div');
      t.className = 'anno-text';
      t.textContent = a.texto;
      t.style.color = a.color;
      t.style.fontSize = (a.tamano || 20) + 'px';
      t.style.fontWeight = a.negrita ? '800' : '500';
      wrap.appendChild(t);
      if (this.editable) this._bindInlineEdit(t, a, 'texto');
    } else if (a.tipo === 'callout') {
      wrap.style.left = a.x + '%';
      wrap.style.top = a.y + '%';
      wrap.style.width = (a.w || 26) + '%';
      const box = document.createElement('div');
      const meta = CALLOUT_STYLES[a.estilo] || CALLOUT_STYLES.info;
      box.className = 'anno-callout ' + a.estilo;
      box.innerHTML = `<span class="icon">${meta.icon}</span><span class="txt"></span>`;
      box.querySelector('.txt').textContent = a.texto;
      wrap.appendChild(box);
      if (this.editable) this._bindInlineEdit(box.querySelector('.txt'), a, 'texto');
      this._addResizeHandle(wrap, a, true);
    } else if (a.tipo === 'etiqueta') {
      wrap.style.left = a.x + '%';
      wrap.style.top = a.y + '%';
      wrap.style.width = (a.w || 22) + '%';
      const chip = document.createElement('div');
      chip.className = 'anno-etiqueta';
      chip.style.background = a.color;
      chip.textContent = a.texto;
      wrap.appendChild(chip);
      if (this.editable) this._bindInlineEdit(chip, a, 'texto');
      this._addResizeHandle(wrap, a, true);
    } else if (a.tipo === 'imagen') {
      wrap.style.left = a.x + '%';
      wrap.style.top = a.y + '%';
      wrap.style.width = a.w + '%';
      wrap.style.height = a.h + '%';
      wrap.classList.add('anno-image');
      const img = document.createElement('img');
      img.src = a.src;
      wrap.appendChild(img);
      this._addResizeHandle(wrap, a);
    }

    if (this.editable) {
      wrap.style.pointerEvents = 'auto';
      wrap.addEventListener('mousedown', (e) => this._startDrag(e, wrap, a));
      wrap.addEventListener('click', (e) => { e.stopPropagation(); this._select(a.id); });
    }
    return wrap;
  }

  _addResizeHandle(wrap, a, widthOnly) {
    if (!this.editable) return;
    const h = document.createElement('div');
    h.className = 'resize-handle';
    wrap.appendChild(h);
    h.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this._select(a.id);
      const stageRect = this.stage.getBoundingClientRect();
      const onMove = (ev) => {
        const p = this._pct(ev.clientX, ev.clientY);
        a.w = Math.max(4, p.x - a.x);
        if (!widthOnly) a.h = Math.max(4, p.y - a.y);
        this._render();
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        this.onChange();
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  _addEndpointHandle(wrap, a, kx, ky) {
    const h = document.createElement('div');
    h.className = 'resize-handle';
    const minX = Math.min(a.x1, a.x2), minY = Math.min(a.y1, a.y2);
    const w = Math.max(Math.abs(a.x2 - a.x1), 2), h2 = Math.max(Math.abs(a.y2 - a.y1), 2);
    h.style.left = ((a[kx] - minX) / w * 100) + '%';
    h.style.top = ((a[ky] - minY) / h2 * 100) + '%';
    h.style.right = 'auto'; h.style.bottom = 'auto';
    h.style.transform = 'translate(-50%,-50%)';
    wrap.appendChild(h);
    h.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this._select(a.id);
      const onMove = (ev) => {
        const p = this._pct(ev.clientX, ev.clientY);
        a[kx] = p.x; a[ky] = p.y;
        this._render();
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        this.onChange();
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  _bindInlineEdit(el, a, field) {
    el.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      el.contentEditable = 'true';
      el.focus();
    });
    el.addEventListener('blur', () => {
      el.contentEditable = 'false';
      a[field] = el.textContent;
      this.onChange();
    });
    el.addEventListener('mousedown', (e) => {
      if (el.isContentEditable) e.stopPropagation();
    });
  }

  _startDrag(e, wrap, a) {
    if (e.target.classList.contains('resize-handle') || e.target.isContentEditable) return;
    e.preventDefault();
    this._select(a.id);
    const stageRect = this.stage.getBoundingClientRect();
    const startX = e.clientX, startY = e.clientY;
    const orig = { ...a };
    const onMove = (ev) => {
      const dxPct = ((ev.clientX - startX) / stageRect.width) * 100;
      const dyPct = ((ev.clientY - startY) / stageRect.height) * 100;
      if (a.tipo === 'arrow') {
        a.x1 = orig.x1 + dxPct; a.y1 = orig.y1 + dyPct;
        a.x2 = orig.x2 + dxPct; a.y2 = orig.y2 + dyPct;
      } else {
        a.x = Math.max(0, Math.min(96, orig.x + dxPct));
        a.y = Math.max(0, Math.min(96, orig.y + dyPct));
      }
      this._render();
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      this.onChange();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }
}

/* Render de solo lectura reutilizable fuera de la clase (para el visor, sin depender de todo el editor) */
function renderAnnotationsReadonly(stageEl, items) {
  const a = new Annotator(stageEl, { editable: false });
  a.load(items);
  return a;
}
