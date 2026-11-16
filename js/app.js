import * as store from './store.js';
import * as T from './tmdb.js';
import { checkUpdates, unseenCount, daysUntil } from './updates.js';
import * as sync from './sync.js';

const APP_VERSION = '0.1.1';
const view = document.getElementById('view');
const titleEl = document.getElementById('page-title');

// ---------- helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, root = view) => root.querySelector(sel);
const $$ = (sel, root = view) => [...root.querySelectorAll(sel)];
const STATUS_LABEL = { watchlist: 'Watchlist', watching: 'Watching', watched: 'Watched' };
const STAR = '<svg viewBox="0 0 24 24"><path d="m12 17.3 6.2 3.7-1.6-7 5.4-4.7-7.1-.6L12 2 9.1 8.7 2 9.3l5.4 4.7-1.6 7z"/></svg>';

function toast(msg, ms = 2600) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, ms);
}

function fmtDate(d) {
  if (!d) return 'Date TBA';
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function posterHTML(path, title, size = 'w342') {
  const src = T.img(path, size);
  return src ? `<img loading="lazy" src="${esc(src)}" alt="">` : `<span class="pad">${esc(title)}</span>`;
}

function card(t) {
  const lib = store.getItem(t.type, t.id);
  const chip = lib ? `<span class="chip accent">${esc(STATUS_LABEL[lib.status])}</span>` : '';
  const sub = [t.type === 'tv' ? 'TV' : 'Movie', t.year].filter(Boolean).join(' · ');
  return `<a class="card" href="#/title/${t.type}/${t.id}">
    <div class="poster">${posterHTML(t.poster, t.title)}${chip}</div>
    <div class="t">${esc(t.title)}</div><div class="s">${esc(sub)}</div></a>`;
}
const skeletons = (n = 8) => Array.from({ length: n }, () => '<div class="card skeleton"><div class="poster"></div><div class="t">&nbsp;</div></div>').join('');

function missingKeyPanel() {
  return `<div class="panel"><h2>Add your TMDB key</h2>
    <p class="muted">Movie &amp; Show Tracker gets movie and show info from TMDB. Paste your free personal API key in Settings to get started. It stays on this device.</p>
    <a class="btn primary" href="#/settings">Open Settings</a></div>`;
}
function errorPanel(e) {
  if (e instanceof T.MissingKeyError) return missingKeyPanel();
  const msg = navigator.onLine ? e.message : "You're offline. Titles you've opened before are still available.";
  return `<div class="panel"><p>${esc(msg)}</p><button class="btn" data-retry>Try again</button></div>`;
}

// ---------- router ----------
const routes = {
  discover: renderDiscover,
  search: renderSearch,
  lists: renderLists,
  updates: renderUpdates,
  settings: renderSettings,
  about: renderAbout,
  title: renderTitle,
};
let currentRoute = '';

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '') || 'discover';
  const [path, qs] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  return { name: parts[0], args: parts.slice(1), query: new URLSearchParams(qs || '') };
}

async function route() {
  const r = parseHash();
  const fn = routes[r.name] || renderDiscover;
  currentRoute = r.name;
  document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === r.name));
  view.innerHTML = '';
  window.scrollTo(0, 0);
  try { await fn(r); } catch (e) { console.error(e); view.innerHTML = errorPanel(e); }
}
view.addEventListener('click', (e) => { if (e.target.closest('[data-retry]')) route(); });
window.addEventListener('hashchange', route);

// ---------- Discover ----------

async function renderDiscover() {
  titleEl.textContent = 'Discover';
  const s = store.getSettings();
  if (!s.tmdbKey) { view.innerHTML = missingKeyPanel(); return; }

  let services = [];
  try { services = await T.selectedServices(); } catch { /* offline with no saved list */ }

  const rows = [
    { title: 'Trending this week', load: () => T.trending('week') },
    { title: 'Popular movies', load: () => T.popular('movie') },
    { title: 'Popular shows', load: () => T.popular('tv') },
    { title: 'Coming soon to theaters', load: () => T.upcomingMovies() },
    { title: 'New episodes this week', load: () => T.onTheAirTV() },
    ...services.map((p) => {
      const id = p.id;
      return {
        title: p.name,
        logo: p.logo,
        load: async () => {
          const [m, t] = await Promise.all([T.byProvider('movie', id), T.byProvider('tv', id)]);
          const out = [];
          for (let i = 0; i < Math.max(m.length, t.length); i++) { if (t[i]) out.push(t[i]); if (m[i]) out.push(m[i]); }
          return out;
        },
      };
    }),
  ];

  view.innerHTML = rows.map((r, i) => `<section class="row" data-row="${i}">
    <h2>${r.logo ? `<img src="${esc(T.img(r.logo, 'w92'))}" alt="">` : ''}${esc(r.title)}</h2>
    <div class="scroller">${skeletons()}</div></section>`).join('');

  // Load rows as they scroll near the viewport.
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      io.unobserve(en.target);
      const r = rows[Number(en.target.dataset.row)];
      const sc = $('.scroller', en.target);
      r.load().then((items) => {
        sc.innerHTML = items.length ? items.slice(0, 20).map(card).join('') : '<p class="muted pad">Nothing here right now.</p>';
      }).catch((e) => { sc.outerHTML = `<div>${errorPanel(e)}</div>`; });
    }
  }, { rootMargin: '400px 0px' });
  $$('.row').forEach((el) => io.observe(el));
}

// ---------- Search ----------
async function renderSearch(r) {
  titleEl.textContent = 'Search';
  const q = r.query.get('q') || '';
  view.innerHTML = `<div class="pad" style="margin-bottom:14px">
      <input id="q" type="search" placeholder="Search movies and shows" value="${esc(q)}" autocomplete="off" enterkeyhint="search">
    </div><div id="results"></div>`;
  const input = $('#q');
  const out = $('#results');
  if (!store.getSettings().tmdbKey) { out.innerHTML = missingKeyPanel(); return; }

  let seq = 0;
  async function run(term) {
    const my = ++seq;
    history.replaceState(null, '', term ? `#/search?q=${encodeURIComponent(term)}` : '#/search');
    if (!term.trim()) { out.innerHTML = '<p class="empty">Find a movie or show to add to your lists.</p>'; return; }
    out.innerHTML = `<div class="grid">${skeletons(6)}</div>`;
    try {
      const res = await T.search(term.trim());
      if (my !== seq) return;
      out.innerHTML = res.length ? `<div class="grid">${res.map(card).join('')}</div>` : `<p class="empty">No results for “${esc(term)}”.</p>`;
    } catch (e) { if (my === seq) out.innerHTML = errorPanel(e); }
  }
  let t;
  input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => run(input.value), 350); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { clearTimeout(t); run(input.value); input.blur(); } });
  run(q);
  if (!q) input.focus();
}

// ---------- Title details ----------
async function renderTitle(r) {
  const [type, idStr] = r.args;
  const id = Number(idStr);
  if (!['movie', 'tv'].includes(type) || !id) { location.hash = '#/discover'; return; }
  titleEl.textContent = type === 'tv' ? 'Show' : 'Movie';
  const lib = store.getItem(type, id);
  view.innerHTML = `<div class="detail-body"><p class="muted">Loading${lib ? ` ${esc(lib.title)}` : ''}…</p></div>`;

  const d = await T.details(type, id);
  const t = T.norm(d, type);
  const year = t.year;
  const runtime = type === 'movie'
    ? (d.runtime ? `${Math.floor(d.runtime / 60)}h ${d.runtime % 60}m` : '')
    : (d.number_of_seasons ? `${d.number_of_seasons} season${d.number_of_seasons > 1 ? 's' : ''}` : '');
  const meta = [type === 'tv' ? 'TV' : 'Movie', year, runtime, (d.genres || []).slice(0, 3).map((g) => g.name).join(', ')].filter(Boolean).join(' · ');
  const vote = d.vote_average ? `TMDB ${d.vote_average.toFixed(1)}/10` : '';
  const statusLine = type === 'tv' && d.status ? d.status : '';

  const region = store.getSettings().region;
  const wp = d['watch/providers']?.results?.[region];
  const groups = [['flatrate', 'Stream'], ['free', 'Free'], ['ads', 'Free with ads'], ['rent', 'Rent'], ['buy', 'Buy']]
    .filter(([k]) => wp?.[k]?.length)
    .map(([k, label]) => `<div class="provider-group"><div class="label">${label}</div><div class="providers">
      ${wp[k].map((p) => `<a href="${esc(wp.link)}" target="_blank" rel="noopener" title="${esc(p.provider_name)}"><img src="${esc(T.img(p.logo_path, 'w92'))}" alt="${esc(p.provider_name)}"></a>`).join('')}
    </div></div>`).join('');
  const whereHTML = groups
    ? `${groups}<div class="attribution">Streaming info from <a href="https://www.justwatch.com" target="_blank" rel="noopener">JustWatch</a> via TMDB · region ${esc(region)}</div>`
    : `<p class="muted small">No streaming info for region ${esc(region)} yet.</p><div class="attribution">Streaming info from <a href="https://www.justwatch.com" target="_blank" rel="noopener">JustWatch</a> via TMDB</div>`;

  const seasons = type === 'tv' ? (d.seasons || []).filter((s) => s.season_number > 0) : [];
  const nextEp = d.next_episode_to_air;
  const cast = (d.credits?.cast || []).slice(0, 15);

  view.innerHTML = `
    <div class="backdrop">${d.backdrop_path ? `<img src="${esc(T.img(d.backdrop_path, 'w1280'))}" alt="">` : ''}</div>
    <div class="detail-head">
      <div class="poster">${posterHTML(t.poster, t.title)}</div>
      <div><h2>${esc(t.title)}</h2><div class="detail-meta">${esc(meta)}</div>
        <div class="detail-meta">${esc([vote, statusLine].filter(Boolean).join(' · '))}</div></div>
    </div>
    <div class="detail-body">
      <div id="actions"></div>
      ${nextEp?.air_date ? `<div class="panel" style="margin:16px 0 0"><b>Next episode:</b> S${nextEp.season_number} E${nextEp.episode_number} · ${esc(fmtDate(nextEp.air_date))} ${countdownText(nextEp.air_date)}</div>` : ''}
      ${type === 'movie' && d.release_date && daysUntil(d.release_date) > 0 ? `<div class="panel" style="margin:16px 0 0"><b>Releases</b> ${esc(fmtDate(d.release_date))} ${countdownText(d.release_date)}</div>` : ''}
      ${d.tagline ? `<p class="muted"><i>${esc(d.tagline)}</i></p>` : ''}
      <p>${esc(d.overview || 'No overview available.')}</p>
      <h3>Where to watch</h3>${whereHTML}
      ${seasons.length ? `<h3>Seasons</h3>${seasons.map((s) => `<div class="small" style="padding:4px 0">${esc(s.name)} · ${s.episode_count || '?'} episodes · <span class="muted">${esc(fmtDate(s.air_date))}</span></div>`).join('')}` : ''}
      ${cast.length ? `<h3>Cast</h3><div class="cast">${cast.map((c) => `<div>${c.profile_path ? `<img loading="lazy" src="${esc(T.img(c.profile_path, 'w185'))}" alt="">` : '<span class="ph"></span>'}<b>${esc(c.name)}</b><br><span class="muted">${esc(c.character || '')}</span></div>`).join('')}</div>` : ''}
      <p class="attribution" style="margin-top:24px"><a href="https://www.themoviedb.org/${type}/${id}" target="_blank" rel="noopener">View on TMDB</a></p>
    </div>`;

  const base = { id, type, title: t.title, poster: t.poster, year: t.year };
  const actions = $('#actions');
  function drawActions() {
    const it = store.getItem(type, id);
    actions.innerHTML = `
      <div class="btn-row">
        ${Object.entries(STATUS_LABEL).map(([k, label]) => `<button class="btn ${it?.status === k ? 'on' : ''}" data-status="${k}">${label}</button>`).join('')}
      </div>
      <div style="display:flex;align-items:center;gap:12px;margin-top:12px;flex-wrap:wrap">
        <div class="stars" role="group" aria-label="Your rating">${[1, 2, 3, 4, 5].map((n) => `<button class="${(it?.rating || 0) >= n ? 'on' : ''}" data-rate="${n}" aria-label="${n} star${n > 1 ? 's' : ''}">${STAR}</button>`).join('')}</div>
        ${it ? `<button class="btn ${it.followed ? 'on' : ''}" data-follow>${it.followed ? 'Following updates' : 'Follow updates'}</button>
               <button class="btn danger" data-remove>Remove</button>` : ''}
      </div>`;
  }
  drawActions();
  actions.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const it = store.getItem(type, id);
    if (b.dataset.status) {
      store.upsertItem(base, { status: b.dataset.status });
      toast(`Added to ${STATUS_LABEL[b.dataset.status]}`);
    } else if (b.dataset.rate) {
      const n = Number(b.dataset.rate);
      const rating = it?.rating === n ? 0 : n;
      store.upsertItem(base, it ? { rating } : { rating, status: 'watched' });
      if (!it) toast('Rated and added to Watched');
    } else if ('follow' in b.dataset && it) {
      store.upsertItem(base, { followed: !it.followed });
    } else if ('remove' in b.dataset) {
      store.removeItem(type, id);
      toast('Removed from your lists');
    }
    drawActions();
  });
}

function countdownText(date) {
  const d = daysUntil(date);
  if (d === null) return '';
  if (d === 0) return '<span class="chip accent">Today</span>';
  if (d === 1) return '<span class="chip accent">Tomorrow</span>';
  if (d > 1) return `<span class="chip accent">in ${d} days</span>`;
  return '';
}

// ---------- My Lists ----------
let listTab = 'watchlist';
let listSort = 'recent';
function renderLists() {
  titleEl.textContent = 'My Lists';
  const counts = Object.fromEntries(Object.keys(STATUS_LABEL).map((k) => [k, store.listItems(k).length]));
  let items = store.listItems(listTab);
  if (listSort === 'title') items = items.sort((a, b) => a.title.localeCompare(b.title));
  if (listSort === 'rating') items = items.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  view.innerHTML = `
    <div class="segmented">${Object.entries(STATUS_LABEL).map(([k, l]) => `<button class="${k === listTab ? 'on' : ''}" data-tab="${k}">${l} (${counts[k]})</button>`).join('')}</div>
    <div class="pad" style="display:flex;justify-content:flex-end;margin-bottom:10px">
      <select id="sort" style="width:auto"><option value="recent">Recently updated</option><option value="title">Title</option><option value="rating">Your rating</option></select>
    </div>
    ${items.length ? `<div class="grid">${items.map((it) => `<a class="card" href="#/title/${it.type}/${it.id}">
        <div class="poster">${posterHTML(it.poster, it.title)}${it.followed && it.type === 'tv' ? '<span class="chip">Following</span>' : ''}</div>
        <div class="t">${esc(it.title)}</div>
        <div class="s">${it.rating ? `<span style="color:var(--accent)">${'★'.repeat(it.rating)}</span><span style="opacity:.3">${'★'.repeat(5 - it.rating)}</span>` : esc([it.type === 'tv' ? 'TV' : 'Movie', it.year].filter(Boolean).join(' · '))}</div>
      </a>`).join('')}</div>`
      : `<div class="empty">Nothing in ${STATUS_LABEL[listTab]} yet.<br><a class="btn" href="#/search">Find something to watch</a></div>`}`;
  $('#sort').value = listSort;
  $('#sort').addEventListener('change', (e) => { listSort = e.target.value; renderLists(); });
  $$('.segmented button').forEach((b) => b.addEventListener('click', () => { listTab = b.dataset.tab; renderLists(); }));
}

// ---------- Updates ----------
function renderUpdates() {
  titleEl.textContent = 'Updates';
  const cache = store.getUpdatesCache();
  const seen = store.getLibrary().seenUpdates;
  const followed = store.listItems().filter((i) => i.followed).length;
  const upcoming = cache.entries.filter((e) => e.upcoming);
  const recent = cache.entries.filter((e) => !e.upcoming);

  const row = (e) => {
    const d = daysUntil(e.date);
    const cd = e.upcoming && d !== null
      ? `<div class="countdown"><b>${d <= 0 ? 'Today' : d}</b><span>${d <= 0 ? '' : d === 1 ? 'day' : 'days'}</span></div>`
      : e.upcoming ? '<div class="countdown"><span>TBA</span></div>' : '';
    return `<a class="update ${seen[e.key] ? '' : 'new'}" href="#/title/${e.itemType}/${e.id}">
      <div class="poster">${posterHTML(e.poster, '', 'w154')}</div>
      <div><div class="u-title">${esc(e.title)}</div><div class="u-what">${esc(e.what)}</div><div class="u-when">${esc(fmtDate(e.date))}</div></div>
      ${cd}</a>`;
  };

  view.innerHTML = `
    <div class="pad" style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px">
      <span class="muted small">${cache.checkedAt ? `Checked ${new Date(cache.checkedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}` : 'Not checked yet'} · following ${followed}</span>
      <button class="btn" id="refresh">Check now</button>
    </div>
    ${cache.failures ? `<p class="pad muted small">${cache.failures} title(s) couldn't be checked. They'll be retried next time.</p>` : ''}
    ${upcoming.length ? `<div class="section-label">Coming up</div>${upcoming.map(row).join('')}` : ''}
    ${recent.length ? `<div class="section-label">Recently released</div>${recent.map(row).join('')}` : ''}
    ${!cache.entries.length ? `<div class="empty">${followed ? 'No new seasons or premieres for the shows you follow right now.' : 'Add shows to your lists and they\'ll show up here when new seasons or episodes are announced.'}</div>` : ''}`;

  $('#refresh').addEventListener('click', async (ev) => {
    ev.target.disabled = true; ev.target.textContent = 'Checking…';
    try { await checkUpdates({ force: true }); } catch (e) { toast(e.message); }
    if (currentRoute === 'updates') renderUpdates();
  });
  // Viewing the feed clears the badge; NEW labels stay until the next visit.
  store.markUpdatesSeen(cache.entries.map((e) => e.key));
}

function refreshBadge() {
  const n = unseenCount();
  const b = document.getElementById('updates-badge');
  b.hidden = n === 0;
  b.textContent = n > 99 ? '99+' : String(n);
  if ('setAppBadge' in navigator) (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {});
}

// ---------- Settings ----------
async function renderSettings() {
  titleEl.textContent = 'Settings';
  const s = store.getSettings();
  const st = sync.syncState();
  // Load Google's script early so the sign-in popup opens straight from the tap.
  if (s.googleClientId) sync.preload();
  view.innerHTML = `
    <form class="panel" id="tmdb-form" autocomplete="off">
      <h2>TMDB</h2>
      <label class="field"><span>API key (v3) or read access token</span>
        <input type="password" id="tmdbKey" value="${esc(s.tmdbKey)}" placeholder="Paste your key" spellcheck="false"></label>
      <p class="muted small">Get one free at <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener">themoviedb.org/settings/api</a>. It's saved only on this device.</p>
      <label class="field"><span>Region for streaming availability</span>
        <input type="text" id="region" value="${esc(s.region)}" maxlength="2" style="text-transform:uppercase;width:90px"></label>
      <button class="btn primary" type="submit">Save</button>
    </form>

    <div class="panel"><h2>Streaming services on Discover</h2>
      <p class="muted small">Checked services get their own row on Discover. Popular services are listed first, then everything else TMDB has for your region.</p>
      <input type="search" id="svc-filter" placeholder="Filter services" style="margin-bottom:10px" ${s.tmdbKey ? '' : 'hidden'}>
      <div id="services" class="checks"><span class="muted small">${s.tmdbKey ? 'Loading services…' : 'Add your TMDB key first.'}</span></div></div>

    <form class="panel" id="google-form" autocomplete="off">
      <h2>Google Drive sync</h2>
      <p class="muted small">Your lists are saved on this device and backed up to a private app folder in your Google Drive, so they follow you between phone and PC.</p>
      <label class="field"><span>OAuth client ID</span>
        <input type="text" id="googleClientId" value="${esc(s.googleClientId)}" placeholder="xxxx.apps.googleusercontent.com" spellcheck="false"></label>
      <div class="btn-row">
        <button class="btn" type="submit">Save client ID</button>
        ${sync.isSignedIn()
          ? `<button class="btn primary" type="button" id="sync-now">Sync now</button><button class="btn danger" type="button" id="sign-out">Sign out</button>`
          : `<button class="btn primary" type="button" id="sign-in" ${s.googleClientId ? '' : 'disabled'}>Sign in with Google</button>`}
      </div>
      <p class="muted small" id="sync-line" style="margin-top:10px">${esc(syncLine(st))}</p>
    </form>

    <div class="panel"><h2>Backup file</h2>
      <p class="muted small">Download or restore your lists as a JSON file.</p>
      <div class="btn-row"><button class="btn" id="export">Export</button><label class="btn">Import<input type="file" id="import" accept="application/json,.json" hidden></label></div>
    </div>

    <div class="panel"><a href="#/about" class="btn">About and credits</a></div>`;

  $('#tmdb-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const region = $('#region').value.trim().toUpperCase() || 'US';
    store.saveSettings({ tmdbKey: $('#tmdbKey').value.trim(), region });
    T.clearProviderCache();
    toast('Saved');
    renderSettings();
  });
  $('#google-form').addEventListener('submit', (e) => {
    e.preventDefault();
    store.saveSettings({ googleClientId: $('#googleClientId').value.trim() });
    toast('Saved');
    renderSettings();
  });
  $('#sign-in')?.addEventListener('click', async () => {
    try { await sync.signIn(); await sync.syncNow(); toast('Signed in. Your lists are backed up.'); } catch (e) { toast(e.message, 4000); }
    renderSettings();
  });
  $('#sync-now')?.addEventListener('click', async () => {
    try { await sync.syncNow({ interactive: true }); toast('Synced'); } catch (e) { toast(e.message, 4000); }
  });
  $('#sign-out')?.addEventListener('click', () => { sync.signOut(); renderSettings(); });
  $('#export').addEventListener('click', () => {
    const blob = new Blob([store.exportJSON()], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `movie-show-tracker-${new Date().toISOString().slice(0, 10)}.json` });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('#import').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { store.importJSON(await f.text()); toast('Backup imported and merged'); } catch (err) { toast(err.message, 4000); }
  });

  if (s.tmdbKey) {
    try {
      const list = await T.providerList();
      const known = T.matchKnown(list);
      const knownIds = new Set(known.filter((k) => k.provider).map((k) => k.provider.id));
      const ordered = [...known.filter((k) => k.provider).map((k) => k.provider), ...list.filter((p) => !knownIds.has(p.id))];
      let current = (await T.selectedServices()).map((p) => p.id);
      const selected = new Set(current);
      const box = $('#services');
      if (!box) return;
      const missing = known.filter((k) => k.row && !k.provider).map((k) => k.names[0]);
      box.innerHTML = ordered.map((p) => `<label data-name="${esc(p.name.toLowerCase())}"><input type="checkbox" value="${p.id}" ${selected.has(p.id) ? 'checked' : ''}>
        <img loading="lazy" src="${esc(T.img(p.logo, 'w92'))}" alt="">${esc(p.name)}</label>`).join('')
        + (missing.length ? `<p class="muted small" style="grid-column:1/-1">Not listed by TMDB for ${esc(s.region)} right now: ${esc(missing.join(', '))}.</p>` : '');
      box.addEventListener('change', () => {
        const ids = $$('input:checked', box).map((i) => Number(i.value));
        // Keep the existing order, append new picks.
        current = [...current.filter((id) => ids.includes(id)), ...ids.filter((id) => !current.includes(id))];
        store.saveSettings({ services: current });
      });
      $('#svc-filter').addEventListener('input', (e) => {
        const q = e.target.value.trim().toLowerCase();
        $$('label', box).forEach((l) => { l.hidden = !!q && !l.dataset.name.includes(q); });
      });
    } catch (e) {
      const box = $('#services'); if (box) box.innerHTML = `<span class="muted small">${esc(e.message)}</span>`;
    }
  }
}

function syncLine(st) {
  if (!sync.isSignedIn()) return 'Not signed in. Lists are saved on this device only.';
  const when = st.lastSync ? `Last synced ${new Date(st.lastSync).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}` : 'Not synced yet';
  if (st.status === 'syncing') return 'Syncing…';
  if (st.status === 'error') return `Sync failed: ${st.error}. ${when}.`;
  if (st.status === 'needs-signin') return `Google sign-in expired. Tap Sync now to sign in again. ${when}.`;
  if (st.status === 'offline') return `Offline. Changes will sync when you're back online. ${when}.`;
  return when + '.';
}

function refreshSyncBadge(st = sync.syncState()) {
  const el = document.getElementById('sync-status');
  const map = { syncing: 'Syncing…', error: 'Sync error', 'needs-signin': 'Sync paused', offline: 'Offline' };
  el.textContent = sync.isSignedIn() ? (map[st.status] || '') : '';
  const line = document.getElementById('sync-line');
  if (line) line.textContent = syncLine(st);
}

// ---------- About ----------
function renderAbout() {
  titleEl.textContent = 'About';
  view.innerHTML = `
    <div class="panel"><h2>Movie &amp; Show Tracker</h2>
      <p class="muted small">Version ${APP_VERSION}. A personal tracker for movies and shows.</p></div>
    <div class="panel"><h2>Data from TMDB</h2>
      <a href="https://www.themoviedb.org" target="_blank" rel="noopener"><img class="tmdb-logo" alt="The Movie Database (TMDB)"
        src="https://www.themoviedb.org/assets/2/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg"
        onerror="this.replaceWith(Object.assign(document.createElement('b'),{textContent:'TMDB'}))"></a>
      <p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
      <p class="muted small">Movie and show details, images, and release dates come from The Movie Database.</p></div>
    <div class="panel"><h2>Streaming info from JustWatch</h2>
      <p>Where-to-watch information is provided by <a href="https://www.justwatch.com" target="_blank" rel="noopener">JustWatch</a>, delivered through TMDB's watch provider data.</p>
      <p class="muted small">Availability changes often and can differ by region.</p></div>
    <div class="panel"><h2>Your data</h2>
      <p class="muted small">Your lists live on this device. If you sign in with Google, a copy is stored in a hidden app folder in your own Google Drive that only this app can see. Nothing is sent anywhere else.</p></div>`;
}

// ---------- startup ----------
store.on('library', () => {
  sync.scheduleSync();
  refreshBadge();
  if (currentRoute === 'lists') renderLists();
});
store.on('updates', refreshBadge);
store.on('sync', refreshSyncBadge);

async function startup() {
  await route();
  refreshBadge();
  refreshSyncBadge();
  if (sync.isSignedIn() && sync.hasValidToken()) {
    try { await sync.syncNow(); } catch (e) { console.warn('Sync failed', e); }
  } else if (sync.isSignedIn()) {
    refreshSyncBadge({ status: 'needs-signin' });
    sync.preload();
  }
  if (store.getSettings().tmdbKey) {
    try {
      await checkUpdates();
      if (currentRoute === 'updates') renderUpdates();
    } catch (e) { console.warn('Update check failed', e); }
  }
}

window.addEventListener('online', () => { if (sync.isSignedIn()) sync.syncNow().catch(() => {}); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && store.getSettings().tmdbKey) checkUpdates().catch(() => {});
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW failed', e)));
}

startup();
