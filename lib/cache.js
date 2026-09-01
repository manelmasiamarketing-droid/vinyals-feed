const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, '..', 'data', 'cache.json');

function readCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function writeCache(data) {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('No se pudo escribir la caché:', err.message);
  }
}

module.exports = { readCache, writeCache };
