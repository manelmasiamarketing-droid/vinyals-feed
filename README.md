# Viñals Feed

Página pensada para digital signage (pantalla desatendida, sin clics) que
muestra las 6 publicaciones más recientes de Instagram (@vinals1906) y de
LinkedIn (Grupo Viñals), alternadas, en un carrusel de una tarjeta a la vez.
Las fotos duran 8s; los reels reproducen el vídeo real (sin audio, en bucle
silencioso) y la tarjeta dura lo que dura el vídeo en vez de un tiempo fijo.

## Cómo obtiene los datos

- **Instagram**: no tiene API pública de lectura sin cuenta de negocio conectada,
  así que se usa un navegador headless (Puppeteer) que visita el perfil público,
  saca los últimos 6 posts del grid y entra en cada uno para leer el pie de
  foto real (no está disponible en la vista de grid). Para los reels, además
  saca la URL directa del vídeo (sin audio — va en un track aparte en el
  manifiesto DASH que usa Instagram) leyendo el HTML de la página; el modal
  de "Regístrate para ver más" bloquea el reproductor visual pero no evita
  leer esa URL del código fuente.
- **LinkedIn**: la página de empresa se sirve renderizada por el servidor, así
  que se lee con un `fetch` simple + `cheerio` (sin navegador).

Ambos son **scraping de páginas públicas, no APIs oficiales**. LinkedIn prohíbe
el scraping en sus términos de servicio; esto puede romperse si LinkedIn o
Instagram cambian su HTML, o bloquear la IP si se llama con demasiada
frecuencia. El caché (`REFRESH_MS`, 8h por defecto = 3 veces al día) existe
justamente para minimizar esas peticiones: se guarda en `data/cache.json` y,
mientras no pasen esas 8h, la página se sirve entera desde ahí sin volver a
llamar a Instagram ni LinkedIn.

⚠️ **Ojo con el plan free de Render**: su disco es efímero — cada vez que el
contenedor se reinicia (incluido el "despertar" tras dormirse por
inactividad) se pierde `data/cache.json`, así que el primer request después
de un reinicio SIEMPRE dispara un scrape nuevo, aunque no hayan pasado las
8h. Si el servicio se duerme y despierta varias veces al día por tráfico
esporádico, el número real de llamadas puede ser mayor que 3. Si necesitas
la garantía estricta de "como mucho 3 veces al día pase lo que pase", hay
que guardar el caché en algo que sobreviva a los reinicios (un KV externo
tipo Upstash Redis, por ejemplo) en vez de en el disco del contenedor —
avisa si quieres que lo añada.

## Desarrollo local

```bash
npm install
npm start
```

Abre http://localhost:3000. Instagram fallará en local si no tienes Chromium
instalado — es normal, LinkedIn funcionará igualmente y la página se
renderiza solo con lo que consiguió.

## Desplegar en Render (gratis) vía GitHub

1. Sube esta carpeta a un repositorio de GitHub (puede ser privado):

   ```bash
   git init
   git add .
   git commit -m "Viñals feed inicial"
   git branch -M main
   git remote add origin https://github.com/<tu-usuario>/vinals-feed.git
   git push -u origin main
   ```

2. En [render.com](https://render.com), **New +** → **Web Service** →
   conecta tu cuenta de GitHub y elige el repo `vinals-feed`.
3. Render detecta el `Dockerfile` automáticamente (Environment: Docker).
   Plan: **Free**.
4. Variables de entorno (opcional, ya traen estos valores por defecto):
   - `IG_USERNAME` = `vinals1906`
   - `LI_SLUG` = `vinalsgrupo`
   - `REFRESH_MS` = `28800000` (8 horas, en milisegundos → 3 veces al día)
5. Deploy. Cada `git push` a `main` vuelve a desplegar solo.

También puedes usar el archivo `render.yaml` incluido (Render → **Blueprints**
→ selecciona el repo) para que cree el servicio con esta configuración sin
rellenar el formulario a mano.

## Limitaciones a tener en cuenta

- El plan free de Render "duerme" el servicio tras ~15 min sin tráfico; la
  primera visita tras un rato inactivo tardará unos segundos más (arranca el
  contenedor + lanza Chromium).
- Si Instagram o LinkedIn cambian su HTML, el scraper de esa red puede dejar
  de funcionar. El código está aislado por red (`lib/scrapeInstagram.js`,
  `lib/scrapeLinkedIn.js`) y la página sigue funcionando con la otra red si
  una falla — revisa los logs de Render si un día deja de actualizarse.
- `/api/feed` devuelve el estado del caché en JSON (incluye `errors` si algo
  falló en el último refresco) — útil para depurar sin mirar logs.
- Los vídeos se sirven vía `/video` igual que las imágenes vía `/img`
  (el servidor los descarga enteros y los reenvía, sin soporte de rango
  HTTP). Para clips cortos de reel (unos pocos MB) va bien; si algún día
  se usan vídeos mucho más largos, esto habría que revisarlo.
- Igual que las imágenes, la URL del vídeo caduca a las pocas horas —
  por eso se vuelve a sacar en cada refresco, no vale guardarla más tiempo.
