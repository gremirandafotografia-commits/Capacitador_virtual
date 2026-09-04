/* Utilidades de captura: pantallazos, grabación de pantalla+audio y de cámara.
   Requiere ejecutarse en localhost o https (APIs getDisplayMedia / getUserMedia). */

function pickMime() {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm'
  ];
  for (const c of candidates) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(c)) return c;
  }
  return '';
}

async function grabScreenshot() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    throw new Error('Este navegador no soporta compartir pantalla.');
  }
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
  const track = stream.getVideoTracks()[0];
  const video = document.createElement('video');
  video.srcObject = stream;
  await video.play();
  await new Promise(r => setTimeout(r, 250));
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  track.stop();
  stream.getTracks().forEach(t => t.stop());
  return await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

class MediaCapture {
  constructor() {
    this.recorder = null;
    this.chunks = [];
    this.stream = null;
    this.onStop = null;
  }

  async start(kind, opts) {
    opts = opts || {};
    if (kind === 'pantalla') {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        // Una grabación de pantalla es mayormente interfaz estática: no hace
        // falta más de ~15fps para que se lea perfecto y pesa mucho menos.
        video: { frameRate: { ideal: 15, max: 20 } },
        audio: opts.audioSistema !== false
      });
      let stream = displayStream;
      if (opts.mic) {
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const combined = new MediaStream([
            ...displayStream.getVideoTracks(),
            ...micStream.getAudioTracks(),
            ...displayStream.getAudioTracks()
          ]);
          stream = combined;
          this._micStream = micStream;
        } catch (e) {
          console.warn('No se pudo capturar el micrófono, se graba solo pantalla', e);
        }
      }
      this.stream = stream;
    } else if (kind === 'camara') {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { frameRate: { ideal: 24 } }, audio: true });
    } else {
      throw new Error('Tipo de captura desconocido');
    }

    this.chunks = [];
    const mime = pickMime();
    // Sin este límite, Chrome graba a la máxima calidad posible (varios Mbps),
    // muy por encima de lo que necesita un video de capacitación con texto e
    // interfaz. Bajarlo reduce el tamaño del archivo sin que se note al ver el video.
    const videoBitsPerSecond = kind === 'pantalla' ? 2_000_000 : 1_500_000;
    this.recorder = new MediaRecorder(this.stream, { videoBitsPerSecond, ...(mime ? { mimeType: mime } : {}) });
    this.recorder.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data); };
    this.recorder.start(500);

    this.stream.getVideoTracks()[0].addEventListener('ended', () => {
      if (this.recorder && this.recorder.state !== 'inactive') this.stop();
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (!this.recorder) return resolve(null);
      this.recorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.recorder.mimeType || 'video/webm' });
        this._cleanupTracks();
        resolve(blob);
      };
      if (this.recorder.state !== 'inactive') this.recorder.stop();
      else {
        const blob = new Blob(this.chunks, { type: 'video/webm' });
        this._cleanupTracks();
        resolve(blob);
      }
    });
  }

  pause() {
    if (this.recorder && this.recorder.state === 'recording') this.recorder.pause();
  }

  resume() {
    if (this.recorder && this.recorder.state === 'paused') this.recorder.resume();
  }

  get isPaused() {
    return !!this.recorder && this.recorder.state === 'paused';
  }

  _cleanupTracks() {
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    if (this._micStream) this._micStream.getTracks().forEach(t => t.stop());
  }
}
