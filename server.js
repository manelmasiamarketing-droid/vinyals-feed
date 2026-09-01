const express = require('express');
const scrapeInstagram = require('./lib/scrapeInstagram');
const scrapeLinkedIn = require('./lib/scrapeLinkedIn');
const { readCache, writeCache } = require('./lib/cache');

const PORT = process.env.PORT || 3000;
const IG_USERNAME = process.env.IG_USERNAME || 'vinals1906';
const LI_SLUG = process.env.LI_SLUG || 'vinalsgrupo';
const REFRESH_MS = Number(process.env.REFRESH_MS || 3 * 60 * 60 * 1000); // 3h

const IG_ICON =
  '<svg viewBox="0 0 24 24"><path d="M12 2.2c3.2 0 3.58.01 4.85.07 1.17.05 1.97.24 2.43.4a4.9 4.9 0 0 1 1.77 1.15 4.9 4.9 0 0 1 1.15 1.77c.16.46.35 1.26.4 2.43.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.24 1.97-.4 2.43a4.9 4.9 0 0 1-1.15 1.77 4.9 4.9 0 0 1-1.77 1.15c-.46.16-1.26.35-2.43.4-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.97-.24-2.43-.4a4.9 4.9 0 0 1-1.77-1.15 4.9 4.9 0 0 1-1.15-1.77c-.16-.46-.35-1.26-.4-2.43C2.21 15.58 2.2 15.2 2.2 12s.01-3.58.07-4.85c.05-1.17.24-1.97.4-2.43a4.9 4.9 0 0 1 1.15-1.77A4.9 4.9 0 0 1 5.59 1.8c.46-.16 1.26-.35 2.43-.4C9.29 1.34 9.67 1.33 12 1.33Zm0 3.05a5.7 5.7 0 1 0 0 11.4 5.7 5.7 0 0 0 0-11.4Zm0 9.4a3.7 3.7 0 1 1 0-7.4 3.7 3.7 0 0 1 0 7.4Zm5.9-9.62a1.33 1.33 0 1 1-2.66 0 1.33 1.33 0 0 1 2.66 0Z"/></svg>';
const LI_ICON =
  '<svg viewBox="0 0 24 24"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9.5h4v11H3v-11Zm7 0h3.8v1.5h.05c.53-.95 1.83-1.95 3.77-1.95 4.03 0 4.78 2.53 4.78 5.83v6.62h-4v-5.87c0-1.4-.03-3.2-1.98-3.2-1.98 0-2.28 1.5-2.28 3.1v5.97h-4v-11Z"/></svg>';
const IMG_PLACEHOLDER =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 16l-5-5-4 4-3-3-6 6"/></svg>';

let cache = readCache() || {
  updatedAt: 0,
  instagram: null,
  linkedin: null,
  errors: {}
};
let refreshing = false;

function isStale() {
  return Date.now() - cache.updatedAt > REFRESH_MS;
}

async function refresh() {
  if (refreshing) return;
  refreshing = true;

  const [ig, li] = await Promise.allSettled([
    scrapeInstagram(IG_USERNAME, { count: 2 }),
    scrapeLinkedIn(LI_SLUG, { count: 2 })
  ]);

  const errors = {};

  if (ig.status === 'fulfilled') {
    cache.instagram = ig.value;
  } else {
    errors.instagram = ig.reason.message;
    console.error('Instagram scrape falló:', ig.reason);
  }

  if (li.status === 'fulfilled') {
    cache.linkedin = li.value;
  } else {
    errors.linkedin = li.reason.message;
    console.error('LinkedIn scrape falló:', li.reason);
  }

  cache.updatedAt = Date.now();
  cache.errors = errors;
  writeCache(cache);
  refreshing = false;
}

function mergedPosts() {
  const ig = (cache.instagram?.posts || []).map((p) => ({
    ...p,
    name: `@${IG_USERNAME}`
  }));
  const li = (cache.linkedin?.posts || []).map((p) => ({
    ...p,
    name: 'GRUPO VIÑALS'
  }));

  const merged = [];
  const max = Math.max(ig.length, li.length);
  for (let i = 0; i < max; i++) {
    if (ig[i]) merged.push(ig[i]);
    if (li[i]) merged.push(li[i]);
  }
  return merged;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cardHtml(post) {
  const isIg = post.platform === 'instagram';
  const thumb = post.image
    ? `<img src="/img?u=${encodeURIComponent(post.image)}" alt="" loading="lazy">`
    : IMG_PLACEHOLDER;

  return `
    <article class="card">
      <div class="card-head">
        <span class="avatar ${isIg ? 'ig' : 'li'}">V</span>
        <div class="card-who">
          <div class="card-name">${escapeHtml(post.name)}</div>
          <div class="card-time">${escapeHtml(post.date)}</div>
        </div>
        <span class="plat-icon ${isIg ? 'ig' : 'li'}">${isIg ? IG_ICON : LI_ICON}</span>
      </div>
      <p class="card-text">${escapeHtml(post.text)}</p>
      <a class="read-more" href="${post.url}" target="_blank" rel="noopener">Leer más</a>
      <div class="thumb">${thumb}</div>
    </article>
  `;
}

function renderPage() {
  const posts = mergedPosts();
  const body = posts.length
    ? posts.map(cardHtml).join('\n')
    : `<p class="empty">No se pudieron cargar las publicaciones todavía. Vuelve a intentarlo en unos minutos.</p>`;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Viñals Feed</title>
<style>
  :root {
    --bg: #ffffff;
    --card-bg: #ffffff;
    --border: #e6e6e6;
    --shadow: rgba(24, 24, 24, 0.06);
    --text: #1c1e21;
    --text-muted: #8a8d91;
    --link: #385898;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #18191a; --card-bg: #242526; --border: #3a3b3c;
      --shadow: rgba(0, 0, 0, 0.4); --text: #e4e6eb; --text-muted: #b0b3b8; --link: #6ea8fe;
    }
  }
  :root[data-theme="dark"] {
    --bg: #18191a; --card-bg: #242526; --border: #3a3b3c;
    --shadow: rgba(0, 0, 0, 0.4); --text: #e4e6eb; --text-muted: #b0b3b8; --link: #6ea8fe;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--text);
    font: 400 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica Neue, Arial, sans-serif;
    padding: 24px 16px;
  }
  .feed { max-width: 420px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
  .card {
    background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px;
    box-shadow: 0 1px 3px var(--shadow); padding: 14px 16px 16px;
  }
  .card-head { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 10px; }
  .avatar {
    width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0;
    display: grid; place-items: center; color: #fff; font-weight: 700; font-size: 14px; background: #555;
  }
  .avatar.ig { background: linear-gradient(135deg, #f4b860, #d63a7a 55%, #7c3aab); }
  .avatar.li { background: #0a66c2; }
  .card-who { flex: 1; min-width: 0; }
  .card-name { font-weight: 700; font-size: 14px; }
  .card-time { font-size: 12.5px; color: var(--text-muted); }
  .plat-icon {
    width: 20px; height: 20px; border-radius: 6px; flex-shrink: 0; display: grid; place-items: center;
  }
  .plat-icon svg { width: 12px; height: 12px; fill: #fff; }
  .plat-icon.ig { background: linear-gradient(135deg, #f4b860, #d63a7a 55%, #7c3aab); }
  .plat-icon.li { background: #0a66c2; }
  .card-text { font-size: 14.5px; line-height: 1.5; margin: 0 0 4px; white-space: pre-wrap; }
  .read-more { color: var(--link); text-decoration: none; font-size: 14.5px; }
  .read-more:hover { text-decoration: underline; }
  .thumb {
    margin-top: 10px; border-radius: 6px; overflow: hidden; background: var(--border);
    aspect-ratio: 16 / 10; display: grid; place-items: center;
  }
  .thumb svg { width: 28px; height: 28px; opacity: 0.55; color: var(--text-muted); }
  .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .empty { max-width: 420px; margin: 40px auto; text-align: center; color: var(--text-muted); font-size: 14px; }
</style>
</head>
<body>
  <div class="feed">
    ${body}
  </div>
</body>
</html>`;
}

const app = express();

app.get('/', (req, res) => {
  if (isStale()) refresh().catch((err) => console.error('Refresh en segundo plano falló:', err));
  res.type('html').send(renderPage());
});

app.get('/api/feed', (req, res) => {
  res.json(cache);
});

app.get('/img', async (req, res) => {
  const u = req.query.u;
  if (typeof u !== 'string' || !u.startsWith('https://')) {
    return res.sendStatus(400);
  }
  try {
    const upstream = await fetch(u, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Referer: 'https://www.instagram.com/'
      }
    });
    if (!upstream.ok) return res.sendStatus(upstream.status);
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.set('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(buf);
  } catch (err) {
    console.error('Proxy de imagen falló:', err.message);
    res.sendStatus(502);
  }
});

app.listen(PORT, async () => {
  console.log(`Viñals feed escuchando en :${PORT}`);
  if (!cache.updatedAt || isStale()) {
    try {
      await refresh();
    } catch (err) {
      console.error('Refresh inicial falló:', err);
    }
  }
});
