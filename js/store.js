// Local storage for settings, the user's library, and cached updates.
// The library is the part that syncs to Google Drive.

const SETTINGS_KEY = 'wt.settings';
const LIBRARY_KEY = 'wt.library';
const UPDATES_KEY = 'wt.updates';

const DEFAULT_SETTINGS = {
  tmdbKey: '',          // TMDB v3 API key or v4 read access token. Stays on this device.
  googleClientId: '',   // OAuth web client ID from Google Cloud.
  region: 'US',         // Watch-provider region (ISO 3166-1).
  language: 'en-US',
  services: null,       // null = default rows (KNOWN_SERVICES in tmdb.js); otherwise TMDB provider IDs.
  autoSync: false,      // Set true once the user signs in with Google.
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

// Optional config.js can set window.WT_CONFIG = { tmdbKey, googleClientId } for a
// personal deployment. It is git-ignored so keys never get committed.
const fileConfig = (typeof window !== 'undefined' && window.WT_CONFIG) || {};

export function getSettings() {
  const saved = read(SETTINGS_KEY, {});
  const s = { ...DEFAULT_SETTINGS, ...saved };
  if (!s.tmdbKey && fileConfig.tmdbKey) s.tmdbKey = fileConfig.tmdbKey;
  if (!s.googleClientId && fileConfig.googleClientId) s.googleClientId = fileConfig.googleClientId;
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
//         rating: 0-5, followed: bool, addedAt, updatedAt, deleted? }

function emptyLibrary() {
  return { version: 1, updatedAt: 0, items: {}, seenUpdates: {} };
}
export function getLibrary() {
  const lib = read(LIBRARY_KEY, null) || emptyLibrary();
  lib.items ||= {};
  lib.seenUpdates ||= {};
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
  delete item.deleted;
  lib.items[key] = item;
  lib.updatedAt = now;
  setLibrary(lib);
  return item;
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
    out.items[k] = !x ? y : !y ? x : (y.updatedAt > x.updatedAt ? y : x);
  }
  out.seenUpdates = { ...(b.seenUpdates || {}), ...(a.seenUpdates || {}) };
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
