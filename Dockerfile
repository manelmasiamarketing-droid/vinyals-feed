FROM node:20-bookworm-slim

# apt instala Chromium junto con TODAS sus librerías de sistema necesarias
# (resolviendo dependencias automáticamente) — no hace falta listarlas a mano.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     chromium \
     ca-certificates \
     fonts-liberation \
  && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server.js"]
