// TMDB API client. Watch-provider data returned by TMDB is supplied by JustWatch.
import { getSettings } from './store.js';

const API = 'https://api.themoviedb.org/3';
export const IMG = 'https://image.tmdb.org/t/p/';

export class MissingKeyError extends Error {
  constructor() { super('Add your TMDB API key in Settings to load titles.'); this.name = 'MissingKeyError'; }
}

const memo = new Map();
const MEMO_MS = 10 * 60 * 1000;

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
  append_to_response: 'watch/providers,credits,external_ids',
});

export const tvLite = (id, opts) => tmdb(`/tv/${id}`, {}, opts);
export const movieLite = (id, opts) => tmdb(`/movie/${id}`, {}, opts);

let providerListCache = null;
export async function providerList() {
  if (providerListCache) return providerListCache;
  const { region } = getSettings();
  const [m, t] = await Promise.all([
    tmdb('/watch/providers/movie', { watch_region: region }),
    tmdb('/watch/providers/tv', { watch_region: region }),
  ]);
  const map = new Map();
  for (const p of [...(m.results || []), ...(t.results || [])]) {
    const prio = p.display_priorities?.[region] ?? p.display_priority ?? 999;
    const prev = map.get(p.provider_id);
    if (!prev || prio < prev.priority) map.set(p.provider_id, { id: p.provider_id, name: p.provider_name, logo: p.logo_path, priority: prio });
  }
  providerListCache = [...map.values()].sort((a, b) => a.priority - b.priority);
  return providerListCache;
}
export function clearProviderCache() { providerListCache = null; }
