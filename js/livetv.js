// Live TV guide: which channels each live TV service carries, and what's on them.
// There is no free guide feed for streaming live TV services, so this uses each service's
// main national channels and TVmaze's free US schedule (api.tvmaze.com, no key needed).
// Local channels, regional sports and exact packages vary, so the app says so on screen.

// Channel groups, so the service lineups below stay short and readable.
const LOCALS = ['ABC', 'CBS', 'NBC', 'FOX', 'The CW', 'PBS'];
const NEWS = ['CNN', 'Fox News', 'MSNBC', 'CNBC', 'Fox Business'];
const SPORTS = ['ESPN', 'ESPN2', 'FS1', 'NFL Network', 'Golf Channel'];
const WBD = ['HGTV', 'Food Network', 'Discovery', 'TLC', 'ID', 'Animal Planet', 'Travel Channel', 'TNT', 'TBS', 'truTV'];
const NBCU = ['Bravo', 'E!', 'USA Network', 'Syfy', 'Oxygen'];
const DISNEY = ['FX', 'FXX', 'National Geographic', 'Disney Channel', 'Freeform'];
const PARAMOUNT = ['Comedy Central', 'Paramount Network', 'BET', 'MTV', 'VH1', 'CMT', 'Nickelodeon'];
const AE = ['A&E', 'History', 'Lifetime'];

export const LIVE_SERVICES = [
  { id: 'youtubetv', name: 'YouTube TV', short: 'YTTV', plan: 'Base plan',
    channels: [...LOCALS, 'Telemundo', ...NEWS, ...SPORTS, ...WBD, ...NBCU, ...DISNEY, ...PARAMOUNT, 'AMC', 'Cartoon Network', 'Hallmark Channel', 'BBC America', 'IFC'] },
  { id: 'hululive', name: 'Hulu + Live TV', short: 'Hulu', plan: 'Base plan',
    channels: ['ABC', 'CBS', 'NBC', 'FOX', ...NEWS, 'ESPN', 'ESPN2', 'FS1', ...WBD, ...NBCU, ...DISNEY, ...PARAMOUNT, ...AE, 'AMC', 'Cartoon Network'] },
  { id: 'sling', name: 'Sling TV', short: 'Sling', plan: 'Orange & Blue',
    channels: ['NBC', 'FOX', 'ABC', 'CNN', 'Fox News', 'MSNBC', 'ESPN', 'ESPN2', 'FS1', 'NFL Network', 'HGTV', 'Food Network', 'Discovery', 'TLC', 'ID', 'Travel Channel', 'TNT', 'TBS', ...NBCU, 'FX', 'National Geographic', 'Disney Channel', 'Freeform', 'Cartoon Network', 'Comedy Central', 'BET', ...AE, 'AMC', 'BBC America', 'IFC'] },
  { id: 'fubo', name: 'Fubo', short: 'Fubo', plan: 'Pro plan',
    channels: ['ABC', 'CBS', 'NBC', 'FOX', 'The CW', 'Telemundo', 'Univision', 'Fox News', 'MSNBC', 'CNBC', 'Fox Business', 'ESPN', 'ESPN2', 'FS1', 'NFL Network', 'Golf Channel',
      'HGTV', 'Food Network', 'Discovery', 'TLC', 'ID', 'Animal Planet', 'Travel Channel', ...NBCU, ...DISNEY, ...PARAMOUNT, ...AE, 'AMC', 'Hallmark Channel', 'BBC America'] },
  { id: 'directv', name: 'DirecTV Stream', short: 'DirecTV', plan: 'Choice plan',
    channels: [...LOCALS, 'ION', 'Univision', 'Telemundo', ...NEWS, ...SPORTS, ...WBD, ...NBCU, ...DISNEY, ...PARAMOUNT, ...AE, 'AMC', 'Cartoon Network', 'Hallmark Channel', 'BBC America', 'OWN', 'WE tv'] },
  { id: 'philo', name: 'Philo', short: 'Philo', plan: 'Core plan',
    channels: ['A&E', 'History', 'Lifetime', 'AMC', 'Animal Planet', 'BET', 'CMT', 'Comedy Central', 'Discovery', 'Food Network', 'HGTV', 'ID', 'MTV', 'Nickelodeon', 'Paramount Network', 'TLC', 'Travel Channel', 'VH1',
      'Hallmark Channel', 'Hallmark Mystery', 'OWN', 'Magnolia Network', 'BBC America', 'IFC', 'Sundance TV', 'WE tv', 'Game Show Network', 'Science'] },
  { id: 'frndly', name: 'Frndly TV', short: 'Frndly', plan: 'Basic plan',
    channels: ['Hallmark Channel', 'Hallmark Mystery', 'A&E', 'History', 'Lifetime', 'Game Show Network', 'INSP', 'Great American Family', 'Weather Channel'] },
  { id: 'cable', name: 'Cable or satellite', short: 'Cable', plan: 'Typical expanded package',
    channels: [...LOCALS, 'ION', 'Telemundo', 'Univision', ...NEWS, ...SPORTS, ...WBD, ...NBCU, ...DISNEY, ...PARAMOUNT, ...AE, 'AMC', 'Cartoon Network', 'Hallmark Channel', 'Hallmark Mystery', 'BBC America', 'OWN', 'WE tv', 'Weather Channel', 'Game Show Network', 'Magnolia Network'] },
].map((s) => ({ ...s, channels: [...new Set(s.channels)] }));

// Local channels: the broadcast stations in your area, free with an antenna and part of most
// live TV services. Always offered on the guide.
export const LOCAL = { id: 'local', name: 'Local channels', short: 'Local', plan: 'Over-the-air stations',
  channels: [...LOCALS, 'ION', 'MyNetworkTV', 'Telemundo', 'Univision'] };

export const liveService = (id) => (id === LOCAL.id ? LOCAL : LIVE_SERVICES.find((s) => s.id === id));

// Network names from TVmaze vary a little ("USA Network", "FOX News Channel", "ION Television").
// Compare on a simple key, and map a few names that differ more than that.
const ALIAS = {
  foxnews: ['foxnewschannel'], foxbusiness: ['foxbusinessnetwork'], nationalgeographic: ['natgeo', 'nationalgeographicchannel'],
  id: ['investigationdiscovery'], hallmarkmystery: ['hallmarkmoviesmysteries', 'hallmarkmoviesandmysteries'], hallmark: ['hallmarkchannel'],
  history: ['historychannel'], fs1: ['foxsports1'], golf: ['golfchannel'], ae: ['aenetwork', 'aenetworks'], cw: ['thecw'],
  sundance: ['sundancetv'], we: ['wetv'], gsn: ['gameshownetwork'], gameshow: ['gsn'], greatamericanfamily: ['gaf', 'greatamericanchannel'],
  weather: ['theweatherchannel'], magnolia: ['magnolianetwork'], science: ['sciencechannel'], ion: ['iontelevision'], mynetwork: ['mynetworktv'],
};
export function netKey(name) {
  const k = String(name || '').toLowerCase().replace(/&/g, '').replace(/\+/g, 'plus').replace(/[^a-z0-9]/g, '')
    .replace(/^the(?=.)/, '').replace(/(channel|network|television|tv)$/, '');
  for (const [base, alts] of Object.entries(ALIAS)) if (alts.includes(k)) return base;
  return k || String(name || '').toLowerCase();
}

// ---- Schedule from TVmaze ----
const CACHE_KEY = 'wt.livetv';
const FRESH_MS = 3 * 3600e3;
const cache = (() => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch { return {}; } })();
function saveCache() {
  // Keep only the days around today.
  const keep = new Set(guideDates());
  for (const d of Object.keys(cache)) if (!keep.has(d)) delete cache[d];
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* full */ }
}

// TVmaze's US schedule is by Eastern date. Yesterday covers shows still on after midnight
// (and West Coast times), tomorrow covers "Later" after midnight.
const etDate = (dt) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(dt);
export const guideDates = (now = Date.now()) => [-1, 0, 1].map((d) => etDate(new Date(now + d * 864e5)));

const slim = (e) => ({
  s: e.airstamp, r: e.runtime || e.show?.runtime || null, n: e.show?.name || e.name, ep: e.name && e.name !== e.show?.name ? e.name : '',
  se: e.season, no: e.number, ty: e.show?.type || '', net: e.show?.network?.name || '', img: e.show?.image?.medium || '', sid: e.show?.id,
});

async function day(date, fresh) {
  const hit = cache[date];
  if (hit && !fresh && Date.now() - hit.t < FRESH_MS) return hit.e;
  try {
    const res = await fetch(`https://api.tvmaze.com/schedule?country=US&date=${date}`);
    if (!res.ok) throw new Error(`TV schedule unavailable (${res.status})`);
    const e = (await res.json()).filter((x) => x.airstamp && x.show?.network).map(slim);
    cache[date] = { t: Date.now(), e };
    saveCache();
    return e;
  } catch (err) {
    if (hit) return hit.e; // offline: use what we had
    throw err;
  }
}

let loading = null;
export async function loadSchedule({ fresh = false } = {}) {
  if (!loading) loading = Promise.all(guideDates().map((d) => day(d, fresh))).then((days) => days.flat()).finally(() => { loading = null; });
  return loading;
}
export const scheduleCachedAt = () => Math.min(...guideDates().map((d) => cache[d]?.t || 0));

// ---- East or West Coast feed ----
// Broadcast and most cable channels replay the East Coast schedule three hours later on the
// West Coast feed. Live news and sports air at the same moment everywhere.
const WEST_ZONES = /^(America\/(Los_Angeles|Vancouver|Tijuana|Anchorage|Juneau|Sitka|Nome|Yakutat|Metlakatla|Whitehorse|Dawson)|Pacific\/Honolulu|US\/(Pacific|Alaska|Hawaii))$/;
export function defaultFeed() {
  try { return WEST_ZONES.test(Intl.DateTimeFormat().resolvedOptions().timeZone) ? 'west' : 'east'; } catch { return 'east'; }
}
const LIVE_TYPES = new Set(['News', 'Sports', 'Award Show']);

// Turn raw schedule entries into airings with start and end times, one list per channel key.
export function buildGuide(entries, feed = 'east') {
  const byNet = new Map();
  const seen = new Set();
  for (const e of entries) {
    let start = Date.parse(e.s);
    if (Number.isNaN(start)) continue;
    if (feed === 'west' && !LIVE_TYPES.has(e.ty)) start += 3 * 3600e3;
    const k = netKey(e.net);
    const dup = `${k}|${start}|${e.sid}`;
    if (seen.has(dup)) continue;
    seen.add(dup);
    if (!byNet.has(k)) byNet.set(k, []);
    byNet.get(k).push({ ...e, start });
  }
  for (const list of byNet.values()) {
    list.sort((a, b) => a.start - b.start);
    list.forEach((a, i) => {
      const next = list[i + 1]?.start;
      const byRuntime = a.r ? a.start + a.r * 60e3 : null;
      a.end = byRuntime && (!next || next <= a.start || byRuntime <= next) ? byRuntime : next && next > a.start ? Math.min(next, a.start + 4 * 3600e3) : a.start + 30 * 60e3;
    });
  }
  return byNet;
}
