// TMDB API client. Watch-provider data returned by TMDB is supplied by JustWatch.
import { getSettings } from './store.js';

const API = 'https://api.themoviedb.org/3';
export const IMG = 'https://image.tmdb.org/t/p/';

export class MissingKeyError extends Error {
  constructor() { super('Add your TMDB API key in Settings to load titles.'); this.name = 'MissingKeyError'; }
}

const memo = new Map();
const MEMO_MS = 10 * 60 * 1000;
export const clearMemo = () => memo.clear();

export async function tmdb(path, params = {}, { fresh = false } = {}) {
  const { tmdbKey, language } = getSettings();
  if (!tmdbKey) throw new MissingKeyError();
  const url = new URL(API + path);
  url.searchParams.set('language', language || 'en-US');
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);

  // A v4 "read access token" is a JWT; a v3 key is a 32-char hex string.
  const isBearer = tmdbKey.startsWith('eyJ');
  const headers = { accept: 'application/json' };
  if (isBearer) headers.authorization = `Bearer ${tmdbKey}`;
  else url.searchParams.set('api_key', tmdbKey);

  const cacheKey = url.toString();
  const hit = memo.get(cacheKey);
  if (!fresh && hit && Date.now() - hit.t < MEMO_MS) return hit.data;

  const res = await fetch(url, { headers });
  if (res.status === 401) throw new Error('TMDB rejected the API key. Check it in Settings.');
  if (!res.ok) throw new Error(`TMDB request failed (${res.status})`);
  const data = await res.json();
  memo.set(cacheKey, { t: Date.now(), data });
  return data;
}

export const img = (path, size = 'w342') => (path ? `${IMG}${size}${path}` : null);

// Normalise a movie/tv result into the fields the UI uses.
export function norm(r, fallbackType) {
  const type = r.media_type === 'movie' || r.media_type === 'tv' ? r.media_type : fallbackType;
  const date = type === 'tv' ? r.first_air_date : r.release_date;
  return {
    id: r.id,
    type,
    title: r.title || r.name || 'Untitled',
    poster: r.poster_path || null,
    backdrop: r.backdrop_path || null,
    date: date || '',
    year: date ? date.slice(0, 4) : '',
    vote: r.vote_average || 0,
    overview: r.overview || '',
    genres: r.genre_ids || (r.genres || []).map((g) => g.id),
  };
}

const results = (type) => (d) => (d.results || [])
  .filter((r) => !r.media_type || r.media_type === 'movie' || r.media_type === 'tv')
  .map((r) => norm(r, type));

export const trending = (window = 'week') => tmdb(`/trending/all/${window}`).then(results());
export const popular = (type) => tmdb(`/${type}/popular`).then(results(type));
export const upcomingMovies = () => {
  const { region } = getSettings();
  return tmdb('/movie/upcoming', { region }).then((d) => {
    const today = new Date().toISOString().slice(0, 10);
    return results('movie')(d).filter((m) => !m.date || m.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  });
};
export const onTheAirTV = () => tmdb('/tv/on_the_air').then(results('tv'));

export const byProvider = (type, providerId) => {
  const { region } = getSettings();
  return tmdb(`/discover/${type}`, {
    with_watch_providers: providerId,
    watch_region: region,
    with_watch_monetization_types: 'flatrate',
    sort_by: 'popularity.desc',
  }).then(results(type));
};

export const search = (query, page = 1) => tmdb('/search/multi', { query, page, include_adult: 'false' }).then(results());

export const details = (type, id) => tmdb(`/${type}/${id}`, {
  append_to_response: 'watch/providers,credits,external_ids,videos',
  include_video_language: `${(getSettings().language || 'en-US').slice(0, 2)},en,null`,
});

export const tvLite = (id, opts) => tmdb(`/tv/${id}`, {}, opts);
export const movieLite = (id, opts) => tmdb(`/movie/${id}`, {}, opts);

// Streaming services, matched by name because TMDB provider IDs can change.
// Each entry lists the names TMDB has used for that service. `row: true` means it
// gets a Discover row by default; the rest are listed first in Settings.
export const KNOWN_SERVICES = [
  { names: ['Netflix'], row: true },
  { names: ['Amazon Prime Video', 'Prime Video'], row: true },
  { names: ['Disney Plus', 'Disney+'], row: true },
  { names: ['Max', 'HBO Max'], row: true },
  { names: ['Hulu'], row: true },
  { names: ['Apple TV Plus', 'Apple TV+'], row: true },
  { names: ['Paramount Plus', 'Paramount+'], row: true },
  { names: ['Peacock Premium', 'Peacock'], row: true },
  { names: ['Tubi TV', 'Tubi'], row: true },
  { names: ['Pluto TV'], row: true },
  { names: ['YouTube TV'], row: true },
  { names: ['Angel Studios', 'Angel'], row: true },
  { names: ['Gaia'], row: true },
  { names: ['MGM Plus', 'MGM+', 'Epix'], row: true },
  { names: ['Starz'] },
  { names: ['AMC Plus', 'AMC+'] },
  { names: ['The Roku Channel', 'Roku Channel'] },
  { names: ['Crunchyroll'] },
  { names: ['Discovery Plus', 'Discovery+'] },
  { names: ['BritBox'] },
  { names: ['Acorn TV'] },
  { names: ['Shudder'] },
  { names: ['BET Plus', 'BET+'] },
  { names: ['Hallmark Movies Now', 'Hallmark+'] },
  { names: ['Criterion Channel', 'The Criterion Channel'] },
  { names: ['MUBI'] },
  { names: ['Plex'] },
  { names: ['Kanopy'] },
  { names: ['Hoopla'] },
  { names: ['Freevee', 'Amazon Freevee'] },
  { names: ['Fubo', 'fuboTV'] },
  { names: ['Sling TV'] },
  { names: ['Philo'] },
  { names: ['ESPN Plus', 'ESPN+'] },
  { names: ['Crackle'] },
  { names: ['PBS'] },
  { names: ['Sundance Now'] },
  { names: ['Hi-YAH', 'Hi-YAH!'] },
  { names: ['Dove Channel'] },
  { names: ['Great American Pure Flix', 'Pure Flix'] },
  { names: ['Hidive'] },
  { names: ['Shout! Factory TV'] },
  { names: ['Fandor'] },
  { names: ['Xumo Play', 'Xumo'] },
  { names: ['Fandango at Home Free', 'Vudu Free'] },
];

const normName = (n) => String(n).toLowerCase().replace(/\+/g, ' plus').replace(/[^a-z0-9]/g, '');

// TMDB lists the same service many times: "Paramount+ Amazon Channel", "Paramount Plus Apple TV Channel",
// "Paramount+ with Showtime", "Paramount Plus Essential", "Netflix Standard with Ads"... This is the main name.
export function baseServiceName(name) {
  let n = String(name).replace(/\s+/g, ' ').trim();
  const strip = (re) => { const x = n.replace(re, '').trim(); if (x) n = x; };
  strip(/\s+(via\s+)?(amazon|apple tv|roku premium|roku|youtube|prime video|amazon prime video)\s+channels?$/i);
  strip(/\s+apple tv$/i);
  strip(/\s*(basic|standard|essential|premium|premium plus|ad[- ]supported)?\s+with\s+(ads|showtime)$/i);
  strip(/\s+(essential|premium plus|premium|ad[- ]free|ad[- ]supported|basic|standard)$/i);
  return n;
}
const knownAlias = new Map(KNOWN_SERVICES.flatMap((k) => k.names.map((n) => [normName(n), k.names[0]])));
// One key per service, so all of a service's variants count as that service.
export function serviceKey(name) {
  const base = baseServiceName(name);
  return normName(knownAlias.get(normName(name)) || knownAlias.get(normName(base)) || base);
}

// For each known service, the matching provider from TMDB's list (or null).
export function matchKnown(list) {
  const byName = new Map(list.flatMap((p) => (p.names || [p.name]).map((n) => [normName(n), p])));
  return KNOWN_SERVICES.map((k) => ({ ...k, provider: k.names.map((n) => byName.get(normName(n))).find(Boolean) || null }));
}

// The providers that get a Discover row, in display order.
export async function selectedServices() {
  const { services } = getSettings();
  const list = await providerList();
  if (Array.isArray(services)) {
    // Saved ids may be any variant of a service (older versions listed them all).
    const byId = new Map(list.flatMap((p) => (p.ids || [p.id]).map((id) => [id, p])));
    return [...new Set(services.map((id) => byId.get(id)).filter(Boolean))];
  }
  return matchKnown(list).filter((k) => k.row && k.provider).map((k) => k.provider);
}

let providerListCache = null;
const PROVIDERS_KEY = (region) => `wt.providers2.${region}`;
export async function providerList() {
  if (providerListCache) return providerListCache;
  const { region } = getSettings();
  let m, t;
  try {
    [m, t] = await Promise.all([
      tmdb('/watch/providers/movie', { watch_region: region }),
      tmdb('/watch/providers/tv', { watch_region: region }),
    ]);
  } catch (e) {
    // Offline: fall back to the last list we saw.
    try {
      const saved = JSON.parse(localStorage.getItem(PROVIDERS_KEY(region)));
      if (saved?.length) return (providerListCache = saved);
    } catch { /* ignore */ }
    throw e;
  }
  const map = new Map();
  for (const p of [...(m.results || []), ...(t.results || [])]) {
    const prio = p.display_priorities?.[region] ?? p.display_priority ?? 999;
    const prev = map.get(p.provider_id);
    if (!prev || prio < prev.priority) map.set(p.provider_id, { id: p.provider_id, name: p.provider_name, logo: p.logo_path, priority: prio });
  }
  // Merge each service's variants into one entry: { id: main id, ids: every variant's id, name, names, logo, priority }.
  const groups = new Map();
  for (const p of [...map.values()].sort((a, b) => a.priority - b.priority)) {
    const k = serviceKey(p.name);
    const g = groups.get(k);
    if (!g) { groups.set(k, { ...p, ids: [p.id], names: [p.name], main: p }); continue; }
    g.ids.push(p.id); g.names.push(p.name);
    g.priority = Math.min(g.priority, p.priority);
    // The plainest name is the main one ("Paramount Plus", not "Paramount+ Amazon Channel").
    const plain = (x) => (baseServiceName(x.name) === x.name.trim() ? 0 : 1) * 1000 + x.name.length;
    if (plain(p) < plain(g.main)) g.main = p;
  }
  providerListCache = [...groups.values()].map(({ main, ...g }) => ({ ...g, id: main.id, name: baseServiceName(main.name), logo: main.logo }))
    .sort((a, b) => a.priority - b.priority);
  try { localStorage.setItem(PROVIDERS_KEY(region), JSON.stringify(providerListCache)); } catch { /* ignore */ }
  return providerListCache;
}
export function clearProviderCache() { providerListCache = null; }
