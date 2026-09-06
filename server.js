const path = require('path');
const fs = require('fs');
const { execFile, execFileSync } = require('child_process');
const express = require('express');
const multer = require('multer');
const { marked } = require('marked');
const { v4: uuidv4 } = require('uuid');
const { nodewhisper } = require('nodejs-whisper');
const nodemailer = require('nodemailer');
const Anthropic = require('@anthropic-ai/sdk');
const PDFDocument = require('pdfkit');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const anthropicClient = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;
if (!ANTHROPIC_API_KEY) {
  console.log('ANTHROPIC_API_KEY no definida: el generador asistido de preguntas con IA no esta disponible');
}

let FFMPEG_AVAILABLE = false;
try {
  execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  FFMPEG_AVAILABLE = true;
  console.log('ffmpeg disponible: los videos subidos se comprimen automaticamente');
} catch (e) {
  console.log('ffmpeg no esta instalado: los videos se guardan sin comprimir');
}

// whisper.cpp (via nodejs-whisper) transcribe el audio de un video a
// texto con marcas de tiempo. Se prepara con `npm install` (ver
// scripts/setup-whisper.sh); si nunca se compilo/descargo el modelo en
// este entorno, la transcripcion simplemente no se ofrece.
const WHISPER_MODEL = process.env.WHISPER_MODEL || 'base';
const WHISPER_CLI_PATH = path.join(__dirname, 'node_modules', 'nodejs-whisper', 'cpp', 'whisper.cpp', 'build', 'bin', 'whisper-cli');
const WHISPER_AVAILABLE = fs.existsSync(WHISPER_CLI_PATH);
console.log(WHISPER_AVAILABLE
  ? `whisper disponible (modelo "${WHISPER_MODEL}"): se puede transcribir el audio de los videos`
  : 'whisper no esta preparado: la transcripcion de audio no esta disponible');

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
// En un host con disco persistente separado del codigo (Render, etc.) hay
// que apuntar los datos ahi -si no, cada deploy nuevo borra todos los
// tramites/videos/manuales subidos, porque el codigo se reemplaza pero el
// disco de la instancia anterior no viaja con el.
const DATA_ROOT = process.env.DATA_ROOT || ROOT;
const TRAMITES_DIR = path.join(DATA_ROOT, 'tramites');
const MANUALES_DIR = path.join(DATA_ROOT, 'manuales');
const DATA_DIR = path.join(DATA_ROOT, 'data');
const EVALUACIONES_DIR = path.join(DATA_ROOT, 'evaluaciones');
const MANUALES_META_FILE = path.join(DATA_DIR, 'manuales-meta.json');
const EMPLEADOS_FILE = path.join(DATA_DIR, 'empleados.json');
// Nota final minima para considerar un tema "aprobado" por un empleado -
// por debajo de esto (o sin ningun intento calificado) el tema cuenta
// como pendiente para efectos de invitaciones y practicas de refuerzo.
const NOTA_APROBATORIA = 70;

// Primera vez que arranca contra un DATA_ROOT vacio (disco persistente
// recien creado): siembra con el contenido ya versionado en el repo
// (tramites y manuales de ejemplo) para no arrancar en blanco. Despues de
// esto el disco manda solo -nunca se vuelve a copiar, para no pisar
// contenido nuevo agregado desde la app.
function seedSiVacio(dirName) {
  if (DATA_ROOT === ROOT) return;
  const origen = path.join(ROOT, dirName);
  const destino = path.join(DATA_ROOT, dirName);
  if (!fs.existsSync(origen)) return;
  if (fs.existsSync(destino) && fs.readdirSync(destino).length > 0) return;
  fs.cpSync(origen, destino, { recursive: true });
  console.log(`Semilla inicial de "${dirName}" copiada a ${destino}`);
}
for (const dirName of ['tramites', 'manuales', 'data', 'evaluaciones']) {
  seedSiVacio(dirName);
}

for (const dir of [TRAMITES_DIR, MANUALES_DIR, DATA_DIR, EVALUACIONES_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
if (!fs.existsSync(MANUALES_META_FILE)) {
  fs.writeFileSync(MANUALES_META_FILE, JSON.stringify({}, null, 2));
}
if (!fs.existsSync(EMPLEADOS_FILE)) {
  fs.writeFileSync(EMPLEADOS_FILE, JSON.stringify([], null, 2));
}

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'coopelesca2026';
if (!process.env.ADMIN_PASSWORD) {
  console.warn('\n*** ALERTA DE SEGURIDAD ***');
  console.warn('La variable de entorno ADMIN_PASSWORD no esta configurada.');
  console.warn('Se esta usando la contrasena por defecto del codigo fuente, que es publica en el repositorio.');
  console.warn('Configura ADMIN_PASSWORD con una contrasena propia antes de usar esto en produccion.\n');
}
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
// Lista de temas/sistemas (Sistema Open, Salesforce, etc.) usada para
// clasificar tramites, manuales y evaluaciones por igual. Se persiste en
// disco para poder agregar temas nuevos a futuro (vía el panel de
// Administración) sin tener que tocar el codigo ni redesplegar.
const CATEGORIAS_FILE = path.join(DATA_DIR, 'categorias.json');
const CATEGORIAS_DEFAULT = [
  'Sistema Open',
  'Salesforce',
  'Qupos',
  'MBA Case',
  'Agentes de Ayuda',
  'General'
];
let CATEGORIAS;

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

CATEGORIAS = readJSON(CATEGORIAS_FILE, null) || CATEGORIAS_DEFAULT.slice();
if (!fs.existsSync(CATEGORIAS_FILE)) writeJSON(CATEGORIAS_FILE, CATEGORIAS);

function agregarCategoria(nombre) {
  const limpio = (nombre || '').trim();
  if (!limpio) throw new Error('El nombre del tema es requerido');
  if (limpio.length > 40) throw new Error('El nombre del tema es demasiado largo');
  if (CATEGORIAS.some(c => c.toLowerCase() === limpio.toLowerCase())) {
    throw new Error('Ya existe un tema con ese nombre');
  }
  CATEGORIAS.push(limpio);
  writeJSON(CATEGORIAS_FILE, CATEGORIAS);
  return limpio;
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function listEmpleados() {
  return readJSON(EMPLEADOS_FILE, []);
}

function saveEmpleados(list) {
  writeJSON(EMPLEADOS_FILE, list);
}

function escapeHtmlMail(s) {
  return (s || '').toString().replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Recorre todas las evaluaciones (sin incluir finales ni practicas) y
// calcula, para un empleado puntual, si aprobo cada una por separado -un
// tema como "Sistema Open" agrupa muchas evaluaciones distintas (una por
// tramite), asi que aprobar una sola no alcanza para dar por dominado
// todo el tema.
function progresoEmpleado(empleadoId) {
  const evaluaciones = [];
  if (!fs.existsSync(EVALUACIONES_DIR)) return evaluaciones;
  for (const d of fs.readdirSync(EVALUACIONES_DIR, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const doc = readJSON(path.join(EVALUACIONES_DIR, d.name, 'evaluacion.json'), null);
    if (!doc || doc.esFinal || doc.esPractica) continue;
    const entry = { evaluacionId: doc.id, titulo: doc.titulo, tema: doc.tema, aprobada: false, mejorNota: null, ultimaFecha: null };

    const intentosDir = path.join(EVALUACIONES_DIR, d.name, 'intentos');
    if (fs.existsSync(intentosDir)) {
      for (const f of fs.readdirSync(intentosDir)) {
        if (!f.endsWith('.json')) continue;
        const it = readJSON(path.join(intentosDir, f), null);
        if (!it || it.empleadoId !== empleadoId) continue;
        if (it.calificacionFinal !== null && it.calificacionFinal !== undefined) {
          if (entry.mejorNota === null || it.calificacionFinal > entry.mejorNota) entry.mejorNota = it.calificacionFinal;
          if (it.calificacionFinal >= NOTA_APROBATORIA) entry.aprobada = true;
        }
        if (!entry.ultimaFecha || it.fecha > entry.ultimaFecha) entry.ultimaFecha = it.fecha;
      }
    }
    evaluaciones.push(entry);
  }
  return evaluaciones;
}

// Agrupa el detalle evaluacion-por-evaluacion en un resumen por tema: un
// tema cuenta como aprobado solo cuando TODAS sus evaluaciones lo estan.
function resumenPorTema(evaluacionesEmpleado) {
  const porTema = new Map();
  for (const e of evaluacionesEmpleado) {
    if (!porTema.has(e.tema)) porTema.set(e.tema, { tema: e.tema, total: 0, aprobadas: 0, pendientes: [], ultimaFecha: null });
    const t = porTema.get(e.tema);
    t.total++;
    if (e.aprobada) t.aprobadas++;
    else t.pendientes.push(e.titulo);
    if (e.ultimaFecha && (!t.ultimaFecha || e.ultimaFecha > t.ultimaFecha)) t.ultimaFecha = e.ultimaFecha;
  }
  return Array.from(porTema.values());
}

function getMailTransport() {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  const port = Number(process.env.SMTP_PORT) || 587;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
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

// ---------- Temas / categorías (compartidos por trámites, manuales y evaluaciones) ----------

app.get('/api/categorias', (req, res) => {
  res.json({ items: CATEGORIAS });
});

app.post('/api/categorias', requireAdmin, (req, res) => {
  try {
    const nombre = agregarCategoria((req.body || {}).nombre);
    res.status(201).json({ items: CATEGORIAS, nombre });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

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

// Junta los "src" de video/imagen que un tramite tiene en uso (pasos y el
// video externo), para poder comparar una version del documento contra
// otra y detectar cuales quedaron sin referencia.
function collectMediaSrcs(doc) {
  const srcs = new Set();
  if (doc.videoExterno && doc.videoExterno.src) srcs.add(doc.videoExterno.src);
  for (const paso of (doc.pasos || [])) {
    if (paso.media && paso.media.src) srcs.add(paso.media.src);
  }
  return srcs;
}

// Cuando se reemplaza el video/imagen de un paso (o el video externo), el
// editor sube el archivo nuevo y solo cambia el puntero "src" en el
// documento; el archivo viejo se queda huerfano en disco si nadie lo
// borra. Al guardar es el momento en que sabemos con certeza que una
// referencia vieja fue realmente descartada (no solo subida de paso y
// cancelada), asi que aqui es donde se limpia.
function limpiarMediaHuerfana(dir, slug, srcsAntes, srcsDespues) {
  const mediaDir = path.join(dir, 'media');
  const prefix = `/tramites/${slug}/media/`;
  for (const src of srcsAntes) {
    if (srcsDespues.has(src) || !src.startsWith(prefix)) continue;
    const filePath = path.join(mediaDir, src.slice(prefix.length));
    if (!filePath.startsWith(mediaDir)) continue;
    try { fs.unlinkSync(filePath); } catch (_) { /* ya no existe */ }
  }
}

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
    limpiarMediaHuerfana(dir, req.params.slug, collectMediaSrcs(existing), collectMediaSrcs(doc));
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

function iniciarCompresionSiAplica(slug, filename, filePath, tamanoOriginal, tipo) {
  const comprimiendo = FFMPEG_AVAILABLE && tipo.startsWith('video/');
  if (comprimiendo) {
    compressionJobs.set(filename, { done: false });
    comprimirEnSegundoPlano(slug, filename, filePath, tamanoOriginal);
  }
  return comprimiendo;
}

app.post('/api/tramites/:slug/media', requireAdmin, upload.single('archivo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });

  const filename = req.file.filename;
  const tipo = req.file.mimetype;
  const tamanoOriginal = req.file.size;
  const comprimiendo = iniciarCompresionSiAplica(req.params.slug, filename, req.file.path, tamanoOriginal, tipo);

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

// Subida en partes: algunos proxys intermedios (el tunel publico de
// Codespaces, por ejemplo) rechazan de entrada cualquier archivo de mas
// de ~16MB con un 413, antes de que llegue a este servidor. Como un
// video de capacitacion facilmente supera eso, el cliente puede partirlo
// en pedazos chicos y mandarlos uno por uno; este endpoint los va
// concatenando y arma el archivo final con el ultimo pedazo.
const chunkUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 9 * 1024 * 1024 } });
const UPLOAD_ID_RE = /^[a-zA-Z0-9-]{1,80}$/;

app.post('/api/tramites/:slug/media/chunk', requireAdmin, chunkUpload.single('chunk'), (req, res) => {
  try {
    const { uploadId, filename, mimetype } = req.body || {};
    const idx = parseInt(req.body && req.body.index, 10);
    const total = parseInt(req.body && req.body.total, 10);
    if (!req.file || !uploadId || !UPLOAD_ID_RE.test(uploadId) || Number.isNaN(idx) || Number.isNaN(total) || total < 1) {
      return res.status(400).json({ error: 'Solicitud de subida por partes invalida' });
    }

    const mediaDir = path.join(tramitePath(req.params.slug), 'media');
    const chunksDir = path.join(mediaDir, '.chunks');
    fs.mkdirSync(chunksDir, { recursive: true });
    const tempPath = path.join(chunksDir, uploadId);

    // Los pedazos llegan en orden -el cliente espera la respuesta de uno
    // antes de mandar el siguiente- asi que alcanza con ir concatenando.
    if (idx === 0) fs.writeFileSync(tempPath, req.file.buffer);
    else fs.appendFileSync(tempPath, req.file.buffer);

    if (idx < total - 1) return res.json({ done: false });

    const ext = path.extname(filename || '') || guessExt(mimetype || '');
    const finalName = `${Date.now()}-${uuidv4().slice(0, 8)}${ext}`;
    const finalPath = path.join(mediaDir, finalName);
    fs.renameSync(tempPath, finalPath);

    const tamanoOriginal = fs.statSync(finalPath).size;
    const tipo = mimetype || 'application/octet-stream';
    const comprimiendo = iniciarCompresionSiAplica(req.params.slug, finalName, finalPath, tamanoOriginal, tipo);

    res.status(201).json({
      src: `/tramites/${req.params.slug}/media/${finalName}`,
      nombre: finalName,
      tipo,
      comprimido: false,
      tamanoOriginal,
      tamanoFinal: tamanoOriginal,
      comprimiendo
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/tramites/:slug/media/:nombre/estado', (req, res) => {
  const job = compressionJobs.get(req.params.nombre);
  if (!job) return res.json({ done: true, comprimido: false });
  if (job.done) compressionJobs.delete(req.params.nombre);
  res.json(job);
});

// ---------- Transcripcion de audio ----------

const MEDIA_NAME_RE = /^[a-zA-Z0-9_.-]+$/;
// slug/nombre -> { done, error?, segmentos? }. Se guarda entre pedidos
// (no se borra al leerla) para no tener que retranscribir cada vez que
// se recarga la pagina del editor.
const transcriptionJobs = new Map();

function segundosDesdeTimestamp(ts) {
  const [h, m, s] = ts.split(':');
  return (parseInt(h, 10) * 3600) + (parseInt(m, 10) * 60) + parseFloat(s);
}

function parsearTranscripcion(texto) {
  const re = /\[(\d\d:\d\d:\d\d\.\d\d\d) --> (\d\d:\d\d:\d\d\.\d\d\d)\]\s*(.*)/g;
  const segmentos = [];
  let m;
  while ((m = re.exec(texto || ''))) {
    const t = m[3].trim();
    if (t) segmentos.push({ inicio: segundosDesdeTimestamp(m[1]), fin: segundosDesdeTimestamp(m[2]), texto: t });
  }
  return segmentos;
}

function transcribirEnSegundoPlano(jobKey, mediaPath) {
  nodewhisper(mediaPath, {
    modelName: WHISPER_MODEL,
    autoDownloadModelName: WHISPER_MODEL,
    whisperOptions: { outputInText: false, language: 'es' }
  })
    .then((resultado) => {
      transcriptionJobs.set(jobKey, { done: true, segmentos: parsearTranscripcion(resultado) });
    })
    .catch((e) => {
      console.warn('No se pudo transcribir el audio:', e.message);
      transcriptionJobs.set(jobKey, { done: true, error: 'No se pudo transcribir el audio de este archivo.' });
    });
}

app.post('/api/tramites/:slug/media/:nombre/transcribir', requireAdmin, (req, res) => {
  if (!WHISPER_AVAILABLE) return res.status(503).json({ error: 'La transcripcion no esta disponible en este servidor.' });
  const { slug, nombre } = req.params;
  if (!MEDIA_NAME_RE.test(nombre)) return res.status(400).json({ error: 'Nombre de archivo invalido' });
  const mediaPath = path.join(tramitePath(slug), 'media', nombre);
  if (!fs.existsSync(mediaPath)) return res.status(404).json({ error: 'Archivo no encontrado' });

  const jobKey = `${slug}/${nombre}`;
  const existente = transcriptionJobs.get(jobKey);
  if (existente && !existente.done) return res.json({ iniciado: true });
  transcriptionJobs.set(jobKey, { done: false });
  transcribirEnSegundoPlano(jobKey, mediaPath);
  res.json({ iniciado: true });
});

app.get('/api/tramites/:slug/media/:nombre/transcripcion', requireAdmin, (req, res) => {
  const { slug, nombre } = req.params;
  if (!MEDIA_NAME_RE.test(nombre)) return res.status(400).json({ error: 'Nombre de archivo invalido' });
  const job = transcriptionJobs.get(`${slug}/${nombre}`);
  if (!job) return res.json({ done: false, iniciada: false });
  res.json({ ...job, iniciada: true });
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

app.get('/api/manuales/:id/exportar-pdf', (req, res) => {
  try {
    const id = decodeURIComponent(req.params.id);
    const full = path.join(MANUALES_DIR, id);
    if (!full.startsWith(MANUALES_DIR) || !fs.existsSync(full)) {
      return res.status(404).json({ error: 'Manual no encontrado' });
    }
    const meta = readJSON(MANUALES_META_FILE, {})[id] || {};
    const titulo = meta.titulo || id;
    const nombreArchivo = `${slugify(titulo)}.pdf`;
    const ext = path.extname(full).toLowerCase();

    if (ext === '.pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
      return fs.createReadStream(full).pipe(res);
    }

    const texto = extraerTextoManual(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
    const doc = new PDFDocument({ margin: 56 });
    doc.pipe(res);
    doc.fontSize(18).fillColor('#00196E').text(titulo);
    if (meta.categoria) doc.moveDown(0.3).fontSize(10).fillColor('#6B7C8C').text(meta.categoria.toUpperCase());
    doc.moveDown(1).fontSize(11).fillColor('#1F2D3A').text(texto, { lineGap: 4 });
    doc.end();
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
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

app.delete('/api/manuales/:id', requireAdmin, (req, res) => {
  const id = decodeURIComponent(req.params.id);
  const full = path.join(MANUALES_DIR, id);
  if (!full.startsWith(MANUALES_DIR) || !fs.existsSync(full)) {
    return res.status(404).json({ error: 'No encontrado' });
  }
  fs.unlinkSync(full);
  const meta = readJSON(MANUALES_META_FILE, {});
  delete meta[id];
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

// ---------- Empleados ----------

app.get('/api/empleados', requireAdmin, (req, res) => {
  res.json({ items: listEmpleados() });
});

// Lista liviana y publica (sin email) para que quien va a responder una
// evaluacion se identifique eligiendo su nombre de una lista controlada,
// en vez de escribirlo libremente.
app.get('/api/empleados/publico', (req, res) => {
  const items = listEmpleados()
    .filter(e => e.activo !== false)
    .map(e => ({ id: e.id, nombre: e.nombre, apellido: e.apellido }))
    .sort((a, b) => `${a.apellido}${a.nombre}`.localeCompare(`${b.apellido}${b.nombre}`));
  res.json({ items });
});

app.post('/api/empleados', requireAdmin, (req, res) => {
  const { nombre, apellido, email, puesto } = req.body || {};
  if (!nombre || !nombre.trim() || !apellido || !apellido.trim()) {
    return res.status(400).json({ error: 'Nombre y apellido requeridos' });
  }
  if (!email || !EMAIL_RE.test(email.trim())) {
    return res.status(400).json({ error: 'Email invalido' });
  }
  const list = listEmpleados();
  const empleado = {
    id: uuidv4().slice(0, 8),
    nombre: nombre.trim(),
    apellido: apellido.trim(),
    email: email.trim().toLowerCase(),
    puesto: (puesto || '').trim(),
    activo: true,
    creado: new Date().toISOString()
  };
  list.push(empleado);
  saveEmpleados(list);
  res.status(201).json(empleado);
});

app.put('/api/empleados/:id', requireAdmin, (req, res) => {
  const list = listEmpleados();
  const idx = list.findIndex(e => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'No encontrado' });
  const { nombre, apellido, email, puesto, activo } = req.body || {};
  if (nombre !== undefined) {
    if (!nombre.trim()) return res.status(400).json({ error: 'Nombre requerido' });
    list[idx].nombre = nombre.trim();
  }
  if (apellido !== undefined) {
    if (!apellido.trim()) return res.status(400).json({ error: 'Apellido requerido' });
    list[idx].apellido = apellido.trim();
  }
  if (email !== undefined) {
    if (!EMAIL_RE.test(email.trim())) return res.status(400).json({ error: 'Email invalido' });
    list[idx].email = email.trim().toLowerCase();
  }
  if (puesto !== undefined) list[idx].puesto = puesto.trim();
  if (activo !== undefined) list[idx].activo = !!activo;
  saveEmpleados(list);
  res.json(list[idx]);
});

app.delete('/api/empleados/:id', requireAdmin, (req, res) => {
  const list = listEmpleados();
  const next = list.filter(e => e.id !== req.params.id);
  if (next.length === list.length) return res.status(404).json({ error: 'No encontrado' });
  saveEmpleados(next);
  res.json({ ok: true });
});

app.get('/api/empleados/:id/progreso', requireAdmin, (req, res) => {
  const empleado = listEmpleados().find(e => e.id === req.params.id);
  if (!empleado) return res.status(404).json({ error: 'No encontrado' });
  const evaluaciones = progresoEmpleado(req.params.id);
  res.json({ empleado, notaAprobatoria: NOTA_APROBATORIA, evaluaciones, temas: resumenPorTema(evaluaciones) });
});

// Genera una evaluacion "practica" a medida con las preguntas de todas
// las evaluaciones puntuales que ese empleado todavia no aprueba, para
// reforzarlas antes de re-intentarlas.
app.post('/api/empleados/:id/practica', requireAdmin, (req, res) => {
  try {
    const empleado = listEmpleados().find(e => e.id === req.params.id);
    if (!empleado) return res.status(404).json({ error: 'No encontrado' });

    const pendientes = progresoEmpleado(req.params.id).filter(e => !e.aprobada);
    if (!pendientes.length) return res.status(400).json({ error: 'Este empleado ya aprobó todas las evaluaciones disponibles' });
    const idsPendientes = new Set(pendientes.map(e => e.evaluacionId));
    const temasPendientes = new Set(pendientes.map(e => e.tema));

    let preguntas = [];
    for (const d of fs.readdirSync(EVALUACIONES_DIR, { withFileTypes: true })) {
      if (!d.isDirectory() || !idsPendientes.has(d.name)) continue;
      const doc = readJSON(path.join(EVALUACIONES_DIR, d.name, 'evaluacion.json'), null);
      if (!doc) continue;
      for (const p of (doc.preguntas || [])) {
        preguntas.push({ ...p, id: uuidv4().slice(0, 8), origenTema: doc.tema, origenTitulo: doc.titulo });
      }
    }
    if (!preguntas.length) return res.status(400).json({ error: 'Las evaluaciones pendientes todavia no tienen preguntas cargadas' });

    let base = slugify(`practica ${empleado.nombre} ${empleado.apellido}`);
    let slug = base, n = 2;
    while (fs.existsSync(evalPath(slug))) slug = `${base}-${n++}`;
    const dir = evalPath(slug);
    fs.mkdirSync(path.join(dir, 'intentos'), { recursive: true });

    const now = new Date().toISOString();
    const doc = {
      id: slug,
      titulo: `Práctica de refuerzo · ${empleado.nombre} ${empleado.apellido}`,
      tema: 'Refuerzo',
      esFinal: false,
      esPractica: true,
      empleadoId: empleado.id,
      temasIncluidos: Array.from(temasPendientes),
      evaluacionesIncluidas: pendientes.map(e => e.titulo),
      tramiteId: '',
      descripcion: `Práctica generada para reforzar: ${pendientes.map(e => e.titulo).join(', ')}.`,
      creado: now,
      actualizado: now,
      preguntas
    };
    writeJSON(path.join(dir, 'evaluacion.json'), doc);
    res.status(201).json(doc);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
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
        esPractica: !!doc.esPractica,
        empleadoId: doc.empleadoId || '',
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

// ---------- Generador asistido de preguntas con IA ----------

function extraerTextoManual(rel) {
  if (typeof rel !== 'string' || rel.includes('..')) throw new Error('Ruta invalida');
  const full = path.join(MANUALES_DIR, rel);
  if (!full.startsWith(MANUALES_DIR) || !fs.existsSync(full)) throw new Error('Manual no encontrado');
  const ext = path.extname(full).toLowerCase();
  if (ext === '.md' || ext === '.markdown' || ext === '.txt') {
    return fs.readFileSync(full, 'utf8');
  }
  if (ext === '.html' || ext === '.htm') {
    return fs.readFileSync(full, 'utf8')
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  throw new Error('Este tipo de manual (por ejemplo PDF) todavia no se puede leer automaticamente. Pega el texto relevante manualmente.');
}

async function generarPreguntasConIA(texto, cantidad) {
  const instrucciones = `Sos un asistente que ayuda a preparar evaluaciones de capacitacion interna para empleados de COOPELESCA (una cooperativa de electrificacion rural), a partir del contenido de un manual de procedimientos.

Con base UNICAMENTE en el siguiente contenido, generá ${cantidad} preguntas de evaluación en español. Usá una mezcla de opción múltiple (tipo "opcion", con 4 opciones donde exactamente una es correcta) y verdadero/falso (tipo "vf", con opciones "Verdadero" y "Falso"). No inventes datos, nombres, montos ni pasos que no esten explicitos en el texto. Si el contenido no alcanza para ${cantidad} preguntas utiles y sin inventar información, generá menos.

Respondé EXCLUSIVAMENTE con un JSON valido (sin texto adicional, sin bloques de markdown) con esta forma exacta:
{"preguntas":[{"texto":"...","tipo":"opcion","opciones":[{"texto":"...","correcta":true},{"texto":"...","correcta":false},{"texto":"...","correcta":false},{"texto":"...","correcta":false}]},{"texto":"...","tipo":"vf","opciones":[{"texto":"Verdadero","correcta":true},{"texto":"Falso","correcta":false}]}]}

Contenido del manual:
"""
${texto}
"""`;

  const response = await anthropicClient.messages.create({
    model: 'claude-opus-5',
    max_tokens: 4096,
    messages: [{ role: 'user', content: instrucciones }]
  });

  const bloque = response.content.find(b => b.type === 'text');
  if (!bloque) throw new Error('La IA no devolvió texto');

  let payload;
  try {
    payload = JSON.parse(bloque.text);
  } catch (e) {
    const match = bloque.text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('La respuesta de la IA no fue un JSON valido');
    payload = JSON.parse(match[0]);
  }

  const preguntas = Array.isArray(payload.preguntas) ? payload.preguntas : [];
  return preguntas
    .filter(p => p && typeof p.texto === 'string' && p.texto.trim() && (p.tipo === 'opcion' || p.tipo === 'vf'))
    .map(p => ({
      texto: p.texto.trim(),
      tipo: p.tipo,
      opciones: (Array.isArray(p.opciones) ? p.opciones : [])
        .filter(o => o && typeof o.texto === 'string' && o.texto.trim())
        .map(o => ({ texto: o.texto.trim(), correcta: !!o.correcta }))
    }))
    .filter(p => p.opciones.filter(o => o.correcta).length === 1);
}

app.post('/api/ia/generar-preguntas', requireAdmin, async (req, res) => {
  if (!anthropicClient) {
    return res.status(503).json({ error: 'El generador con IA no esta configurado en este servidor (falta ANTHROPIC_API_KEY).' });
  }
  try {
    const { manualId, texto: textoManual, cantidad } = req.body || {};
    let texto = (textoManual || '').trim();
    if (!texto && manualId) texto = extraerTextoManual(manualId).trim();
    if (!texto) return res.status(400).json({ error: 'Elegí un manual o pegá el texto del que se generarán las preguntas' });

    const n = Math.min(Math.max(parseInt(cantidad, 10) || 5, 1), 15);
    const preguntas = await generarPreguntasConIA(texto.slice(0, 24000), n);
    if (!preguntas.length) return res.status(502).json({ error: 'La IA no genero preguntas utilizables a partir de ese contenido. Probá con otro manual o con más texto.' });
    res.json({ preguntas });
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

    const { empleadoId, respuestas } = req.body || {};
    if (!empleadoId) return res.status(400).json({ error: 'Falta identificar quien responde' });
    const empleado = listEmpleados().find(e => e.id === empleadoId);
    if (!empleado) return res.status(400).json({ error: 'No se encontro a la persona seleccionada' });
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
      empleadoId: empleado.id,
      nombre: empleado.nombre,
      apellido: empleado.apellido,
      email: empleado.email,
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

app.get('/api/evaluaciones/:slug/intentos/:intentoId/certificado', (req, res) => {
  try {
    const doc = readJSON(path.join(evalPath(req.params.slug), 'evaluacion.json'), null);
    if (!doc) return res.status(404).json({ error: 'Evaluación no encontrada' });
    const intento = readJSON(path.join(evalIntentosDir(req.params.slug), `${req.params.intentoId}.json`), null);
    if (!intento) return res.status(404).json({ error: 'Intento no encontrado' });

    const aprobado = intento.calificacionFinal !== null && intento.calificacionFinal >= NOTA_APROBATORIA;
    const nombreArchivo = `certificado-${slugify(`${intento.apellido}-${intento.nombre}`)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);

    const pdf = new PDFDocument({ margin: 50, size: 'A4', layout: 'landscape' });
    pdf.pipe(res);

    pdf.rect(18, 18, pdf.page.width - 36, pdf.page.height - 36).lineWidth(2).stroke('#0072BC');
    pdf.moveDown(2);
    pdf.fontSize(12).fillColor('#6B7C8C')
      .text('COOPELESCA R.L. · Capacitador de Atención de Trámites de Asociados', { align: 'center' });
    pdf.moveDown(1.5);
    pdf.fontSize(26).fillColor('#00196E')
      .text(aprobado ? 'CERTIFICADO DE APROBACIÓN' : 'CONSTANCIA DE PARTICIPACIÓN', { align: 'center' });
    pdf.moveDown(1.5);
    pdf.fontSize(13).fillColor('#1F2D3A').text('Se certifica que', { align: 'center' });
    pdf.moveDown(0.4);
    pdf.fontSize(22).fillColor('#0072BC').text(`${intento.nombre} ${intento.apellido}`, { align: 'center' });
    pdf.moveDown(0.8);
    pdf.fontSize(13).fillColor('#1F2D3A').text(
      intento.pendienteRevision
        ? `completó la evaluación "${doc.titulo}" (tema: ${doc.tema}), pendiente de revisión final.`
        : `completó la evaluación "${doc.titulo}" (tema: ${doc.tema}) con una nota de ${intento.calificacionFinal}/100.`,
      { align: 'center' }
    );
    pdf.moveDown(1.5);
    pdf.fontSize(10).fillColor('#6B7C8C')
      .text(`Fecha: ${new Date(intento.fecha).toLocaleDateString('es-CR')}`, { align: 'center' });
    pdf.end();
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

app.post('/api/admin/resultados-pdf', requireAdmin, (req, res) => {
  try {
    const filas = Array.isArray((req.body || {}).filas) ? req.body.filas : [];
    if (!filas.length) return res.status(400).json({ error: 'No hay resultados para exportar' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="resultados-${new Date().toISOString().slice(0, 10)}.pdf"`);

    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
    doc.pipe(res);

    doc.fontSize(16).fillColor('#00196E').text('CATA · Resultados de evaluaciones');
    doc.fontSize(9).fillColor('#6B7C8C').text(`Generado el ${new Date().toLocaleString('es-CR')} · ${filas.length} resultado${filas.length === 1 ? '' : 's'}`);
    doc.moveDown(1);

    const cols = [
      { key: 'tema', label: 'Tema', width: 95 },
      { key: 'evaluacion', label: 'Evaluación', width: 190 },
      { key: 'empleado', label: 'Empleado', width: 150 },
      { key: 'fecha', label: 'Fecha', width: 90 },
      { key: 'nota', label: 'Nota', width: 70 },
      { key: 'estado', label: 'Estado', width: 120 }
    ];
    const anchoTotal = cols.reduce((s, c) => s + c.width, 0);
    const startX = doc.page.margins.left;
    const rowHeight = 20;
    let y = doc.y;

    function drawHeaderRow() {
      doc.rect(startX, y, anchoTotal, rowHeight).fill('#0072BC');
      let x = startX;
      doc.fontSize(9).fillColor('#fff');
      cols.forEach(c => { doc.text(c.label, x + 4, y + 6, { width: c.width - 8 }); x += c.width; });
      y += rowHeight;
    }

    drawHeaderRow();
    filas.forEach((f, i) => {
      if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        y = doc.page.margins.top;
        drawHeaderRow();
      }
      if (i % 2 === 0) doc.rect(startX, y, anchoTotal, rowHeight).fill('#EAF4FC');
      let x = startX;
      doc.fontSize(8.5).fillColor('#1F2D3A');
      cols.forEach(c => { doc.text(String(f[c.key] ?? ''), x + 4, y + 6, { width: c.width - 8, ellipsis: true }); x += c.width; });
      y += rowHeight;
    });

    doc.end();
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

// Envia por correo, a cada empleado seleccionado, un enlace directo y
// personalizado a esta evaluacion (queda con su identidad ya resuelta,
// sin que tenga que elegirse de una lista al llegar).
app.post('/api/evaluaciones/:slug/invitaciones', requireAdmin, async (req, res) => {
  try {
    const doc = readJSON(path.join(evalPath(req.params.slug), 'evaluacion.json'), null);
    if (!doc) return res.status(404).json({ error: 'No encontrada' });

    const transport = getMailTransport();
    if (!transport) {
      return res.status(400).json({
        error: 'El envio de correos no esta configurado. Definí las variables de entorno SMTP_HOST, SMTP_USER y SMTP_PASS (y opcionalmente SMTP_PORT y SMTP_FROM) para habilitarlo.'
      });
    }

    const { empleadoIds } = req.body || {};
    if (!Array.isArray(empleadoIds) || !empleadoIds.length) {
      return res.status(400).json({ error: 'Selecciona al menos un empleado' });
    }
    const empleados = listEmpleados().filter(e => empleadoIds.includes(e.id) && e.email);
    if (!empleados.length) return res.status(400).json({ error: 'Ninguno de los empleados seleccionados tiene un email registrado' });

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const from = process.env.SMTP_FROM || process.env.SMTP_USER;

    const resultados = await Promise.allSettled(empleados.map(emp => {
      const link = `${baseUrl}/evaluar.html?id=${encodeURIComponent(doc.id)}&empleado=${encodeURIComponent(emp.id)}`;
      return transport.sendMail({
        from,
        to: emp.email,
        subject: `CATA · Evaluación pendiente: ${doc.titulo}`,
        html: `
          <p>Hola ${escapeHtmlMail(emp.nombre)},</p>
          <p>Tenés pendiente la evaluación <b>${escapeHtmlMail(doc.titulo)}</b> en CATA (Capacitador de Atención de Trámites de Asociados).</p>
          <p><a href="${link}">Hacé clic acá para realizarla</a></p>
          <p style="color:#6b7c8c;font-size:13px">Si el enlace no funciona, copiá y pegá esta dirección en tu navegador:<br>${link}</p>
        `
      });
    }));

    const enviados = resultados.filter(r => r.status === 'fulfilled').length;
    const fallidos = resultados.length - enviados;
    res.json({ enviados, fallidos, total: empleados.length });
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
