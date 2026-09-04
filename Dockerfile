FROM node:20-slim

# ffmpeg no viene en la imagen base de Node; sin el, la app funciona
# igual pero sin comprimir los videos que se suban/graben. cmake/
# build-essential/git son para compilar whisper.cpp (transcripcion de
# audio) durante el npm install de mas abajo; si faltaran, el
# postinstall lo detecta y sigue sin romper el build.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg cmake build-essential git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
COPY scripts ./scripts
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 4173

CMD ["node", "server.js"]
