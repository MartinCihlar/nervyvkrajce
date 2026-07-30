// Vrací nejnovější videa kanálu Nervy v krajce, rozdělená na epizody a shorts.
// API klíč zůstává na serveru; odpověď se cachuje na Vercel edge, takže se
// YouTube API volá řádově jednou za hodinu, ne jednou za návštěvníka.

const CHANNEL_ID = 'UCHKjl2FUGINKljeazp3yLAg';
// Uploads playlist = ID kanálu s "UC" přepsaným na "UU". Obsahuje všechna
// videa včetně shorts; systémové playlisty UULF/UUSH Data API spolehlivě neumí.
const UPLOADS_PLAYLIST = 'UU' + CHANNEL_ID.slice(2);

const SHORT_MAX_SECONDS = 180; // vše do 3 minut bereme jako short
const MAX_PAGES = 5; // strop 250 videí, ať jedno selhání nevyžere kvótu

async function yt(path, params, key) {
  const url = new URL('https://www.googleapis.com/youtube/v3/' + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('key', key);

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`YouTube ${path} → ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

// "PT1H2M10S" → 3730
function parseDuration(iso) {
  const m = /^P(?:\d+D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || '');
  if (!m) return 0;
  return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
}

function formatDuration(seconds) {
  if (!seconds) return '';
  if (seconds < 60) return `${seconds} s`;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

function pickThumb(thumbnails, videoId) {
  const t = thumbnails || {};
  const best = t.maxres || t.standard || t.high || t.medium || t.default;
  return best?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

// ID nahraných videí v pořadí od nejnovějšího
async function fetchUploadIds(key) {
  const ids = [];
  let pageToken;

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = {
      part: 'contentDetails',
      playlistId: UPLOADS_PLAYLIST,
      maxResults: '50'
    };
    if (pageToken) params.pageToken = pageToken;

    const data = await yt('playlistItems', params, key);
    for (const item of data.items || []) {
      const id = item.contentDetails?.videoId;
      if (id) ids.push(id);
    }

    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  return ids;
}

// videos.list bere max 50 ID naráz a nezaručuje pořadí → vracíme mapu
async function fetchVideoDetails(ids, key) {
  const byId = new Map();

  for (let i = 0; i < ids.length; i += 50) {
    const data = await yt(
      'videos',
      { part: 'snippet,contentDetails', id: ids.slice(i, i + 50).join(','), maxResults: '50' },
      key
    );
    for (const v of data.items || []) byId.set(v.id, v);
  }

  return byId;
}

export default async function handler(req, res) {
  const key = process.env.YOUTUBE_API_KEY;

  if (!key) {
    res.status(500).json({ error: 'Chybí proměnná prostředí YOUTUBE_API_KEY.' });
    return;
  }

  try {
    const ids = await fetchUploadIds(key);
    const details = await fetchVideoDetails(ids, key);

    const episodes = [];
    const shorts = [];

    // ids jsou od nejnovějšího, takže obě pole vyjdou seřazená stejně
    for (const id of ids) {
      const video = details.get(id);
      if (!video) continue; // smazané nebo soukromé video

      const seconds = parseDuration(video.contentDetails?.duration);
      const entry = {
        videoId: id,
        title: video.snippet?.title || '',
        thumb: pickThumb(video.snippet?.thumbnails, id),
        dur: formatDuration(seconds),
        seconds
      };

      (seconds > SHORT_MAX_SECONDS ? episodes : shorts).push(entry);
    }

    // Číslo epizody podle pořadí: nejstarší = #1, nejnovější = #<celkem>
    const total = episodes.length;
    episodes.forEach((ep, i) => {
      ep.num = '#' + (total - i);
    });

    // Edge cache: návštěvníci dostanou uloženou odpověď, na pozadí se obnovuje
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.status(200).json({
      episodes,
      shorts: shorts.slice(0, 12),
      total,
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    // Web má vlastní záložní data, takže chyba jen znamená "zůstane co bylo"
    console.error('episodes:', err);
    res.status(502).json({ error: String(err.message || err) });
  }
}
