# Viñals Feed

Página pensada para digital signage (pantalla desatendida, sin clics) que
muestra las 6 publicaciones más recientes de Instagram (@vinals1906) y las 6
de LinkedIn (Grupo Viñals) en un carrusel de 2 publicaciones a la vez (una de
cada red), rotando por las 6 parejas. El texto se recorta a 3 líneas. Las
fotos duran 8s; los vídeos (reels de Instagram y vídeos nativos de LinkedIn)
reproducen el clip real sin audio y la pareja dura lo que dure el vídeo más
largo en vez de un tiempo fijo.

Tamaños ajustados para una pantalla vertical estrecha (probado en 746×1800 y
750×2160). Si el reproductor real usa otra resolución, hay que reajustar los
tamaños en `server.js` (`<style>` dentro de `renderPage()`).

## Cómo obtiene los datos

- **Instagram**: vía la **API oficial de Meta (Instagram Graph API)**, usando
  el token de un *system user* de Meta Business Manager. Necesita dos
  variables de entorno:
  - `IG_ACCESS_TOKEN` — token del system user, con permisos `instagram_basic`,
    `pages_show_list`, `pages_read_engagement`, generado desde Business
    Settings → System users → (tu usuario) → Generate New Token.
  - `IG_BUSINESS_ID` — el ID de la cuenta de Instagram Business (se ve en
    Business Settings → Instagram accounts).
  Sin API oficial, Instagram bloquea las peticiones desde IPs de datacenter
  como las de Render (redirige a la página de login) — así se evita eso del
  todo, y de paso ya no hace falta un navegador headless para nada.
- **LinkedIn**: sigue siendo scraping de la página pública de empresa
  (`fetch` simple + `cheerio`, sin navegador) — LinkedIn no tiene una API
  abierta equivalente sin acuerdo de partner. Cuando un post lleva vídeo
  nativo, LinkedIn lo incrusta directamente en el HTML (un
  `<video data-sources="[...]">` con varias calidades en JSON).

LinkedIn sigue siendo scraping de una página pública (prohibido en sus
términos de servicio); puede romperse si LinkedIn cambia su HTML, o bloquear
la IP si se llama con demasiada frecuencia. El caché (`REFRESH_MS`, 8h por
defecto = 3 veces al día) existe para minimizar esas peticiones: se guarda en
`data/cache.json` y, mientras no pasen esas 8h, la página se sirve entera
desde ahí sin volver a llamar a LinkedIn. Instagram, al ser API oficial, no
tiene ese riesgo de bloqueo, pero igualmente respeta el mismo caché para no
gastar cuota de la API sin necesidad.

Cada red actualiza la caché en cuanto termina su propio scrape, sin esperar
a la otra — así un fallo o una tardanza en una no deja la página vacía
mientras la otra ya tenía datos listos.

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

## Conseguir el token de Instagram (IG_ACCESS_TOKEN)

1. La cuenta de Instagram debe ser **Business**, vinculada a una Página de
   Facebook, y ambas deben estar como activos de un **Business Manager**
   (Meta Business Suite).
2. En [business.facebook.com](https://business.facebook.com) →
   **Settings → Users → System users → Add** — crea uno (ej.
   `vinals-feed-bot`, rol Admin).
3. Dale acceso a los activos: dentro del system user, **Assign assets** →
   marca la Página de Facebook y la cuenta de Instagram.
4. **Generate New Token** → elige la app de Meta for Developers ya creada →
   marca los permisos `instagram_basic`, `pages_show_list`,
   `pages_read_engagement` → genera. Copia ese token — no caduca como los
   tokens de usuario normales (~60 días), es estable para un servidor.
5. El `IG_BUSINESS_ID` se ve en **Business Settings → Instagram accounts**,
   entrando en la cuenta.

Ninguno de estos pasos se puede hacer desde fuera de vuestra cuenta de Meta —
hay que hacerlos vosotros. El código ya está listo para leer ambos valores
como variables de entorno, nunca hay que escribirlos en el código ni subirlos
a git.

## Desarrollo local

```bash
npm install
IG_ACCESS_TOKEN=tu-token IG_BUSINESS_ID=tu-id npm start
```

Abre http://localhost:3000. Sin esas dos variables, Instagram fallará con un
error claro en `/api/feed` — LinkedIn funciona igual sin necesitar nada.

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
4. Variables de entorno:
   - `IG_USERNAME` = `vinals1906` (ya viene por defecto)
   - `LI_SLUG` = `vinalsgrupo` (ya viene por defecto)
   - `REFRESH_MS` = `28800000` (ya viene por defecto, 8h → 3 veces al día)
   - `IG_BUSINESS_ID` = `17841403980877254`
   - `IG_ACCESS_TOKEN` = *(pégalo tú directamente en el panel de Render —
     nunca en un archivo del repo)*
5. Deploy. Cada `git push` a `main` vuelve a desplegar solo.

También puedes usar el archivo `render.yaml` incluido (Render → **Blueprints**
→ selecciona el repo); `IG_ACCESS_TOKEN` está marcado como variable a rellenar
a mano por seguridad, el resto se configura solo.

## Limitaciones a tener en cuenta

- El favicon es el logo real de Viñals, sacado del scrape de LinkedIn
  (`cache.linkedin.logo`) y servido vía `/favicon.ico`. Hasta que no haya
  un primer scrape de LinkedIn con éxito, esa ruta devuelve 404 y el
  navegador usa su icono por defecto — es normal en el primer arranque.
- El plan free de Render "duerme" el servicio tras ~15 min sin tráfico; la
  primera visita tras un rato inactivo tardará unos segundos más en arrancar
  el contenedor.
- Si LinkedIn cambia el HTML de su página pública, su scraper puede dejar de
  funcionar (Instagram, al ser API oficial, no tiene ese riesgo). El código
  está aislado por red (`lib/scrapeInstagram.js`, `lib/scrapeLinkedIn.js`) y
  la página sigue funcionando con la otra red si una falla.
- `/api/feed` devuelve el estado del caché en JSON (incluye `errors` si algo
  falló en el último refresco) — útil para depurar sin mirar logs.
- Los vídeos se sirven vía `/video` igual que las imágenes vía `/img`
  (el servidor los descarga enteros y los reenvía, sin soporte de rango
  HTTP). Para clips cortos va bien; si algún día se usan vídeos mucho más
  largos, esto habría que revisarlo.
- Las URLs de media de Instagram (`media_url`) caducan a las pocas horas,
  igual que las de LinkedIn — por eso se vuelven a pedir en cada refresco.
