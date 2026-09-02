# Viñals Feed

Página pensada para digital signage (pantalla desatendida, sin clics) que
muestra las 6 publicaciones más recientes de Instagram (@vinals1906) y las 6
de LinkedIn (Grupo Viñals) en un carrusel de 1 publicación a la vez, rotando
por las 12. El texto se recorta a 3 líneas. Las fotos duran 8s; los vídeos
(reels de Instagram y vídeos nativos de LinkedIn) reproducen el clip real sin
audio y la tarjeta dura lo que dure el vídeo en vez de un tiempo fijo. La
imagen/vídeo va en formato 9:16 (vertical, el nativo de los reels).

Tamaños y proporciones ajustados para una pantalla vertical de 750×2160px
(fuentes e imágenes grandes, pensadas para verse de pie/desde lejos). Si el
reproductor real usa otra resolución, hay que reajustar los tamaños en
`server.js` (`<style>` dentro de `renderPage()`).

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
  que se lee con un `fetch` simple + `cheerio` (sin navegador). Cuando un post
  lleva vídeo nativo, LinkedIn lo incrusta directamente en el HTML (un
  `<video data-sources="[...]">` con varias calidades en JSON) — sin login
  wall de por medio, así que sacarlo es más simple que en Instagram.

Ambos son **scraping de páginas públicas, no APIs oficiales**. LinkedIn prohíbe
el scraping en sus términos de servicio; esto puede romperse si LinkedIn o
Instagram cambian su HTML, o bloquear la IP si se llama con demasiada
frecuencia. El caché (`REFRESH_MS`, 8h por defecto = 3 veces al día) existe
justamente para minimizar esas peticiones: se guarda en `data/cache.json` y,
mientras no pasen esas 8h, la página se sirve entera desde ahí sin volver a
llamar a Instagram ni LinkedIn.

⚠️ **Instagram bloquea la IP de Render**: en producción, Instagram redirige
las peticiones desde el servidor de Render a la página de login
(`/accounts/login/...`) en vez de servir el perfil público — trata las IPs
de datacenter como sospechosas. No es un problema de timeout ni de código;
ningún ajuste de tiempos de espera lo arregla porque ni siquiera llega a
cargar el perfil. Opciones reales para solucionarlo:
1. **API oficial de Meta (Graph API)**: requiere conectar la cuenta de
   Instagram a una Página de Facebook como cuenta Business/Creator y crear
   una app en Meta for Developers — hay que hacerlo vosotros (no puedo crear
   cuentas en vuestro nombre), pero es la vía fiable a largo plazo.
2. **Proxy residencial/móvil** (de pago) delante de las peticiones de
   Puppeteer, para que Instagram no vea una IP de datacenter. Añade coste y
   complejidad, sale del "gratis".
3. **Aceptar que Instagram no funcione desde Render** y quedarse solo con
   LinkedIn — la página ya degrada así de forma automática si falla.
El error exacto queda guardado en `/api/feed` → `errors.instagram` cada vez
que falla, con el título/URL/texto de la página que sirvió Instagram, para
diagnosticar sin acceder a los logs de Render.

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
