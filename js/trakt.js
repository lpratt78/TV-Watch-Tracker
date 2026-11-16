// Import a Trakt data export (the .zip from trakt.tv Settings > Data, or its JSON files).
// Trakt items carry TMDB ids, so every title matches exactly.

// ---- Minimal zip reader (stored or deflated entries) using the browser's DecompressionStream ----
async function inflateRaw(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
export async function readZip(buffer) {
  const u8 = new Uint8Array(buffer);
  const dv = new DataView(buffer);
  // Find the end-of-central-directory record.
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("That file isn't a zip file.");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const files = {};
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!name.endsWith('.json')) continue;
    const lNameLen = dv.getUint16(local + 26, true);
    const lExtraLen = dv.getUint16(local + 28, true);
    const start = local + 30 + lNameLen + lExtraLen;
    const data = u8.subarray(start, start + csize);
    let raw;
    if (method === 0) raw = data;
    else if (method === 8) raw = await inflateRaw(data);
    else continue;
    files[name.split('/').pop()] = dec.decode(raw);
  }
  return files;
}

// Turn a { filename: jsonText } map into a list of library items.
export function parseTrakt(files) {
  const json = (name) => { try { return files[name] ? JSON.parse(files[name]) : []; } catch { return []; } };
  const names = Object.keys(files);
  if (!names.some((n) => /^(watched-|lists-|ratings-)/.test(n))) throw new Error("That doesn't look like a Trakt export. Use the zip from trakt.tv Settings > Data.");

  const items = new Map(); // key -> item
  const ts = (iso) => (iso ? Date.parse(iso) : undefined);
  const put = (type, obj, patch) => {
    const id = obj?.ids?.tmdb;
    if (!id) return null;
    const key = `${type}:${id}`;
    const prev = items.get(key) || { type, id, title: obj.title || 'Untitled', year: obj.year ? String(obj.year) : '', poster: null, lists: [] };
    const next = { ...prev, ...patch };
    items.set(key, next);
    return next;
  };

  // Episode history: unique episodes watched per show, plus first and last watch times.
  const history = names.filter((n) => /^watched-history-\d+\.json$/.test(n)).flatMap(json);
  const eps = new Map();
  const firstSeen = new Map();
  for (const h of history) {
    if (h.type !== 'episode' || !h.show?.ids?.tmdb) continue;
    const id = h.show.ids.tmdb;
    if (!eps.has(id)) eps.set(id, new Set());
    eps.get(id).add(`${h.episode.season}x${h.episode.number}`);
    const t = ts(h.watched_at);
    if (t && (!firstSeen.has(id) || t < firstSeen.get(id))) firstSeen.set(id, t);
  }

  // Watched movies.
  for (const m of json('watched-movies.json')) put('movie', m.movie, { status: 'watched', watchedAt: ts(m.last_watched_at) });

  // Watched shows: caught up on every aired episode = Watched, otherwise Watching.
  for (const s of json('watched-shows.json')) {
    const id = s.show?.ids?.tmdb;
    const aired = s.show?.aired_episodes || 0;
    const seen = eps.get(id)?.size ?? (s.seasons || []).reduce((n, se) => n + (se.episodes || []).length, 0);
    const caughtUp = aired > 0 && seen >= aired;
    put('tv', s.show, {
      status: caughtUp ? 'watched' : 'watching',
      watchedAt: caughtUp ? ts(s.last_watched_at) : undefined,
      startedAt: firstSeen.get(id),
      progress: { seen, aired },
    });
  }

  // Watchlist.
  for (const w of [...json('lists-watchlist.json'), ...json('watchlist.json')]) {
    const type = w.type === 'show' ? 'tv' : w.type;
    if (type !== 'movie' && type !== 'tv') continue;
    const cur = items.get(`${type}:${w[w.type]?.ids?.tmdb}`);
    if (!cur?.status) put(type, w[w.type], { status: 'watchlist' });
  }

  // Custom lists: remember which list each title is on; anything not watched goes on the Watchlist.
  const listMeta = json('lists-lists.json');
  for (const name of names.filter((n) => /^lists-list-\d+/.test(n))) {
    const traktId = Number(name.match(/^lists-list-(\d+)/)[1]);
    const listName = listMeta.find((l) => l.ids?.trakt === traktId)?.name || name.replace(/^lists-list-\d+-|\.json$/g, '').replace(/-/g, ' ');
    for (const it of json(name)) {
      const type = it.type === 'show' ? 'tv' : it.type;
      if (type !== 'movie' && type !== 'tv') continue;
      const obj = it[it.type];
      const cur = items.get(`${type}:${obj?.ids?.tmdb}`);
      const listed = put(type, obj, { status: cur?.status || 'watchlist', addedAt: cur?.addedAt || ts(it.listed_at) });
      if (listed && !listed.lists.includes(listName)) listed.lists.push(listName);
      if (it.my_rating && listed && !listed.rating) listed.rating = Math.max(1, Math.round(it.my_rating / 2));
    }
  }

  // Ratings (1-10 on Trakt, 1-5 stars here).
  for (const [file, type, field] of [['ratings-movies.json', 'movie', 'movie'], ['ratings-shows.json', 'tv', 'show']]) {
    for (const r of json(file)) {
      const cur = items.get(`${type}:${r[field]?.ids?.tmdb}`);
      put(type, r[field], { rating: Math.max(1, Math.round(r.rating / 2)), status: cur?.status || 'watched' });
    }
  }

  return [...items.values()].filter((i) => i.status);
}

export function summarize(list) {
  const c = { total: list.length, watched: 0, watching: 0, watchlist: 0, movies: 0, shows: 0, rated: 0 };
  for (const i of list) { c[i.status]++; c[i.type === 'tv' ? 'shows' : 'movies']++; if (i.rating) c.rated++; }
  return c;
}
