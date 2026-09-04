FROM node:20-slim

# ffmpeg no viene en la imagen base de Node; sin el, la app funciona
# igual pero sin comprimir los videos que se suban/graben.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 4173

CMD ["node", "server.js"]
