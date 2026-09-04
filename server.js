const path = require('path');
const fs = require('fs');
const { execFile, execFileSync } = require('child_process');
const express = require('express');
const multer = require('multer');
const { marked } = require('marked');
const { v4: uuidv4 } = require('uuid');

let FFMPEG_AVAILABLE = false;
try {
  execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  FFMPEG_AVAILABLE = true;
  console.log('ffmpeg disponible: los videos subidos se comprimen automaticamente');
} catch (e) {
  console.log('ffmpeg no esta instalado: los videos se guardan sin comprimir');
}

function compressVideo(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const args = [
      '-y', '-i', inputPath,
      '-vf', "scale='min(1920,iw)':-2",
      '-r', '20',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28',
      '-c:a', 'aac', '-b:a', '96k',
      '-movflags', '+faststart',
      outputPath
    ];
    execFile('ffmpeg', args, { maxBuffer: 1024 * 1024 * 20, timeout: 20 * 60 * 1000 }, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

const ROOT = __dirname;
const TRAMITES_DIR = path.join(ROOT, 'tramites');
const MANUALES_DIR = path.join(ROOT, 'manuales');
const DATA_DIR = path.join(ROOT, 'data');
const EVALUACIONES_DIR = path.join(ROOT, 'evaluaciones');
const MANUALES_META_FILE = path.join(DATA_DIR, 'manuales-meta.json');

for (const dir of [TRAMITES_DIR, MANUALES_DIR, DATA_DIR, EVALUACIONES_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
if (!fs.existsSync(MANUALES_META_FILE)) {
  fs.writeFileSync(MANUALES_META_FILE, JSON.stringify({}, null, 2));
}

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'coopelesca2026';
const adminTokens = new Set();

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token || !adminTokens.has(token)) {
    return res.status(401).json({ error: 'Sesion de administracion invalida o expirada' });
  }
  next();
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
        pasos: (doc.pasos || []).length,
        etiquetas: doc.etiquetas || []
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
// Detras de un proxy (Codespaces, nginx, etc.) req.ip solo refleja al
// cliente real si confiamos en el X-Forwarded-For que agrega el proxy;
// si no, todo el trafico se ve como si viniera de una sola IP.
app.set('trust proxy', true);
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

app.post('/api/tramites', requireAdmin, (req, res) => {
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
    vinculos: [],
    etiquetas: []
  };
  writeJSON(path.join(dir, 'tramite.json'), doc);
  res.status(201).json(doc);
});

app.put('/api/tramites/:slug', requireAdmin, (req, res) => {
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

app.delete('/api/tramites/:slug', requireAdmin, (req, res) => {
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
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }
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

// Estado de compresion en segundo plano por nombre de archivo subido. La
// compresion de un video de varios minutos puede tardar mas de lo que
// aguanta cualquier proxy/tunel intermedio (Codespaces, nginx, etc.) sin
// datos fluyendo; si se hace de forma sincrona dentro del POST, esas
// conexiones se cortan antes de que el servidor responda y el navegador ve
// un error generico de "no se pudo subir" aunque el archivo si se guardo.
// Por eso el POST responde apenas el archivo esta en disco, y la
// compresion (si aplica) corre aparte; el cliente consulta este mapa.
const compressionJobs = new Map();

function comprimirEnSegundoPlano(slug, filename, filePath, tamanoOriginal) {
  const dir = path.dirname(filePath);
  const outName = path.basename(filename, path.extname(filename)) + '-comp.mp4';
  const outPath = path.join(dir, outName);
  compressVideo(filePath, outPath)
    .then(() => {
      const outSize = fs.statSync(outPath).size;
      if (outSize > 0 && outSize < tamanoOriginal) {
        fs.unlinkSync(filePath);
        compressionJobs.set(filename, {
          done: true,
          comprimido: true,
          src: `/tramites/${slug}/media/${outName}`,
          nombre: outName,
          tipo: 'video/mp4',
          tamanoFinal: outSize
        });
      } else {
        fs.unlinkSync(outPath);
        compressionJobs.set(filename, { done: true, comprimido: false });
      }
    })
    .catch((e) => {
      console.warn('No se pudo comprimir el video, se guarda el original:', e.message);
      try { fs.unlinkSync(outPath); } catch (_) { /* no se llego a crear */ }
      compressionJobs.set(filename, { done: true, comprimido: false });
    });
}

app.post('/api/tramites/:slug/media', requireAdmin, upload.single('archivo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });

  const filename = req.file.filename;
  const tipo = req.file.mimetype;
  const tamanoOriginal = req.file.size;
  const comprimiendo = FFMPEG_AVAILABLE && tipo.startsWith('video/');

  if (comprimiendo) {
    compressionJobs.set(filename, { done: false });
    comprimirEnSegundoPlano(req.params.slug, filename, req.file.path, tamanoOriginal);
  }

  const rel = `/tramites/${req.params.slug}/media/${filename}`;
  res.status(201).json({
    src: rel,
    nombre: filename,
    tipo,
    comprimido: false,
    tamanoOriginal,
    tamanoFinal: tamanoOriginal,
    comprimiendo
  });
});

app.get('/api/tramites/:slug/media/:nombre/estado', (req, res) => {
  const job = compressionJobs.get(req.params.nombre);
  if (!job) return res.json({ done: true, comprimido: false });
  if (job.done) compressionJobs.delete(req.params.nombre);
  res.json(job);
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

app.post('/api/manuales/upload', requireAdmin, manualUpload.single('archivo'), (req, res) => {
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

app.put('/api/manuales/:id', requireAdmin, (req, res) => {
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

// ---------- Administracion ----------

// Limite simple de intentos de login por IP: sin esto, con el servidor
// expuesto publicamente cualquiera podria probar contrasenas sin freno.
const LOGIN_MAX_INTENTOS = 8;
const LOGIN_VENTANA_MS = 10 * 60 * 1000;
const loginIntentos = new Map(); // ip -> { count, desde }

app.post('/api/admin/login', (req, res) => {
  const ip = req.ip;
  const ahora = Date.now();
  const estado = loginIntentos.get(ip);
  if (estado && ahora - estado.desde < LOGIN_VENTANA_MS && estado.count >= LOGIN_MAX_INTENTOS) {
    return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos e intenta de nuevo.' });
  }

  const { password } = req.body || {};
  if (password !== ADMIN_PASSWORD) {
    if (!estado || ahora - estado.desde >= LOGIN_VENTANA_MS) {
      loginIntentos.set(ip, { count: 1, desde: ahora });
    } else {
      estado.count++;
    }
    return res.status(401).json({ error: 'Contrasena incorrecta' });
  }
  loginIntentos.delete(ip);
  const token = uuidv4();
  adminTokens.add(token);
  res.json({ token });
});

// ---------- Evaluaciones ----------

function evalPath(slug) {
  return path.join(EVALUACIONES_DIR, safeSlug(slug));
}

function evalIntentosDir(slug) {
  return path.join(evalPath(slug), 'intentos');
}

function listEvaluaciones() {
  if (!fs.existsSync(EVALUACIONES_DIR)) return [];
  return fs.readdirSync(EVALUACIONES_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => {
      const file = path.join(EVALUACIONES_DIR, d.name, 'evaluacion.json');
      const doc = readJSON(file, null);
      if (!doc) return null;
      const intentosDir = path.join(EVALUACIONES_DIR, d.name, 'intentos');
      const intentos = fs.existsSync(intentosDir)
        ? fs.readdirSync(intentosDir).filter(f => f.endsWith('.json')).length
        : 0;
      return {
        id: doc.id,
        titulo: doc.titulo,
        tema: doc.tema,
        esFinal: !!doc.esFinal,
        tramiteId: doc.tramiteId || '',
        descripcion: doc.descripcion || '',
        actualizado: doc.actualizado,
        preguntas: (doc.preguntas || []).length,
        intentos
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b.actualizado || '').localeCompare(a.actualizado || ''));
}

app.get('/api/evaluaciones', (req, res) => {
  res.json({ categorias: CATEGORIAS, items: listEvaluaciones() });
});

app.get('/api/evaluaciones/:slug', (req, res) => {
  try {
    const file = path.join(evalPath(req.params.slug), 'evaluacion.json');
    const doc = readJSON(file, null);
    if (!doc) return res.status(404).json({ error: 'No encontrada' });
    res.json(doc);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/evaluaciones', requireAdmin, (req, res) => {
  const { titulo, tema, esFinal, tramiteId, descripcion } = req.body || {};
  if (!titulo || !titulo.trim()) return res.status(400).json({ error: 'Titulo requerido' });

  let base = slugify(titulo);
  let slug = base;
  let n = 2;
  while (fs.existsSync(evalPath(slug))) {
    slug = `${base}-${n++}`;
  }
  const dir = evalPath(slug);
  fs.mkdirSync(path.join(dir, 'intentos'), { recursive: true });

  const now = new Date().toISOString();
  const doc = {
    id: slug,
    titulo: titulo.trim(),
    tema: esFinal ? 'Final' : (tema && CATEGORIAS.includes(tema) ? tema : 'General'),
    esFinal: !!esFinal,
    tramiteId: tramiteId || '',
    descripcion: descripcion || '',
    creado: now,
    actualizado: now,
    preguntas: []
  };
  writeJSON(path.join(dir, 'evaluacion.json'), doc);
  res.status(201).json(doc);
});

app.put('/api/evaluaciones/:slug', requireAdmin, (req, res) => {
  try {
    const dir = evalPath(req.params.slug);
    const file = path.join(dir, 'evaluacion.json');
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'No encontrada' });
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

app.delete('/api/evaluaciones/:slug', requireAdmin, (req, res) => {
  try {
    const dir = evalPath(req.params.slug);
    if (!fs.existsSync(dir)) return res.status(404).json({ error: 'No encontrada' });
    fs.rmSync(dir, { recursive: true, force: true });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/evaluaciones/:slug/intentos', (req, res) => {
  try {
    const dir = evalPath(req.params.slug);
    const file = path.join(dir, 'evaluacion.json');
    const doc = readJSON(file, null);
    if (!doc) return res.status(404).json({ error: 'No encontrada' });

    const { nombre, apellido, respuestas } = req.body || {};
    if (!nombre || !nombre.trim() || !apellido || !apellido.trim()) {
      return res.status(400).json({ error: 'Nombre y apellido requeridos' });
    }
    const respuestasPorPregunta = new Map((respuestas || []).map(r => [r.preguntaId, r]));

    let totalAuto = 0, puntajeAuto = 0, pendienteRevision = false;
    const respuestasFinal = (doc.preguntas || []).map(p => {
      const r = respuestasPorPregunta.get(p.id) || {};
      if (p.tipo === 'abierta') {
        pendienteRevision = true;
        return { preguntaId: p.id, tipo: 'abierta', texto: (r.texto || '').trim(), correcta: null, retro: '' };
      }
      totalAuto++;
      const opcionCorrecta = (p.opciones || []).find(o => o.correcta);
      const correcta = !!opcionCorrecta && r.opcionId === opcionCorrecta.id;
      if (correcta) puntajeAuto++;
      return { preguntaId: p.id, tipo: p.tipo, opcionId: r.opcionId || null, correcta };
    });

    const totalPreguntas = (doc.preguntas || []).length || 1;
    const intento = {
      id: uuidv4().slice(0, 8),
      evaluacionId: doc.id,
      nombre: nombre.trim(),
      apellido: apellido.trim(),
      fecha: new Date().toISOString(),
      respuestas: respuestasFinal,
      puntajeAuto,
      totalAuto,
      pendienteRevision,
      revisado: !pendienteRevision,
      calificacionFinal: pendienteRevision ? null : Math.round((puntajeAuto / totalPreguntas) * 100)
    };
    fs.mkdirSync(path.join(dir, 'intentos'), { recursive: true });
    writeJSON(path.join(dir, 'intentos', `${intento.id}.json`), intento);
    res.status(201).json(intento);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/evaluaciones/:slug/intentos', requireAdmin, (req, res) => {
  try {
    const dir = evalIntentosDir(req.params.slug);
    if (!fs.existsSync(dir)) return res.json({ items: [] });
    const items = fs.readdirSync(dir)
      .filter(f => f.endsWith('.json'))
      .map(f => readJSON(path.join(dir, f), null))
      .filter(Boolean)
      .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    res.json({ items });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put('/api/evaluaciones/:slug/intentos/:intentoId', requireAdmin, (req, res) => {
  try {
    const dir = evalIntentosDir(req.params.slug);
    const file = path.join(dir, `${req.params.intentoId}.json`);
    const intento = readJSON(file, null);
    if (!intento) return res.status(404).json({ error: 'No encontrado' });

    const evalDoc = readJSON(path.join(evalPath(req.params.slug), 'evaluacion.json'), null);
    const calificaciones = new Map((req.body.calificaciones || []).map(c => [c.preguntaId, c]));

    intento.respuestas = intento.respuestas.map(r => {
      if (r.tipo !== 'abierta') return r;
      const c = calificaciones.get(r.preguntaId);
      if (!c) return r;
      return { ...r, correcta: !!c.correcta, retro: c.retro || '' };
    });

    const totalPreguntas = (evalDoc && evalDoc.preguntas ? evalDoc.preguntas.length : intento.respuestas.length) || 1;
    const correctasTotales = intento.respuestas.filter(r => r.correcta === true).length;
    intento.pendienteRevision = intento.respuestas.some(r => r.tipo === 'abierta' && r.correcta === null);
    intento.revisado = !intento.pendienteRevision;
    intento.calificacionFinal = intento.pendienteRevision ? null : Math.round((correctasTotales / totalPreguntas) * 100);

    writeJSON(file, intento);
    res.json(intento);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(ROOT, 'public', 'index.html'));
});

// Manejo de errores de subida de archivos (multer): sin esto, un archivo
// demasiado grande o una conexion cortada terminan en una pagina de error
// HTML generica en vez de un mensaje claro para quien esta usando la app.
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'El archivo supera el tamano maximo permitido para subir.' });
    }
    return res.status(400).json({ error: 'No se pudo subir el archivo: ' + err.message });
  }
  if (err && err.message === 'Request aborted') {
    if (!res.headersSent) res.status(400).json({ error: 'Se interrumpio la subida del archivo. Intenta de nuevo.' });
    return;
  }
  console.error(err);
  if (!res.headersSent) res.status(500).json({ error: 'Error interno del servidor' });
});

const PORT = process.env.PORT || 4173;
app.listen(PORT, () => {
  console.log(`CATA disponible en http://localhost:${PORT}`);
});
