const cheerio = require('cheerio');

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// A diferencia de Instagram, LinkedIn incrusta el vídeo directamente en el
// HTML del servidor (sin login wall): un <video data-sources="[...]"> con
// varias calidades en JSON. Cogemos una intermedia, igual que en Instagram.
function parseVideoSources(sourcesRaw) {
  if (!sourcesRaw) return null;
  let sources;
  try {
    sources = JSON.parse(sourcesRaw);
  } catch {
    return null;
  }
  if (!Array.isArray(sources) || !sources.length) return null;
  sources.sort((a, b) => (a['data-bitrate'] || 0) - (b['data-bitrate'] || 0));
  return sources[Math.min(1, sources.length - 1)].src || null;
}

async function scrapeLinkedIn(slug, { count = 2 } = {}) {
  const res = await fetch(`https://www.linkedin.com/company/${slug}`, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept-Language': 'es-ES,es;q=0.9'
    }
  });

  if (!res.ok) {
    throw new Error(`LinkedIn respondió ${res.status}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const items = $('a[data-id="main-feed-card__full-link"]').slice(0, count);
  const posts = [];

  items.each((_, linkEl) => {
    const link = $(linkEl);
    const card = link.closest('li');
    const url = link.attr('href');
    const date = card.find('time').first().text().trim();
    const text = card
      .find('[data-test-id="main-feed-activity-card__commentary"]')
      .text()
      .trim();
    const videoEl = card
      .find('[data-test-id="feed-native-video-content"] video[data-sources]')
      .first();
    const video = parseVideoSources(videoEl.attr('data-sources'));
    const image = video
      ? videoEl.attr('data-poster-url') || null
      : card
          .find('[data-test-id="feed-images-content"] img[data-delayed-url]')
          .first()
          .attr('data-delayed-url') || null;

    posts.push({ platform: 'linkedin', url, date, text, image, video });
  });

  const bodyText = $('body').text();
  const followersMatch = bodyText.match(/([\d.,]+)\s+seguidores/);

  return {
    slug,
    followers: followersMatch ? followersMatch[1] : null,
    posts,
    fetchedAt: Date.now()
  };
}

module.exports = scrapeLinkedIn;
