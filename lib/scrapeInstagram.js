const GRAPH_VERSION = 'v21.0';

function formatDate(timestamp) {
  if (!timestamp) return null;
  return new Date(timestamp).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

// API oficial de Instagram Graph (cuenta Business + token de un system user
// de Meta Business Manager) — sin navegador, sin bloqueo de IP.
// Requiere IG_ACCESS_TOKEN e IG_BUSINESS_ID como variables de entorno.
async function scrapeInstagram(username, { count = 6 } = {}) {
  const token = process.env.IG_ACCESS_TOKEN;
  const businessId = process.env.IG_BUSINESS_ID;

  if (!token || !businessId) {
    throw new Error('Faltan las variables de entorno IG_ACCESS_TOKEN / IG_BUSINESS_ID');
  }

  const fields = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp';
  const mediaRes = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${businessId}/media?fields=${fields}&limit=${count}&access_token=${token}`
  );
  const mediaData = await mediaRes.json();

  if (mediaData.error) {
    throw new Error(`Instagram Graph API (media): ${mediaData.error.message}`);
  }

  const posts = (mediaData.data || []).map((item) => {
    const isVideo = item.media_type === 'VIDEO';
    return {
      platform: 'instagram',
      type: isVideo ? 'reel' : 'photo',
      url: item.permalink,
      image: isVideo ? item.thumbnail_url || null : item.media_url || null,
      video: isVideo ? item.media_url || null : null,
      date: formatDate(item.timestamp),
      text: item.caption || ''
    };
  });

  const profileRes = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${businessId}?fields=followers_count&access_token=${token}`
  );
  const profileData = await profileRes.json();

  if (profileData.error) {
    throw new Error(`Instagram Graph API (profile): ${profileData.error.message}`);
  }

  return {
    username,
    followers: profileData.followers_count != null ? String(profileData.followers_count) : null,
    posts,
    fetchedAt: Date.now()
  };
}

module.exports = scrapeInstagram;
