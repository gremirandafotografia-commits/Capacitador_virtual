#!/bin/bash
# Prepara whisper.cpp (usado para transcribir el audio de los videos) tras
# npm install: descarga el modelo y compila el binario si hace falta.
# No requiere GPU ni internet en cada uso -solo la primera vez, para bajar
# el modelo. Si algo falla (sin cmake/compilador en el entorno, por
# ejemplo) el postinstall que llama a este script no rompe el resto de
# la instalacion: la app funciona igual, solo sin transcripcion.
set -e

WHISPER_DIR="node_modules/nodejs-whisper/cpp/whisper.cpp"
MODEL="${WHISPER_MODEL:-base}"

if [ ! -d "$WHISPER_DIR" ]; then
  echo "nodejs-whisper no esta instalado, se omite la preparacion de whisper.cpp"
  exit 0
fi

if [ ! -f "$WHISPER_DIR/models/ggml-$MODEL.bin" ]; then
  echo "[whisper] Descargando modelo '$MODEL'..."
  bash "$WHISPER_DIR/models/download-ggml-model.sh" "$MODEL"
fi

if [ ! -f "$WHISPER_DIR/build/bin/whisper-cli" ]; then
  echo "[whisper] Compilando whisper.cpp..."
  (cd "$WHISPER_DIR" && cmake -B build >/dev/null && cmake --build build --config Release -j"$(nproc)")
fi

echo "[whisper] Listo: transcripcion de audio disponible."
