// Builds the in-app Updates feed: new seasons, premiere dates, new episodes, and
// movie releases for titles in My Lists. Runs when the app opens (throttled).
import { listItems, getLibrary, getUpdatesCache, setUpdatesCache } from './store.js';
import { tvLite, movieLite, MissingKeyError } from './tmdb.js';

const CHECK_EVERY_MS = 3 * 60 * 60 * 1000; // 3 hours
const RECENT_DAYS = 10;

const today = () => new Date().toISOString().slice(0, 10);
export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - start) / 864e5);
}

async function pool(items, limit, fn) {
  const out = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try { out[idx] = await fn(items[idx]); } catch (e) { out[idx] = { error: e }; }
    }
  });
  await Promise.all(workers);
  return out;
}

function tvEntries(item, show) {
  const base = { itemType: 'tv', id: item.id, title: item.title, poster: show.poster_path || item.poster };
  const entries = [];
  const t = today();
  const seasons = (show.seasons || []).filter((s) => s.season_number > 0);

  for (const s of seasons) {
    const n = s.season_number;
    const key = `tv:${item.id}:season:${n}`;
    if (!s.air_date) {
      entries.push({ ...base, key, what: `Season ${n} announced`, date: null, upcoming: true });
    } else if (s.air_date >= t) {
      entries.push({ ...base, key, what: `Season ${n} premieres`, date: s.air_date, upcoming: true });
    } else if (daysUntil(s.air_date) >= -RECENT_DAYS) {
      entries.push({ ...base, key, what: `Season ${n} is out`, date: s.air_date, upcoming: false });
    }
  }

  const next = show.next_episode_to_air;
  if (next?.air_date && next.episode_number !== 1) {
    entries.push({
      ...base,
      key: `tv:${item.id}:ep:${next.season_number}x${next.episode_number}`,
      what: `S${next.season_number} E${next.episode_number}${next.name ? ` · ${next.name}` : ''}`,
      date: next.air_date, upcoming: true,
    });
  }
  const last = show.last_episode_to_air;
  if (last?.air_date && daysUntil(last.air_date) <= 0 && daysUntil(last.air_date) >= -RECENT_DAYS && last.episode_number !== 1) {
    entries.push({
      ...base,
      key: `tv:${item.id}:ep:${last.season_number}x${last.episode_number}`,
      what: `New episode S${last.season_number} E${last.episode_number}${last.name ? ` · ${last.name}` : ''}`,
      date: last.air_date, upcoming: false,
    });
  }
  // Dedupe by key.
  return [...new Map(entries.map((e) => [e.key, e])).values()];
}

function movieEntries(item, movie) {
  const date = movie.release_date;
  if (!date) return [];
  const d = daysUntil(date);
  const base = { itemType: 'movie', id: item.id, title: item.title, poster: movie.poster_path || item.poster };
  if (d > 0) return [{ ...base, key: `movie:${item.id}:release`, what: 'In theaters', date, upcoming: true }];
  if (d >= -RECENT_DAYS) return [{ ...base, key: `movie:${item.id}:release`, what: 'Released', date, upcoming: false }];
  return [];
}

let running = null;
export function checkUpdates({ force = false } = {}) {
  if (running) return running;
  const cache = getUpdatesCache();
  if (!force && Date.now() - cache.checkedAt < CHECK_EVERY_MS) return Promise.resolve(cache);

  running = (async () => {
    const shows = listItems().filter((it) => it.type === 'tv' && it.followed);
    const movies = listItems().filter((it) => it.type === 'movie' && it.status !== 'watched' && it.followed !== false);
    const entries = [];
    let failures = 0;

    await pool(shows, 4, async (item) => {
      const show = await tvLite(item.id, { fresh: true });
      entries.push(...tvEntries(item, show));
    }).then((r) => { failures += r.filter((x) => x?.error).length; if (r.some((x) => x?.error instanceof MissingKeyError)) throw new MissingKeyError(); });

    await pool(movies, 4, async (item) => {
      const movie = await movieLite(item.id, { fresh: true });
      entries.push(...movieEntries(item, movie));
    }).then((r) => { failures += r.filter((x) => x?.error).length; });

    // Upcoming first (soonest first, undated last), then recent (newest first).
    entries.sort((a, b) => {
      if (a.upcoming !== b.upcoming) return a.upcoming ? -1 : 1;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.upcoming ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
    });
    const next = { checkedAt: Date.now(), entries, failures };
    setUpdatesCache(next);
    return next;
  })().finally(() => { running = null; });
  return running;
}

export function unseenCount() {
  const seen = getLibrary().seenUpdates;
  return getUpdatesCache().entries.filter((e) => !seen[e.key]).length;
}
