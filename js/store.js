// Local storage for settings, the user's library, and cached updates.
// The library is the part that syncs to Google Drive.

const SETTINGS_KEY = 'wt.settings';
const LIBRARY_KEY = 'wt.library';
const UPDATES_KEY = 'wt.updates';
const SHOWINFO_KEY = 'wt.showinfo';

const DEFAULT_SETTINGS = {
  tmdbKey: '',          // TMDB v3 API key or v4 read access token. Stays on this device.
  googleClientId: '',   // OAuth web client ID from Google Cloud.
  region: 'US',         // Watch-provider region (ISO 3166-1).
  language: 'en-US',
  services: null,       // null = default rows (KNOWN_SERVICES in tmdb.js); otherwise TMDB provider IDs.
  autoSync: false,      // Set true once the user signs in with Google.
  name: '',             // Shown on the Me screen.
  genres: [],           // Genre names you like, used to filter Discover, Overview and the Library.
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { console.warn('Storage write failed', e); }
}

// config.js can set window.WT_CONFIG = { tmdbKey, googleClientId } for a deployment.
// Keys built in there take priority and hide their fields in Settings.
const fileConfig = (typeof window !== 'undefined' && window.WT_CONFIG) || {};
export const builtIn = { tmdb: !!fileConfig.tmdbKey, google: !!fileConfig.googleClientId };

export function getSettings() {
  const saved = read(SETTINGS_KEY, {});
  const s = { ...DEFAULT_SETTINGS, ...saved };
  if (fileConfig.tmdbKey) s.tmdbKey = fileConfig.tmdbKey;
  if (fileConfig.googleClientId) s.googleClientId = fileConfig.googleClientId;
  return s;
}
export function saveSettings(patch) {
  const next = { ...read(SETTINGS_KEY, {}), ...patch };
  write(SETTINGS_KEY, next);
  emit('settings');
  return getSettings();
}

// ---- Library ----
// Shape: { version: 1, updatedAt, items: { "tv:1399": Item }, seenUpdates: { key: ts } }
// Item: { key, id, type: 'movie'|'tv', title, poster, year, status: 'watchlist'|'watching'|'watched',
//         rating: 0-5, followed: bool, addedAt, updatedAt, deleted?,
//         lists: [list name], eps: ["1x3", ...] watched episodes (shows) }
// lib.listDefs: { name: { createdAt, updatedAt, deleted? } } for lists you create and name.

function emptyLibrary() {
  return { version: 1, updatedAt: 0, items: {}, seenUpdates: {}, listDefs: {} };
}
export function getLibrary() {
  const lib = read(LIBRARY_KEY, null) || emptyLibrary();
  lib.items ||= {};
  lib.seenUpdates ||= {};
  lib.listDefs ||= {};
  return lib;
}
export function setLibrary(lib, { silent = false } = {}) {
  write(LIBRARY_KEY, lib);
  if (!silent) emit('library');
}

export const itemKey = (type, id) => `${type}:${id}`;

export function getItem(type, id) {
  const it = getLibrary().items[itemKey(type, id)];
  return it && !it.deleted ? it : null;
}
export function listItems(status) {
  return Object.values(getLibrary().items)
    .filter((it) => !it.deleted && (!status || it.status === status))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function upsertItem(base, patch) {
  const lib = getLibrary();
  const key = itemKey(base.type, base.id);
  const now = Date.now();
  const prev = lib.items[key];
  const existing = prev && !prev.deleted ? prev : null;
  const item = {
    key, id: base.id, type: base.type,
    title: base.title, poster: base.poster ?? null, year: base.year ?? '',
    status: 'watchlist', rating: 0, followed: true,
    addedAt: now,
    ...existing,
    ...patch,
    updatedAt: now,
  };
  // Remember when something was finished, for the yearly count on Overview.
  if (item.status === 'watched' && existing?.status !== 'watched' && !patch.watchedAt) item.watchedAt = now;
  if (item.status === 'watching' && existing?.status !== 'watching' && !patch.startedAt) item.startedAt = now;
  delete item.deleted;
  lib.items[key] = item;
  lib.updatedAt = now;
  setLibrary(lib);
  return item;
}

// Add many titles at once (imports). Existing titles keep what you set in this app,
// except a Watchlist title moves to Watching or Watched if the import says so.
// Returns how many were added and updated.
export function bulkImport(list) {
  const lib = getLibrary();
  const now = Date.now();
  let added = 0, updated = 0;
  const rank = { watchlist: 0, watching: 1, watched: 2 };
  for (const inc of list) {
    const key = itemKey(inc.type, inc.id);
    const prev = lib.items[key];
    const cur = prev && !prev.deleted ? prev : null;
    if (!cur) {
      lib.items[key] = {
        key, id: inc.id, type: inc.type, title: inc.title, poster: inc.poster ?? null, year: inc.year ?? '',
        status: inc.status, rating: inc.rating || 0, followed: true, lists: inc.lists || [], ...(inc.eps?.length ? { eps: inc.eps } : {}), ...(inc.progress ? { progress: inc.progress } : {}),
        addedAt: inc.addedAt || inc.watchedAt || inc.startedAt || now,
        ...(inc.watchedAt ? { watchedAt: inc.watchedAt } : {}), ...(inc.startedAt ? { startedAt: inc.startedAt } : {}),
        source: 'trakt', updatedAt: now,
      };
      added++;
    } else {
      const next = { ...cur, lists: [...new Set([...(cur.lists || []), ...(inc.lists || [])])] };
      if (inc.eps?.length) next.eps = [...new Set([...(cur.eps || []), ...inc.eps])];
      if (inc.progress && !cur.progress) next.progress = inc.progress;
      if (rank[inc.status] > rank[cur.status] && cur.status === 'watchlist') {
        next.status = inc.status;
        if (inc.watchedAt) next.watchedAt = inc.watchedAt;
        if (inc.startedAt) next.startedAt = inc.startedAt;
      }
      if (!cur.rating && inc.rating) next.rating = inc.rating;
      if (JSON.stringify(next) !== JSON.stringify(cur)) { next.updatedAt = now; lib.items[key] = next; updated++; }
    }
  }
  for (const inc of list) for (const n of inc.lists || []) if (!lib.listDefs[n] || lib.listDefs[n].deleted) lib.listDefs[n] = { createdAt: now, updatedAt: now };
  lib.updatedAt = now;
  setLibrary(lib);
  return { added, updated };
}

// Quietly fill in details (posters, years) without changing when a title was last edited.
export function patchQuietly(patches) {
  const lib = getLibrary();
  for (const [key, patch] of patches) if (lib.items[key] && !lib.items[key].deleted) Object.assign(lib.items[key], patch, { updatedAt: (lib.items[key].updatedAt || 0) + 1 });
  setLibrary(lib);
}

export function removeItem(type, id) {
  const lib = getLibrary();
  const key = itemKey(type, id);
  if (!lib.items[key]) return;
  // Keep a tombstone so the delete syncs to other devices.
  lib.items[key] = { key, id, type, deleted: true, updatedAt: Date.now() };
  lib.updatedAt = Date.now();
  setLibrary(lib);
}

// ---- Episodes ----
// Mark episodes watched or not. Keeps the show's status in step:
// some watched = Watching, every aired episode watched = Watched.
export function setEpisodes(base, codes, watched, airedTotal) {
  const cur = getItem(base.type, base.id);
  const set = new Set(cur?.eps || []);
  for (const c of codes) watched ? set.add(c) : set.delete(c);
  const eps = [...set];
  const patch = { eps };
  if (airedTotal && eps.length >= airedTotal) patch.status = 'watched';
  else if (eps.length) { if (cur?.status !== 'watching') patch.status = 'watching'; }
  else if (cur?.status === 'watched' || cur?.status === 'watching') patch.status = 'watchlist';
  return upsertItem(base, patch);
}

// ---- Lists you name yourself ----
export function listNames() {
  const lib = getLibrary();
  const names = new Set(Object.entries(lib.listDefs).filter(([, d]) => !d.deleted).map(([n]) => n));
  for (const it of Object.values(lib.items)) if (!it.deleted) for (const n of it.lists || []) names.add(n);
  // Your own order first (dragged on the Lists screen), then anything new alphabetically.
  const order = lib.listOrder?.names || [];
  const pos = (n) => { const i = order.indexOf(n); return i < 0 ? Infinity : i; };
  return [...names].sort((a, b) => pos(a) - pos(b) || a.localeCompare(b));
}
export function setListOrder(names) {
  const lib = getLibrary();
  const now = Date.now();
  lib.listOrder = { names, updatedAt: now };
  lib.updatedAt = now;
  setLibrary(lib);
}
export function createList(name) {
  name = name.trim();
  if (!name) throw new Error('Give the list a name.');
  const lib = getLibrary();
  if (listNames().some((n) => n.toLowerCase() === name.toLowerCase())) throw new Error(`You already have a list called ${name}.`);
  const now = Date.now();
  lib.listDefs[name] = { createdAt: now, updatedAt: now };
  lib.updatedAt = now;
  setLibrary(lib);
}
export function renameList(from, to) {
  to = to.trim();
  if (!to || to === from) return;
  if (listNames().some((n) => n !== from && n.toLowerCase() === to.toLowerCase())) throw new Error(`You already have a list called ${to}.`);
  const lib = getLibrary();
  const now = Date.now();
  lib.listDefs[from] = { ...(lib.listDefs[from] || { createdAt: now }), deleted: true, updatedAt: now };
  lib.listDefs[to] = { createdAt: now, updatedAt: now };
  if (lib.listOrder?.names) lib.listOrder = { names: lib.listOrder.names.map((n) => (n === from ? to : n)), updatedAt: now };
  for (const it of Object.values(lib.items)) if (!it.deleted && it.lists?.includes(from)) { it.lists = it.lists.map((n) => (n === from ? to : n)); it.updatedAt = now; }
  lib.updatedAt = now;
  setLibrary(lib);
}
export function deleteList(name) {
  const lib = getLibrary();
  const now = Date.now();
  lib.listDefs[name] = { ...(lib.listDefs[name] || { createdAt: now }), deleted: true, updatedAt: now };
  for (const it of Object.values(lib.items)) if (!it.deleted && it.lists?.includes(name)) { it.lists = it.lists.filter((n) => n !== name); it.updatedAt = now; }
  lib.updatedAt = now;
  setLibrary(lib);
}
export function toggleInList(base, name) {
  const cur = getItem(base.type, base.id);
  const lists = new Set(cur?.lists || []);
  lists.has(name) ? lists.delete(name) : lists.add(name);
  return upsertItem(base, { lists: [...lists] });
}

// ---- Show info (episode counts per season), cached on this device ----
export function getShowInfo(id) { return read(SHOWINFO_KEY, {})[id] || null; }
export function allShowInfo() { return read(SHOWINFO_KEY, {}); }
// From a TMDB /tv/{id} response: aired episodes per season (specials left out).
export function saveShowInfo(show) {
  if (!show?.id || !Array.isArray(show.seasons)) return;
  const last = show.last_episode_to_air;
  const seasons = {};
  let aired = 0, total = 0;
  for (const s of show.seasons) {
    if (!s.season_number) continue;
    const count = s.episode_count || 0;
    let a = 0;
    if (last) a = s.season_number < last.season_number ? count : s.season_number === last.season_number ? Math.min(count || last.episode_number, last.episode_number) : 0;
    seasons[s.season_number] = { count, aired: a };
    aired += a; total += count;
  }
  const all = read(SHOWINFO_KEY, {});
  // Typical episode length in minutes, for "time left" estimates.
  const runtime = (show.episode_run_time || []).find(Boolean) || show.last_episode_to_air?.runtime || show.next_episode_to_air?.runtime || 0;
  all[show.id] = { seasons, aired, total, runtime, status: show.status || '', genres: (show.genres || []).map((g) => g.id), t: Date.now() };
  write(SHOWINFO_KEY, all);
}

export function markUpdatesSeen(keys) {
  const lib = getLibrary();
  let changed = false;
  for (const k of keys) {
    if (!lib.seenUpdates[k]) { lib.seenUpdates[k] = Date.now(); changed = true; }
  }
  if (changed) { lib.updatedAt = Date.now(); setLibrary(lib); }
}

// Merge two libraries: per-item last-write-wins, union of seen updates.
export function mergeLibraries(a, b) {
  const out = emptyLibrary();
  const keys = new Set([...Object.keys(a.items || {}), ...Object.keys(b.items || {})]);
  for (const k of keys) {
    const x = a.items?.[k];
    const y = b.items?.[k];
    let win = !x ? y : !y ? x : (y.updatedAt > x.updatedAt ? y : x);
    // A copy without episode detail (from an older version of the app) must not wipe out watched episodes.
    const other = win === x ? y : x;
    if (win && other && !win.deleted && !other.deleted && !win.eps?.length && other.eps?.length) win = { ...win, eps: other.eps };
    out.items[k] = win;
  }
  out.seenUpdates = { ...(b.seenUpdates || {}), ...(a.seenUpdates || {}) };
  for (const k of new Set([...Object.keys(a.listDefs || {}), ...Object.keys(b.listDefs || {})])) {
    const x = a.listDefs?.[k], y = b.listDefs?.[k];
    out.listDefs[k] = !x ? y : !y ? x : (y.updatedAt > x.updatedAt ? y : x);
  }
  const oa = a.listOrder, ob = b.listOrder;
  if (oa || ob) out.listOrder = !oa ? ob : !ob ? oa : (ob.updatedAt > oa.updatedAt ? ob : oa);
  // Drop seen markers and tombstones older than 180 days to keep the file small.
  const cutoff = Date.now() - 180 * 864e5;
  for (const [k, ts] of Object.entries(out.seenUpdates)) if (ts < cutoff) delete out.seenUpdates[k];
  for (const [k, it] of Object.entries(out.items)) if (it.deleted && it.updatedAt < cutoff) delete out.items[k];
  out.updatedAt = Math.max(a.updatedAt || 0, b.updatedAt || 0);
  return out;
}

// ---- Updates cache ----
export function getUpdatesCache() {
  return read(UPDATES_KEY, { checkedAt: 0, entries: [] });
}
export function setUpdatesCache(cache) {
  write(UPDATES_KEY, cache);
  emit('updates');
}

// ---- Tiny event bus ----
const listeners = {};
export function on(evt, fn) { (listeners[evt] ||= new Set()).add(fn); return () => listeners[evt].delete(fn); }
export function emit(evt, data) { listeners[evt]?.forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } }); }

// ---- Export / import (manual backup) ----
export function exportJSON() {
  return JSON.stringify(getLibrary(), null, 2);
}
export function importJSON(text) {
  const incoming = JSON.parse(text);
  if (!incoming || typeof incoming.items !== 'object') throw new Error('Not a Movie & Show Tracker backup file');
  setLibrary(mergeLibraries(getLibrary(), incoming));
}
