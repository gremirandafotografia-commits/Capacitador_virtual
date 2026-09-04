const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const { marked } = require('marked');
const { v4: uuidv4 } = require('uuid');

const ROOT = __dirname;
const TRAMITES_DIR = path.join(ROOT, 'tramites');
const MANUALES_DIR = path.join(ROOT, 'manuales');
const DATA_DIR = path.join(ROOT, 'data');
const MANUALES_META_FILE = path.join(DATA_DIR, 'manuales-meta.json');

for (const dir of [TRAMITES_DIR, MANUALES_DIR, DATA_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
if (!fs.existsSync(MANUALES_META_FILE)) {
  fs.writeFileSync(MANUALES_META_FILE, JSON.stringify({}, null, 2));
}

const SLUG_RE = /^[a-z0-9-]+$/;
const CATEGORIAS = [
  'Sistema Open',
  'Salesforce',
  'Qupos',
  'MBA Case',
  'Agentes de Ayuda',
  'General'
];

function slugify(text) {
  return (text || '')
    .toString()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'tramite';
}

function safeSlug(slug) {
  if (typeof slug !== 'string' || !SLUG_RE.test(slug) || slug.length > 80) {
    throw new Error('Identificador invalido');
  }
  return slug;
}

function tramitePath(slug) {
  return path.join(TRAMITES_DIR, safeSlug(slug));
}

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function listTramites() {
  if (!fs.existsSync(TRAMITES_DIR)) return [];
  return fs.readdirSync(TRAMITES_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => {
      const file = path.join(TRAMITES_DIR, d.name, 'tramite.json');
      const doc = readJSON(file, null);
      if (!doc) return null;
      return {
        id: doc.id,
        titulo: doc.titulo,
        categoria: doc.categoria,
        descripcion: doc.descripcion,
        actualizado: doc.actualizado,
        pasos: (doc.pasos || []).length
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b.actualizado || '').localeCompare(a.actualizado || ''));
}

const MANUAL_EXT = new Set(['.md', '.markdown', '.html', '.htm', '.pdf', '.txt']);

function walkManuales(dir, base) {
  let out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.join(base, entry.name);
    if (entry.isDirectory()) {
      out = out.concat(walkManuales(full, rel));
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if (MANUAL_EXT.has(ext)) {
        out.push({ rel: rel.split(path.sep).join('/'), ext, name: entry.name });
      }
    }
  }
  return out;
}

function listManuales() {
  const meta = readJSON(MANUALES_META_FILE, {});
  const files = walkManuales(MANUALES_DIR, '');
  return files.map(f => {
    const m = meta[f.rel] || {};
    return {
      id: f.rel,
      archivo: f.rel,
      tipo: f.ext.replace('.', ''),
      titulo: m.titulo || f.name.replace(/\.[^.]+$/, ''),
      categoria: m.categoria || 'General',
      descripcion: m.descripcion || '',
      tags: m.tags || []
    };
  }).sort((a, b) => a.titulo.localeCompare(b.titulo));
}

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(ROOT, 'public')));
app.use('/tramites', express.static(TRAMITES_DIR));
app.use('/manuales', express.static(MANUALES_DIR));

// ---------- Trámites ----------

app.get('/api/tramites', (req, res) => {
  res.json({ categorias: CATEGORIAS, items: listTramites() });
});

app.get('/api/tramites/:slug', (req, res) => {
  try {
    const file = path.join(tramitePath(req.params.slug), 'tramite.json');
    const doc = readJSON(file, null);
    if (!doc) return res.status(404).json({ error: 'No encontrado' });
    res.json(doc);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/tramites', (req, res) => {
  const { titulo, categoria, descripcion } = req.body || {};
  if (!titulo || !titulo.trim()) return res.status(400).json({ error: 'Titulo requerido' });

  let base = slugify(titulo);
  let slug = base;
  let n = 2;
  while (fs.existsSync(tramitePath(slug))) {
    slug = `${base}-${n++}`;
  }
  const dir = tramitePath(slug);
  fs.mkdirSync(path.join(dir, 'media'), { recursive: true });

  const now = new Date().toISOString();
  const doc = {
    id: slug,
    titulo: titulo.trim(),
    categoria: categoria && CATEGORIAS.includes(categoria) ? categoria : 'General',
    descripcion: descripcion || '',
    creado: now,
    actualizado: now,
    pasos: [],
    vinculos: []
  };
  writeJSON(path.join(dir, 'tramite.json'), doc);
  res.status(201).json(doc);
});

app.put('/api/tramites/:slug', (req, res) => {
  try {
    const dir = tramitePath(req.params.slug);
    const file = path.join(dir, 'tramite.json');
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'No encontrado' });
    const existing = readJSON(file, {});
    const incoming = req.body || {};
    const doc = {
      ...existing,
      ...incoming,
      id: existing.id,
      creado: existing.creado,
      actualizado: new Date().toISOString()
    };
    writeJSON(file, doc);
    res.json(doc);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/tramites/:slug', (req, res) => {
  try {
    const dir = tramitePath(req.params.slug);
    if (!fs.existsSync(dir)) return res.status(404).json({ error: 'No encontrado' });
    fs.rmSync(dir, { recursive: true, force: true });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      try {
        const dir = path.join(tramitePath(req.params.slug), 'media');
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      } catch (e) {
        cb(e);
      }
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || guessExt(file.mimetype);
      cb(null, `${Date.now()}-${uuidv4().slice(0, 8)}${ext}`);
    }
  }),
  limits: { fileSize: 500 * 1024 * 1024 }
});

function guessExt(mime) {
  const map = {
    'video/webm': '.webm',
    'video/mp4': '.mp4',
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'audio/webm': '.webm'
  };
  return map[mime] || '';
}

app.post('/api/tramites/:slug/media', upload.single('archivo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });
  const rel = `/tramites/${req.params.slug}/media/${req.file.filename}`;
  res.status(201).json({ src: rel, nombre: req.file.filename, tipo: req.file.mimetype });
});

// ---------- Manuales ----------

app.get('/api/manuales', (req, res) => {
  res.json({ items: listManuales() });
});

app.get('/api/manuales/contenido', (req, res) => {
  try {
    const rel = req.query.archivo;
    if (typeof rel !== 'string' || rel.includes('..')) throw new Error('Ruta invalida');
    const full = path.join(MANUALES_DIR, rel);
    if (!full.startsWith(MANUALES_DIR) || !fs.existsSync(full)) {
      return res.status(404).json({ error: 'No encontrado' });
    }
    const ext = path.extname(full).toLowerCase();
    if (ext === '.md' || ext === '.markdown') {
      const raw = fs.readFileSync(full, 'utf8');
      return res.json({ tipo: 'html', html: marked.parse(raw) });
    }
    if (ext === '.txt') {
      const raw = fs.readFileSync(full, 'utf8');
      return res.json({ tipo: 'texto', texto: raw });
    }
    return res.json({ tipo: 'archivo', url: `/manuales/${rel}` });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

const manualUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, MANUALES_DIR),
    filename: (req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]+/g, '-');
      cb(null, `${Date.now()}-${safe}`);
    }
  }),
  limits: { fileSize: 200 * 1024 * 1024 }
});

app.post('/api/manuales/upload', manualUpload.single('archivo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });
  const meta = readJSON(MANUALES_META_FILE, {});
  meta[req.file.filename] = {
    titulo: (req.body.titulo || req.file.originalname).trim(),
    categoria: req.body.categoria || 'General',
    descripcion: req.body.descripcion || '',
    tags: (req.body.tags || '').split(',').map(s => s.trim()).filter(Boolean)
  };
  writeJSON(MANUALES_META_FILE, meta);
  res.status(201).json({ id: req.file.filename });
});

app.put('/api/manuales/:id', (req, res) => {
  const id = decodeURIComponent(req.params.id);
  const full = path.join(MANUALES_DIR, id);
  if (!full.startsWith(MANUALES_DIR) || !fs.existsSync(full)) {
    return res.status(404).json({ error: 'No encontrado' });
  }
  const meta = readJSON(MANUALES_META_FILE, {});
  meta[id] = {
    ...(meta[id] || {}),
    titulo: req.body.titulo,
    categoria: req.body.categoria,
    descripcion: req.body.descripcion,
    tags: req.body.tags
  };
  writeJSON(MANUALES_META_FILE, meta);
  res.json({ ok: true });
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(ROOT, 'public', 'index.html'));
});

const PORT = process.env.PORT || 4173;
app.listen(PORT, () => {
  console.log(`CATA disponible en http://localhost:${PORT}`);
});
