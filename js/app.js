// Movie & Show Tracker: app shell, tabs and screens.
// Layout mirrors Luke's Book Tracker: Overview, Library, Discover, Alerts, Me.
import * as store from './store.js';
import * as T from './tmdb.js';
import { checkUpdates, unseenCount, daysUntil } from './updates.js';
import * as sync from './sync.js';

const APP_VERSION = '0.2.1';
const $id = (id) => document.getElementById(id);
const topEl = $id('top');
const bodyEl = $id('body');
const navEl = $id('nav');

// ---------- helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, root = bodyEl) => root.querySelector(sel);
const $$ = (sel, root = bodyEl) => [...root.querySelectorAll(sel)];
const YEAR = () => new Date().getFullYear();

function toast(msg, ms = 2600) {
  const el = $id('toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, ms);
}
function fmtDate(d, withYear = true) {
  if (!d) return 'Date TBA';
  const [y, m, day] = d.split('-').map(Number);
  const opts = { month: 'short', day: 'numeric' };
  if (withYear && y !== YEAR()) opts.year = 'numeric';
  return new Date(y, m - 1, day).toLocaleDateString(undefined, opts);
}
function inDays(d) {
  const n = daysUntil(d);
  if (n === null) return 'date TBA';
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n > 1) return `in ${n} days`;
  if (n === -1) return 'yesterday';
  return `${-n} days ago`;
}
const localDay = (dt = new Date()) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;

const STATUS = {
  watchlist: { name: 'Watchlist', color: '#7a8597' },
  watching: { name: 'Watching', color: 'var(--accent)' },
  watched: { name: 'Watched', color: 'var(--blue)' },
};
const PALETTE = ['#1d6b58', '#2f5fb8', '#7b4fc9', '#c07a12', '#a64a4f', '#2a8fa8', '#4a5566', '#6d5a2e'];
const colorFor = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; };
const typeTxt = (t) => [t.type === 'tv' ? 'TV' : 'Movie', t.year].filter(Boolean).join(' · ');

// Poster in the Book Tracker "cover" style: colored title card underneath, image on top.
function cover(t, style = '', size = 'w342') {
  const src = T.img(t.poster, size);
  const lib = t.key ? t : store.getItem(t.type, t.id);
  const check = lib?.status === 'watched'
    ? '<span class="check" aria-label="Watched"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 8.4l2.6 2.6L12 5.4" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>' : '';
  return `<div class="cover" style="background:${colorFor(t.title)};${style}"><b>${esc(t.title)}</b><i>${esc(typeTxt(t))}</i>${src ? `<img src="${esc(src)}" alt="" loading="lazy">` : ''}${check}</div>`;
}
const stars = (r) => `<span class="stars-row" aria-label="${r} of 5 stars">${[1, 2, 3, 4, 5].map((i) => `<span class="star ${r >= i ? 'on' : ''}">★</span>`).join('')}</span>`;
const statusTag = (s) => `<span class="status"><span class="dot" style="background:${STATUS[s].color}"></span>${STATUS[s].name}</span>`;

// Updates feed entries for one title (used for the little indicator pills).
function entriesFor(type, id) {
  return store.getUpdatesCache().entries.filter((e) => e.itemType === type && e.id === id);
}
function indicators(type, id) {
  const out = [];
  for (const e of entriesFor(type, id).slice(0, 2)) {
    if (e.upcoming) out.push(`<span class="ind soon">${esc(e.what)}${e.date ? ` ${inDays(e.date)}` : ''}</span>`);
    else out.push(`<span class="ind new">${esc(e.what)}</span>`);
  }
  return out.length ? `<div class="ind-row">${out.join('')}</div>` : '';
}

function errorBox(e) {
  if (e instanceof T.MissingKeyError) return '<div class="empty-note">This app needs a TMDB key. Add one under Me.</div>';
  const msg = navigator.onLine ? e.message : "You're offline. Titles you've opened before still work.";
  return `<div class="empty-note">${esc(msg)} <button class="text-btn" data-a="retry">Try again</button></div>`;
}

// Cache of titles seen on screen, so quick-add buttons know the title and poster.
const seen = new Map();
const remember = (t) => { seen.set(`${t.type}:${t.id}`, t); return t; };

// ---------- shell ----------
const ICONS = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 11l8-6.5 8 6.5V20h-5.5v-5.5h-5V20H4z"/></svg>',
  library: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="5.5" width="17" height="12" rx="2"/><path d="M8 20.5h8M10.5 9.5v5l4-2.5z"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>',
  alerts: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15zM10 20.5a2 2 0 004 0"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0114 0"/></svg>',
};
const TABS = [
  { id: 'home', label: 'Overview', icon: ICONS.home },
  { id: 'library', label: 'Library', icon: ICONS.library },
  { id: 'discover', label: 'Discover', icon: ICONS.search },
  { id: 'alerts', label: 'Alerts', icon: ICONS.alerts },
  { id: 'me', label: 'Me', icon: ICONS.more },
];
const SCREENS = { home: renderHome, library: renderLibrary, discover: renderDiscover, alerts: renderAlerts, me: renderMe, about: renderAbout, title: renderTitle };
const ALIASES = { lists: 'library', updates: 'alerts', settings: 'me', search: 'discover', calendar: 'alerts' };
const TAB_OF = { about: 'me', title: null };
let current = { name: 'home', args: [], query: new URLSearchParams() };
let activeTab = 'home';

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '') || 'home';
  const [path, qs] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  let name = parts[0];
  if (ALIASES[name]) name = ALIASES[name];
  if (!SCREENS[name]) name = 'home';
  return { name, args: parts.slice(1), query: new URLSearchParams(qs || '') };
}

function renderNav() {
  const n = unseenCount();
  navEl.innerHTML = TABS.map((t) => `<a href="#/${t.id}" aria-current="${activeTab === t.id}">${t.icon}${t.label}${t.id === 'alerts' && n ? `<span class="badge">${n > 99 ? '99+' : n}</span>` : ''}</a>`).join('');
  if ('setAppBadge' in navigator) (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {});
}

const scrollOf = {};
let lastHash = null;
async function route() {
  if (lastHash !== null) scrollOf[lastHash] = bodyEl.scrollTop;
  lastHash = location.hash;
  current = parseHash();
  if (current.name in TAB_OF) { if (TAB_OF[current.name]) activeTab = TAB_OF[current.name]; } else activeTab = current.name;
  renderNav();
  await draw();
  bodyEl.scrollTop = current.name === 'title' ? 0 : (scrollOf[location.hash] || 0);
}
let drawSeq = 0;
async function draw() {
  const my = ++drawSeq;
  try {
    const out = (await SCREENS[current.name](current)) || {};
    if (my !== drawSeq) return;
    topEl.innerHTML = out.top || '';
    bodyEl.innerHTML = out.body || '';
    out.after?.();
  } catch (e) {
    console.error(e);
    if (my !== drawSeq) return;
    topEl.innerHTML = '<button class="icon-btn" data-a="back">‹ Back</button><h2>Something went wrong</h2>';
    bodyEl.innerHTML = errorBox(e);
  }
}
// Redraw in place (after a change) without losing the scroll position.
async function redraw() {
  const y = bodyEl.scrollTop;
  renderNav();
  await draw();
  bodyEl.scrollTop = y;
}
window.addEventListener('hashchange', route);

// ---------- actions ----------
const actions = {
  retry: () => redraw(),
  back: () => { if (history.length > 1) history.back(); else location.hash = '#/home'; },
  refresh: async (el) => {
    el.disabled = true; el.textContent = 'Checking…';
    try { await checkUpdates({ force: true }); toast('Everything is up to date.'); } catch (e) { toast(e.message, 4000); }
    redraw();
  },
  'quick-add': (el) => {
    const t = seen.get(`${el.dataset.type}:${el.dataset.id}`);
    if (!t) return;
    if (store.getItem(t.type, t.id)) { location.hash = `#/title/${t.type}/${t.id}`; return; }
    store.upsertItem(t, { status: 'watchlist' });
    el.classList.add('done'); el.textContent = '✓ Watchlist';
    toast(`Added ${t.title} to your Watchlist`);
  },
  'mark-read': () => { store.markUpdatesSeen(store.getUpdatesCache().entries.map((e) => e.key)); redraw(); },
  theme: (el) => { applyTheme(el.dataset.v); redraw(); },
};
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-a]');
  if (!el || !actions[el.dataset.a]) return;
  e.preventDefault();
  try { actions[el.dataset.a](el, e); } catch (err) { console.error(err); toast('Something went wrong: ' + err.message); }
});

function applyTheme(t) {
  const root = document.documentElement;
  if (t === 'light' || t === 'dark') { root.dataset.theme = t; try { localStorage.setItem('wt.theme', t); } catch { /* ignore */ } }
  else { delete root.dataset.theme; try { localStorage.removeItem('wt.theme'); } catch { /* ignore */ } }
  const dark = t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => { m.setAttribute('content', dark ? '#12171d' : '#1d6b58'); m.removeAttribute('media'); });
}
const currentTheme = () => { try { return localStorage.getItem('wt.theme') || 'auto'; } catch { return 'auto'; } };

// ---------- Overview ----------
function countdown(d) {
  return `<div class="cd">${d === null ? '<span>TBA</span>' : d <= 0 ? '<b>Today</b>' : `<b>${d}</b><span>${d === 1 ? 'day' : 'days'}</span>`}</div>`;
}
function renderHome() {
  const y = YEAR();
  const top = `<h2>${y}</h2><button class="icon-btn" data-a="refresh">↻ Refresh</button>`;
  const all = store.listItems();
  if (!all.length) {
    return { top, body: `<div class="empty-state"><h3>Welcome${store.getSettings().name ? `, ${esc(store.getSettings().name)}` : ''}</h3>
      <p>Your library is empty. Find movies and shows to add to your Watchlist, and they'll show up here with countdowns to new seasons and releases.</p>
      <a class="primary" href="#/discover">Find something to watch</a></div>` };
  }
  const watching = store.listItems('watching');
  const watchlist = store.listItems('watchlist');
  const watchedYear = store.listItems('watched').filter((i) => new Date(i.watchedAt || i.updatedAt).getFullYear() === y);
  const rated = all.filter((i) => i.rating);
  const avg = rated.length ? (rated.reduce((s, i) => s + i.rating, 0) / rated.length).toFixed(1) : null;
  const upcoming = store.getUpdatesCache().entries.filter((e) => e.upcoming).slice(0, 4);

  let body = '<div class="section-h">Watching now</div>';
  body += watching.length ? watching.map((it) => {
    const next = entriesFor(it.type, it.id).find((e) => e.upcoming) || entriesFor(it.type, it.id)[0];
    return `<a class="now" href="#/title/${it.type}/${it.id}">${cover(it)}<div class="meta">
      <span class="title">${esc(it.title)}</span><span class="author">${esc(typeTxt(it))}</span>
      ${next ? `<span class="series">${esc(next.what)} · ${esc(next.date ? inDays(next.date) : 'date TBA')}</span>` : `<span class="series">Started ${new Date(it.startedAt || it.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>`}
      ${it.rating ? stars(it.rating) : ''}</div></a>`;
  }).join('') : '<p class="author">Nothing on Watching right now. Open a show and set it to Watching to start.</p>';

  body += '<div class="section-h">Coming up <a href="#/alerts">Alerts ›</a></div>';
  body += upcoming.length ? upcoming.map((e) => `<a class="book-row" href="#/title/${e.itemType}/${e.id}" style="padding:8px 0">${cover({ title: e.title, poster: e.poster, type: e.itemType, id: e.id }, 'width:40px;height:60px;padding:0', 'w154')}
      <div class="meta"><span class="title">${esc(e.title)}</span><span class="author">${esc(e.what)} · ${esc(fmtDate(e.date))}</span></div>
      ${countdown(daysUntil(e.date))}</a>`).join('')
    : '<p class="author">No premieres or release dates coming up for your titles yet. The app checks every time it opens.</p>';

  body += `<div class="section-h">${y} so far</div><div class="sum">
    <div><b>${watchedYear.length}</b><span>Watched in ${y}</span></div>
    <div><b>${watching.length}</b><span>Watching now</span></div>
    <div><b>${watchlist.length}</b><span>On your Watchlist</span></div>
    <div><b>${avg ? `★ ${avg}` : '–'}</b><span>Your average rating</span></div></div>`;

  if (watchlist.length) {
    body += '<div class="section-h">Up next <a href="#/library">Library ›</a></div>' + watchlist.slice(0, 3).map((it) => `<a class="book-row" href="#/title/${it.type}/${it.id}" style="border-bottom:0;padding-top:4px">${cover(it, 'width:40px;height:60px;padding:0', 'w154')}<div class="meta"><span class="title">${esc(it.title)}</span><span class="series">${esc(typeTxt(it))}</span></div></a>`).join('');
  }
  body += '<a class="link-row" href="#/alerts">All alerts <span>›</span></a>';
  return { top, body };
}

// ---------- Library ----------
const libState = (() => { const d = { shelf: 'all', type: 'all', sort: 'recent', view: 'list' }; try { return { ...d, ...JSON.parse(localStorage.getItem('wt.libView') || '{}') }; } catch { return d; } })();
const saveLib = () => { try { localStorage.setItem('wt.libView', JSON.stringify(libState)); } catch { /* ignore */ } };
Object.assign(actions, {
  shelf: (el) => { libState.shelf = el.dataset.v; saveLib(); redraw(); },
  'lib-type': (el) => { libState.type = el.dataset.v; saveLib(); redraw(); },
  'lib-view': (el) => { libState.view = el.dataset.v; saveLib(); redraw(); },
});

function libRow(it) {
  return `<a class="book-row" href="#/title/${it.type}/${it.id}">${cover(it, '', 'w154')}<div class="meta">
    <span class="title">${esc(it.title)}</span><span class="author">${esc(typeTxt(it))}</span>
    ${it.rating ? stars(it.rating) : ''}
    ${it.status === 'watched' && it.watchedAt ? `<span class="series">Watched ${new Date(it.watchedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>` : ''}
    ${it.followed ? indicators(it.type, it.id) : ''}</div></a>`;
}
function libCell(it) {
  return `<a class="gcell" href="#/title/${it.type}/${it.id}">${cover(it, '', 'w342')}<span class="t">${esc(it.title)}</span>
    <span class="st">${it.rating ? stars(it.rating) : statusTag(it.status)}</span></a>`;
}

function renderLibrary() {
  const top = '<h2>Library</h2><a class="plus-btn" href="#/discover" aria-label="Add a movie or show">+</a>';
  const all = store.listItems().filter((i) => libState.type === 'all' || i.type === libState.type);
  const counts = { all: all.length };
  for (const k of Object.keys(STATUS)) counts[k] = all.filter((i) => i.status === k).length;
  const sorters = {
    recent: (a, b) => b.updatedAt - a.updatedAt,
    title: (a, b) => a.title.localeCompare(b.title),
    rating: (a, b) => (b.rating || 0) - (a.rating || 0) || b.updatedAt - a.updatedAt,
    year: (a, b) => String(b.year).localeCompare(String(a.year)),
  };
  const list = (libState.shelf === 'all' ? all : all.filter((i) => i.status === libState.shelf)).sort(sorters[libState.sort] || sorters.recent);

  let body = `<div class="shelf-tabs" role="tablist" aria-label="Lists">${[['all', 'All'], ['watching', 'Watching'], ['watchlist', 'Watchlist'], ['watched', 'Watched']].map(([k, l]) =>
    `<button role="tab" data-a="shelf" data-v="${k}" aria-selected="${libState.shelf === k}"><span>${l}</span><b>${counts[k]}</b></button>`).join('')}</div>
    <div class="toolbar">
      <div class="seg" role="group" aria-label="Type">${[['all', 'All'], ['movie', 'Movies'], ['tv', 'Shows']].map(([k, l]) => `<button data-a="lib-type" data-v="${k}" aria-pressed="${libState.type === k}">${l}</button>`).join('')}</div>
      <span class="grow"></span>
      <select id="lib-sort" aria-label="Sort">${[['recent', 'Recent'], ['title', 'Title'], ['rating', 'Rating'], ['year', 'Year']].map(([k, l]) => `<option value="${k}" ${libState.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <div class="seg" role="group" aria-label="View"><button data-a="lib-view" data-v="list" aria-pressed="${libState.view === 'list'}" aria-label="List">☰</button><button data-a="lib-view" data-v="grid" aria-pressed="${libState.view === 'grid'}" aria-label="Grid">▦</button></div>
    </div>`;

  if (!list.length) {
    body += `<div class="empty-state"><p>${libState.shelf === 'all' ? 'Nothing here yet.' : `Nothing on ${STATUS[libState.shelf].name} yet.`}</p><a class="ghost-btn" href="#/discover">Find something to watch</a></div>`;
  } else if (libState.view === 'grid') {
    body += `<div class="grid" style="margin-top:8px">${list.map(libCell).join('')}</div>`;
  } else if (libState.shelf === 'all') {
    for (const k of ['watching', 'watchlist', 'watched']) {
      const group = list.filter((i) => i.status === k);
      if (group.length) body += `<div class="section-h">${STATUS[k].name}</div>` + group.map(libRow).join('');
    }
  } else {
    body += list.map(libRow).join('');
  }
  return { top, body, after: () => { $('#lib-sort')?.addEventListener('change', (e) => { libState.sort = e.target.value; saveLib(); redraw(); }); } };
}

// ---------- Discover ----------
let discType = 'all';
let discQuery = '';
Object.assign(actions, {
  'disc-type': (el) => { discType = el.dataset.v; redraw(); },
  'refresh-discover': () => { T.clearMemo(); redraw(); },
});

function sugCard(t) {
  remember(t);
  const lib = store.getItem(t.type, t.id);
  return `<div class="sug"><a href="#/title/${t.type}/${t.id}" style="display:contents;color:inherit;text-decoration:none">${cover(t)}<span class="t">${esc(t.title)}</span></a>
    <span class="why">${esc(typeTxt(t))}${t.vote ? ` · ★ ${t.vote.toFixed(1)}` : ''}</span>
    <button class="add ${lib ? 'done' : ''}" data-a="quick-add" data-type="${t.type}" data-id="${t.id}">${lib ? `✓ ${STATUS[lib.status].name}` : '+ Watchlist'}</button></div>`;
}
function resultRow(t) {
  remember(t);
  const lib = store.getItem(t.type, t.id);
  return `<div class="book-row" style="cursor:default"><a href="#/title/${t.type}/${t.id}" style="display:contents;color:inherit;text-decoration:none">${cover(t, '', 'w154')}
    <div class="meta"><span class="title">${esc(t.title)}</span><span class="author">${esc(typeTxt(t))}${t.vote ? ` · ★ ${t.vote.toFixed(1)}` : ''}</span>
    <span class="author" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(t.overview)}</span></div></a>
    <button class="add ${lib ? 'done' : ''}" style="align-self:center" data-a="quick-add" data-type="${t.type}" data-id="${t.id}">${lib ? `✓ ${STATUS[lib.status].name}` : '+ Add'}</button></div>`;
}
const skeletonRow = () => Array.from({ length: 5 }, () => '<div class="sug sk"><div class="cover"></div><span class="t">&nbsp;</span></div>').join('');
const byType = (items) => items.filter((t) => discType === 'all' || t.type === discType);

async function renderDiscover() {
  const top = '<h2>Discover</h2><button class="icon-btn" data-a="refresh-discover">↻ Refresh</button>';
  const head = `<label class="search">${ICONS.search}<input id="q" type="search" placeholder="Search movies and shows" value="${esc(discQuery)}" autocomplete="off" enterkeyhint="search" aria-label="Search movies and shows"></label>
    <div class="seg" role="group" aria-label="Show" style="margin-bottom:6px">${[['all', 'All'], ['movie', 'Movies'], ['tv', 'Shows']].map(([k, l]) => `<button data-a="disc-type" data-v="${k}" aria-pressed="${discType === k}">${l}</button>`).join('')}</div>`;
  if (!store.getSettings().tmdbKey) return { top, body: head + errorBox(new T.MissingKeyError()) };

  let services = [];
  try { services = await T.selectedServices(); } catch { /* offline with no saved list */ }
  const rows = [
    { title: 'Trending this week', load: () => T.trending('week') },
    { title: 'Popular movies', type: 'movie', load: () => T.popular('movie') },
    { title: 'Popular shows', type: 'tv', load: () => T.popular('tv') },
    { title: 'Coming soon to theaters', type: 'movie', load: () => T.upcomingMovies() },
    { title: 'New episodes this week', type: 'tv', load: () => T.onTheAirTV() },
    ...services.map((p) => ({
      title: p.name, logo: p.logo,
      load: async () => {
        const [m, t] = await Promise.all([T.byProvider('movie', p.id), T.byProvider('tv', p.id)]);
        const out = [];
        for (let i = 0; i < Math.max(m.length, t.length); i++) { if (t[i]) out.push(t[i]); if (m[i]) out.push(m[i]); }
        return out;
      },
    })),
  ].filter((r) => !r.type || discType === 'all' || r.type === discType);

  const rowsHtml = rows.map((r, i) => `<section data-row="${i}"><div class="section-h"><span>${r.logo ? `<img src="${esc(T.img(r.logo, 'w92'))}" alt="">` : ''}${esc(r.title)}</span></div>
    <div class="shelf-scroll">${skeletonRow()}</div></section>`).join('');
  const body = `${head}<div id="results"></div><div id="rows">${rowsHtml}</div>`;

  return {
    top, body,
    after: () => {
      const io = new IntersectionObserver((ents) => {
        for (const en of ents) {
          if (!en.isIntersecting) continue;
          io.unobserve(en.target);
          const r = rows[Number(en.target.dataset.row)];
          const sc = en.target.querySelector('.shelf-scroll');
          r.load().then((items) => {
            const list = byType(items).slice(0, 20);
            sc.innerHTML = list.length ? list.map(sugCard).join('') : '<p class="author">Nothing here right now.</p>';
          }).catch((e) => { sc.outerHTML = errorBox(e); });
        }
      }, { root: bodyEl, rootMargin: '500px 0px' });
      $$('[data-row]').forEach((el) => io.observe(el));

      const input = $('#q'); const out = $('#results'); const rowsEl = $('#rows');
      let seq = 0, timer;
      async function run(term) {
        discQuery = term;
        const my = ++seq;
        if (!term.trim()) { out.innerHTML = ''; rowsEl.hidden = false; return; }
        rowsEl.hidden = true;
        out.innerHTML = '<p class="loading">Searching…</p>';
        try {
          const res = byType(await T.search(term.trim()));
          if (my !== seq) return;
          out.innerHTML = res.length ? `<div class="section-h">Results</div>${res.map(resultRow).join('')}` : `<div class="empty-note">No results for “${esc(term)}”.</div>`;
        } catch (e) { if (my === seq) out.innerHTML = errorBox(e); }
      }
      input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => run(input.value), 350); });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { clearTimeout(timer); run(input.value); input.blur(); } });
      if (discQuery) run(discQuery);
    },
  };
}

// ---------- Title page ----------
async function renderTitle(r) {
  const [type, idStr] = r.args;
  const id = Number(idStr);
  if (!['movie', 'tv'].includes(type) || !id) { location.hash = '#/home'; return {}; }
  const top = `<button class="icon-btn" data-a="back">‹ Back</button><h2>${type === 'tv' ? 'Show' : 'Movie'}</h2>`;
  const d = await T.details(type, id);
  const t = remember(T.norm(d, type));
  const runtime = type === 'movie'
    ? (d.runtime ? `${Math.floor(d.runtime / 60)}h ${d.runtime % 60}m` : '')
    : (d.number_of_seasons ? `${d.number_of_seasons} season${d.number_of_seasons > 1 ? 's' : ''}` : '');
  const genres = (d.genres || []).slice(0, 3).map((g) => g.name).join(', ');
  const region = store.getSettings().region;
  const wp = d['watch/providers']?.results?.[region];
  const groups = [['flatrate', 'Stream'], ['free', 'Free'], ['ads', 'Free with ads'], ['rent', 'Rent'], ['buy', 'Buy']]
    .filter(([k]) => wp?.[k]?.length)
    .map(([k, label]) => `<div class="pgroup"><small>${label}</small><div class="providers">${wp[k].map((p) => `<a href="${esc(wp.link)}" target="_blank" rel="noopener" title="${esc(p.provider_name)}"><img src="${esc(T.img(p.logo_path, 'w92'))}" alt="${esc(p.provider_name)}"></a>`).join('')}</div></div>`).join('');
  const seasons = type === 'tv' ? (d.seasons || []).filter((s) => s.season_number > 0) : [];
  const nextEp = d.next_episode_to_air;
  const cast = (d.credits?.cast || []).slice(0, 15);
  const releaseSoon = type === 'movie' && d.release_date && daysUntil(d.release_date) > 0;
  const base = { id, type, title: t.title, poster: t.poster, year: t.year };
  const it = store.getItem(type, id);

  // Actions for this title page.
  Object.assign(actions, {
    'set-status': (el) => { store.upsertItem(base, { status: el.dataset.v }); toast(`Set to ${STATUS[el.dataset.v].name}`); redraw(); },
    rate: (el) => {
      const cur = store.getItem(type, id); const n = Number(el.dataset.v);
      const rating = cur?.rating === n ? 0 : n;
      store.upsertItem(base, cur ? { rating } : { rating, status: 'watched' });
      if (!cur) toast('Rated and added to Watched');
      redraw();
    },
    follow: () => { const cur = store.getItem(type, id); if (cur) store.upsertItem(base, { followed: !cur.followed }); redraw(); },
    remove: () => { store.removeItem(type, id); toast('Removed from your library'); redraw(); },
  });

  const body = `
    ${d.backdrop_path ? `<div class="backdrop"><img src="${esc(T.img(d.backdrop_path, 'w780'))}" alt=""></div>` : ''}
    <div class="hero">${cover(t)}<div style="min-width:0">
      <h3>${esc(t.title)}</h3>
      <div class="author">${esc([type === 'tv' ? 'TV' : 'Movie', t.year, runtime].filter(Boolean).join(' · '))}</div>
      ${genres ? `<div class="author">${esc(genres)}</div>` : ''}
      ${d.vote_average ? `<div class="series" style="margin-top:4px">TMDB ★ ${d.vote_average.toFixed(1)}/10</div>` : ''}
      ${type === 'tv' && d.status ? `<div class="series">${esc(d.status)}</div>` : ''}
      ${nextEp?.air_date ? `<span class="pill warn" style="margin-top:6px">S${nextEp.season_number} E${nextEp.episode_number} ${esc(inDays(nextEp.air_date))}</span>` : ''}
      ${releaseSoon ? `<span class="pill warn" style="margin-top:6px">Releases ${esc(inDays(d.release_date))}</span>` : ''}
    </div></div>

    <div class="label" style="margin-top:0">Status</div>
    <div class="status-pick">${Object.entries(STATUS).map(([k, s]) => `<button data-a="set-status" data-v="${k}" aria-pressed="${it?.status === k}"><span class="dot" style="background:${s.color}"></span>${s.name}</button>`).join('')}</div>
    <div class="label">Your rating</div>
    <div>${[1, 2, 3, 4, 5].map((n) => `<button class="star ${(it?.rating || 0) >= n ? 'on' : ''}" data-a="rate" data-v="${n}" aria-label="${n} star${n > 1 ? 's' : ''}">★</button>`).join('')}</div>
    ${it ? `<div class="toggle-row" style="margin-top:12px"><div>Follow updates<small>${type === 'tv' ? 'New seasons and episodes show up in Alerts.' : 'The release date shows up in Alerts.'}</small></div><button class="switch" role="switch" aria-checked="${!!it.followed}" aria-label="Follow updates" data-a="follow"></button></div>` : ''}

    ${d.tagline ? `<p class="author" style="margin:16px 0 4px"><i>${esc(d.tagline)}</i></p>` : ''}
    <p style="margin:${d.tagline ? '0' : '16px'} 0 0">${esc(d.overview || 'No overview available.')}</p>

    <div class="label">Where to watch</div>
    <div class="card">${groups || `<p class="author" style="margin:0">No streaming info for region ${esc(region)} yet.</p>`}
      <div class="srcnote">Streaming info from <a href="https://www.justwatch.com" target="_blank" rel="noopener">JustWatch</a> via TMDB · ${esc(region)}</div></div>

    ${seasons.length ? `<div class="label">Seasons</div><div class="card"><dl class="kv">${seasons.map((s) => `<dt>${esc(s.name)}</dt><dd>${s.episode_count || '?'} episodes · ${esc(fmtDate(s.air_date))}</dd>`).join('')}</dl></div>` : ''}
    ${cast.length ? `<div class="label">Cast</div><div class="cast">${cast.map((c) => `<div>${c.profile_path ? `<img loading="lazy" src="${esc(T.img(c.profile_path, 'w185'))}" alt="">` : '<span class="ph"></span>'}<b>${esc(c.name)}</b><br><span>${esc(c.character || '')}</span></div>`).join('')}</div>` : ''}
    ${it ? '<button class="danger-btn" style="margin-top:18px" data-a="remove">Remove from library</button>' : ''}
    <div class="srcnote"><a href="https://www.themoviedb.org/${type}/${id}" target="_blank" rel="noopener">View on TMDB ↗</a></div>`;
  return { top, body };
}

// ---------- Alerts ----------
function renderAlerts() {
  const cache = store.getUpdatesCache();
  const seenKeys = store.getLibrary().seenUpdates;
  const any = cache.entries.some((e) => !seenKeys[e.key]);
  const top = `<h2>Alerts</h2>${any ? '<button class="icon-btn" data-a="mark-read">Mark all read</button>' : ''}`;
  const row = (e) => `<a class="notif ${seenKeys[e.key] ? '' : 'unread'}" href="#/title/${e.itemType}/${e.id}" data-key="${esc(e.key)}">${cover({ title: e.title, poster: e.poster, type: e.itemType, id: e.id }, '', 'w92')}
      <div class="txt"><strong>${esc(e.title)}</strong><div>${esc(e.what)}</div><div class="when">${esc(fmtDate(e.date))}${e.date ? ` · ${esc(inDays(e.date))}` : ''}</div></div>${e.upcoming ? countdown(daysUntil(e.date)) : ''}</a>`;
  const upcoming = cache.entries.filter((e) => e.upcoming);
  const recent = cache.entries.filter((e) => !e.upcoming);
  const followed = store.listItems().filter((i) => i.followed).length;
  let body = '';
  if (upcoming.length) body += '<div class="section-h">Coming up</div>' + upcoming.map(row).join('');
  if (recent.length) body += '<div class="section-h">Recently released</div>' + recent.map(row).join('');
  if (!cache.entries.length) body += `<div class="empty-state"><p>${followed ? 'No new seasons, episodes or releases for the titles you follow right now.' : "Add movies and shows to your Library and you'll get alerts here for new seasons, episodes and releases."}</p></div>`;
  if (cache.failures) body += `<p class="muted-note">${cache.failures} title(s) couldn't be checked. They'll be retried next time.</p>`;
  body += `<p class="muted-note">${cache.checkedAt ? `Checked ${new Date(cache.checkedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}` : 'Not checked yet'} · following ${followed} · <button class="text-btn" data-a="refresh">Check now</button></p>`;
  return {
    top, body,
    after: () => $$('.notif').forEach((a) => a.addEventListener('click', () => store.markUpdatesSeen([a.dataset.key]))),
  };
}

// ---------- Me ----------
let editingName = false;
Object.assign(actions, {
  'edit-name': () => { editingName = true; redraw().then(() => $('#name')?.focus()); },
  'save-name': () => { store.saveSettings({ name: ($('#name')?.value || '').trim() }); editingName = false; redraw(); },
  svc: (el) => {
    const id = Number(el.dataset.id);
    const ids = $$('.pin-grid button[aria-pressed="true"]').map((b) => Number(b.dataset.id));
    const on = el.getAttribute('aria-pressed') === 'true';
    const next = on ? ids.filter((x) => x !== id) : [...ids, id];
    store.saveSettings({ services: next });
    el.setAttribute('aria-pressed', String(!on));
    const n = $('#svc-count'); if (n) n.textContent = `${next.length} on Discover`;
  },
  'sign-in': async () => { try { await sync.signIn(); await sync.syncNow(); toast('Signed in. Your lists are backed up.'); } catch (e) { toast(e.message, 4000); } redraw(); },
  'sync-now': async () => { try { await sync.syncNow({ interactive: true }); toast('Synced'); } catch (e) { toast(e.message, 4000); } redraw(); },
  'sign-out': () => { sync.signOut(); redraw(); },
  export: () => {
    const blob = new Blob([store.exportJSON()], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `movie-show-tracker-${localDay()}.json` });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  import: () => {
    const inp = Object.assign(document.createElement('input'), { type: 'file', accept: 'application/json,.json' });
    inp.onchange = async () => { const f = inp.files[0]; if (!f) return; try { store.importJSON(await f.text()); toast('Backup imported and merged'); redraw(); } catch (err) { toast(err.message, 4000); } };
    inp.click();
  },
});

function syncLine(st) {
  if (!sync.isSignedIn()) return 'Not signed in. Your lists are saved on this device only.';
  const when = st.lastSync ? `Last synced ${new Date(st.lastSync).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}` : 'Not synced yet';
  if (st.status === 'syncing') return 'Syncing…';
  if (st.status === 'error') return `Sync failed: ${st.error}. ${when}.`;
  if (st.status === 'needs-signin') return `Google sign-in expired. Tap Sync now to sign in again. ${when}.`;
  if (st.status === 'offline') return `Offline. Changes will sync when you're back online. ${when}.`;
  return when + '.';
}

async function servicesHtml(s) {
  if (!s.tmdbKey) return '<p class="author">Add a TMDB key first.</p>';
  try {
    const list = await T.providerList();
    const known = T.matchKnown(list);
    const knownIds = new Set(known.filter((k) => k.provider).map((k) => k.provider.id));
    const ordered = [...known.filter((k) => k.provider).map((k) => k.provider), ...list.filter((p) => !knownIds.has(p.id))];
    const selected = new Set((await T.selectedServices()).map((p) => p.id));
    const missing = known.filter((k) => k.row && !k.provider).map((k) => k.names[0]);
    return `<span class="author" id="svc-count">${selected.size} on Discover</span>
      <label class="search" style="margin:8px 0 0">${ICONS.search}<input type="search" id="svc-filter" placeholder="Filter services" aria-label="Filter services"></label>
      <div class="pin-grid">${ordered.map((p) => `<button data-a="svc" data-id="${p.id}" data-name="${esc(p.name.toLowerCase())}" aria-pressed="${selected.has(p.id)}"><img src="${esc(T.img(p.logo, 'w92'))}" alt="" loading="lazy">${esc(p.name)}</button>`).join('')}</div>
      ${missing.length ? `<p class="muted-note" style="margin-bottom:0">Not listed by TMDB for ${esc(s.region)} right now: ${esc(missing.join(', '))}.</p>` : ''}`;
  } catch (e) { return errorBox(e); }
}

async function renderMe() {
  const s = store.getSettings();
  if (s.googleClientId) sync.preload();
  const all = store.listItems();
  const y = YEAR();
  const watchedYear = store.listItems('watched').filter((i) => new Date(i.watchedAt || i.updatedAt).getFullYear() === y).length;
  const initial = (s.name || '').trim().charAt(0).toUpperCase() || '?';
  const theme = currentTheme();
  const st = sync.syncState();
  const body = `
    <div class="profile"><div class="avatar">${esc(initial)}</div><div style="min-width:0">
      ${editingName ? `<div class="name-edit"><input id="name" value="${esc(s.name)}" placeholder="Your name"><button class="text-btn" data-a="save-name">Save</button></div>`
        : `<div><b style="font-size:16px">${esc(s.name || 'Add your name')}</b> <button class="text-btn" data-a="edit-name">✎ Edit</button></div>`}
      <div class="author">${watchedYear} watched in ${y} · ${all.length} in library</div></div></div>

    <div class="card"><h3>Appearance</h3>
      <div class="seg wide" role="group" aria-label="Appearance" style="margin:8px 0 6px">${[['auto', 'Auto'], ['light', '☀ Light'], ['dark', '☾ Dark']].map(([k, l]) => `<button data-a="theme" data-v="${k}" aria-pressed="${theme === k}">${l}</button>`).join('')}</div>
      <p class="author" style="margin:0">Auto follows your phone's light or dark mode.</p></div>

    <div class="card"><h3>Streaming services</h3>
      <p class="author" style="margin:0 0 4px">Services you pick get their own row on Discover.</p>${await servicesHtml(s)}
      <div class="gfield" style="margin-top:12px;border-top:1px solid var(--line);padding-top:10px"><span>Region for streaming info<br><small class="author">Two-letter country code</small></span><input id="region" value="${esc(s.region)}" maxlength="2" aria-label="Region"></div></div>

    ${store.builtIn.tmdb ? '' : `<div class="card"><h3>TMDB key</h3><p class="author">Get one free at <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener">themoviedb.org</a>. Saved only on this device.</p>
      <div class="name-edit"><input id="tmdbKey" type="password" value="${esc(s.tmdbKey)}" style="width:100%"><button class="text-btn" id="save-tmdb">Save</button></div></div>`}

    <div class="card"><h3>Google Drive backup</h3>
      <p class="author">Your lists are saved on this device and backed up to a private app folder in your Google Drive, so they follow you between phone and PC.</p>
      ${store.builtIn.google ? '' : `<div class="name-edit" style="margin-bottom:8px"><input id="gcid" value="${esc(s.googleClientId)}" placeholder="OAuth client ID" style="width:100%"><button class="text-btn" id="save-gcid">Save</button></div>`}
      ${sync.isSignedIn()
        ? '<div class="btn-pair"><button class="primary" style="margin:0" data-a="sync-now">Sync now</button><button class="ghost-btn" data-a="sign-out">Sign out</button></div>'
        : `<button class="primary" data-a="sign-in" ${s.googleClientId ? '' : 'disabled'}>Sign in with Google</button>`}
      <p class="muted-note" id="sync-line" style="margin-bottom:0">${esc(syncLine(st))}</p></div>

    <div class="card"><h3>Backup file</h3><p class="author">Download or restore your lists as a file.</p>
      <div class="btn-pair"><button class="ghost-btn" data-a="export">Export</button><button class="ghost-btn" data-a="import">Import</button></div></div>

    <a class="link-row" href="#/about">About and credits <span>›</span></a>`;

  return {
    top: '<h2>Me</h2>', body,
    after: () => {
      $('#name')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') actions['save-name'](); });
      $('#region').addEventListener('change', (e) => { store.saveSettings({ region: e.target.value.trim().toUpperCase() || 'US' }); T.clearProviderCache(); toast('Region saved'); redraw(); });
      $('#svc-filter')?.addEventListener('input', (e) => { const q = e.target.value.trim().toLowerCase(); $$('.pin-grid button').forEach((b) => { b.hidden = !!q && !b.dataset.name.includes(q); }); });
      $('#save-tmdb')?.addEventListener('click', () => { store.saveSettings({ tmdbKey: $('#tmdbKey').value.trim() }); T.clearProviderCache(); toast('Saved'); redraw(); });
      $('#save-gcid')?.addEventListener('click', () => { store.saveSettings({ googleClientId: $('#gcid').value.trim() }); toast('Saved'); redraw(); });
    },
  };
}

function renderAbout() {
  return {
    top: '<button class="icon-btn" data-a="back">‹ Me</button><h2>About</h2>',
    body: `
    <div class="card"><h3>Movie &amp; Show Tracker</h3><p class="author" style="margin:0">Version ${APP_VERSION}. A personal tracker for movies and shows.</p></div>
    <div class="card"><h3>Data from TMDB</h3>
      <div class="credit"><a href="https://www.themoviedb.org" target="_blank" rel="noopener"><img alt="The Movie Database (TMDB)"
        src="https://www.themoviedb.org/assets/2/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg"
        onerror="this.replaceWith(Object.assign(document.createElement('b'),{textContent:'TMDB'}))"></a>
      <div><p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p><p class="author" style="margin:0">Movie and show details, images and release dates come from The Movie Database.</p></div></div></div>
    <div class="card"><h3>Streaming info from JustWatch</h3>
      <p>Where-to-watch information is provided by <a href="https://www.justwatch.com" target="_blank" rel="noopener">JustWatch</a>, delivered through TMDB's watch provider data.</p>
      <p class="author" style="margin:0">Availability changes often and can differ by region.</p></div>
    <div class="card"><h3>Your data</h3><p class="author" style="margin:0">Your lists live on this device. If you sign in with Google, a copy is kept in a hidden app folder in your own Google Drive that only this app can see. Nothing is sent anywhere else.</p></div>`,
  };
}

// ---------- startup ----------
store.on('library', () => { sync.scheduleSync(); renderNav(); if (['library', 'home'].includes(current.name)) redraw(); });
store.on('updates', () => { renderNav(); if (['home', 'alerts', 'library'].includes(current.name)) redraw(); });
store.on('sync', (st) => { const line = $id('sync-line'); if (line) line.textContent = syncLine(st); });

async function startup() {
  applyTheme(currentTheme());
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme(currentTheme()));
  await route();
  if (sync.isSignedIn() && sync.hasValidToken()) {
    try { await sync.syncNow(); } catch (e) { console.warn('Sync failed', e); }
  } else if (sync.isSignedIn()) sync.preload();
  if (store.getSettings().tmdbKey) {
    try { await checkUpdates(); } catch (e) { console.warn('Update check failed', e); }
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
