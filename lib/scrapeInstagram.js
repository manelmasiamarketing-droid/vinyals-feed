const puppeteer = require('puppeteer-core');

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// El alt text que genera Instagram tiene forma:
// "Photo by Viñals on August 30, 2026. Puede ser una imagen de osobuco, filete..."
function parseAlt(alt) {
  const match = alt && alt.match(/on ([A-Za-z]+ \d{1,2}, \d{4})\.\s*(.*)$/s);
  if (!match) return { date: null, description: alt || '' };
  return {
    date: match[1],
    description: match[2].replace(/^Puede ser una imagen de\s*/i, '').trim()
  };
}

function parseFollowers(metaDescription) {
  if (!metaDescription) return null;
  const match = metaDescription.match(/^([\d.,]+)\s+\S+/);
  return match ? match[1] : null;
}

async function scrapeInstagram(username, { count = 2 } = {}) {
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);
    await page.setViewport({ width: 1280, height: 1000 });

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

    const posts = raw.map((r) => {
      const { date, description } = parseAlt(r.alt);
      return {
        platform: 'instagram',
        type: r.isReel ? 'reel' : 'photo',
        url: r.url,
        image: r.image,
        date,
        text: description
      };
    });

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
