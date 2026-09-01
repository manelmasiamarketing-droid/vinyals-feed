# Viñals Feed

Página que muestra las 2 publicaciones más recientes de Instagram (@vinals1906)
y LinkedIn (Grupo Viñals), alternadas, en tarjetas estilo widget social.

## Cómo obtiene los datos

- **Instagram**: no tiene API pública de lectura sin cuenta de negocio conectada,
  así que se usa un navegador headless (Puppeteer) que visita el perfil público
  y lee el primer post del grid.
- **LinkedIn**: la página de empresa se sirve renderizada por el servidor, así
  que se lee con un `fetch` simple + `cheerio` (sin navegador).

Ambos son **scraping de páginas públicas, no APIs oficiales**. LinkedIn prohíbe
el scraping en sus términos de servicio; esto puede romperse si LinkedIn o
Instagram cambian su HTML, o bloquear la IP si se llama con demasiada
frecuencia. El caché (`REFRESH_MS`, 3h por defecto) existe justamente para
minimizar esas peticiones.

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
   - `REFRESH_MS` = `10800000` (3 horas, en milisegundos)
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
