const puppeteer = require('puppeteer-core');

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// El grid del perfil solo trae el alt text automático de accesibilidad
// ("Photo by Viñals on August 30, 2026. Puede ser una imagen de...") — no
// es el pie de foto real. Lo usamos solo para sacar la fecha.
function parseDateFromAlt(alt) {
  const match = alt && alt.match(/on ([A-Za-z]+ \d{1,2}, \d{4})\./);
  return match ? match[1] : null;
}

// El pie de foto real sí está en el meta og:description de la página
// individual del post, con forma:
// `N likes, M comments - usuario el/on FECHA: "texto real aquí". `
function parseCaption(ogDescription) {
  if (!ogDescription) return '';
  const match = ogDescription.match(/:\s*"([\s\S]*)"\.\s*$/);
  return (match ? match[1] : ogDescription).trim();
}

function parseFollowers(metaDescription) {
  if (!metaDescription) return null;
  const match = metaDescription.match(/^([\d.,]+)\s+\S+/);
  return match ? match[1] : null;
}

// Los reels incrustan su manifiesto DASH (con las URLs .mp4 reales, sin
// audio — los tracks de audio van aparte) en el HTML de la página, aunque
// el modal de "Regístrate para ver más" bloquee el reproductor visual.
// Cada pista va precedida de FBQualityLabel="360p"/"540p"/etc.; cogemos
// una calidad intermedia para no disparar el peso del proxy de vídeo.
function parseVideoUrl(html) {
  const re = /FBQualityLabel=\\"(\d+)p\\"[\s\S]{0,20}?\\u003CBaseURL>(.*?)\\u003C/g;
  const candidates = [];
  let match;
  while ((match = re.exec(html)) !== null) {
    candidates.push({
      quality: Number(match[1]),
      url: match[2].replace(/\\\//g, '/').replace(/&amp;/g, '&')
    });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.quality - b.quality);
  return candidates[Math.min(1, candidates.length - 1)].url;
}

async function scrapeInstagram(username, { count = 6 } = {}) {
  // Flags pensados para el límite de 512MB del plan free de Render:
  // sin esto Chromium puede agotar la RAM y hacer que el contenedor
  // entero reinicie en bucle (--single-process/--no-zygote recortan
  // memoria uniendo procesos, a costa de algo de estabilidad — aceptable
  // para un scrape puntual cada pocas horas).
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-sync',
      '--disable-translate',
      '--metrics-recording-only',
      '--mute-audio',
      '--no-first-run',
      '--safebrowsing-disable-auto-update',
      '--single-process',
      '--no-zygote',
      '--window-size=800,600'
    ]
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);
    await page.setViewport({ width: 800, height: 600 });

    await page.goto(`https://www.instagram.com/${username}/?hl=es`, {
      waitUntil: 'networkidle2',
      timeout: 45000
    });

    await page.waitForSelector('main a[href*="/p/"], main a[href*="/reel/"]', {
      timeout: 20000
    });

    const followersRaw = await page.evaluate(() => {
      const meta = document.querySelector('meta[name="description"]');
      return meta ? meta.content : null;
    });

    const raw = await page.evaluate((limit) => {
      const links = Array.from(
        document.querySelectorAll('main a[href*="/p/"], main a[href*="/reel/"]')
      ).slice(0, limit);
      return links.map((link) => {
        const img = link.querySelector('img');
        return {
          url: link.href,
          isReel: link.href.includes('/reel/'),
          alt: img ? img.getAttribute('alt') : '',
          image: img ? img.getAttribute('src') : null
        };
      });
    }, count);

    // Un pie de foto real por post: hay que abrir cada publicación porque
    // el grid del perfil no lo expone. Se reutiliza la misma pestaña para
    // no disparar el consumo de memoria con varios navegadores/páginas.
    const posts = [];
    for (const r of raw) {
      const date = parseDateFromAlt(r.alt);
      let text = '';
      let video = null;
      try {
        await page.goto(r.url, { waitUntil: 'networkidle2', timeout: 30000 });
        const ogDescription = await page.evaluate(() => {
          const meta = document.querySelector('meta[property="og:description"]');
          return meta ? meta.content : null;
        });
        text = parseCaption(ogDescription);

        if (r.isReel) {
          const html = await page.content();
          video = parseVideoUrl(html);
        }
      } catch (err) {
        console.error(`No se pudo leer la publicación ${r.url}:`, err.message);
      }

      posts.push({
        platform: 'instagram',
        type: r.isReel ? 'reel' : 'photo',
        url: r.url,
        image: r.image,
        video,
        date,
        text
      });
    }

    return {
      username,
      followers: parseFollowers(followersRaw),
      posts,
      fetchedAt: Date.now()
    };
  } finally {
    await browser.close();
  }
}

module.exports = scrapeInstagram;
