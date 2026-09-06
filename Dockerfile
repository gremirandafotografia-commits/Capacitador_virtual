FROM node:20-slim

# ffmpeg no viene en la imagen base de Node; sin el, la app funciona
# igual pero sin comprimir los videos que se suban/graben. cmake/
# build-essential/git son para compilar whisper.cpp (transcripcion de
# audio) durante el npm install de mas abajo; curl + ca-certificates
# hacen falta para que ese mismo paso descargue el modelo (sin
# ca-certificates, curl no tiene con que validar el HTTPS y falla con
# "error setting certificate file"). Si algo de esto faltara, el
# postinstall lo detecta y sigue sin romper el build.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg cmake build-essential git curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
COPY scripts ./scripts
# El cache remoto del builder a veces reutiliza esta capa aunque cambien
# los scripts (por ejemplo setup-whisper.sh), asi que se fuerza a
# reconstruir cambiando este valor cuando haga falta reinstalar/recompilar
# de verdad (whisper.cpp, por ejemplo).
ARG CACHEBUST=2026-09-06-01
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 4173

CMD ["node", "server.js"]
