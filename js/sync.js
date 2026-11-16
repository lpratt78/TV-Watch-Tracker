// Google Drive sync using the hidden appDataFolder (scope: drive.appdata).
// The app only ever sees its own file; it cannot read anything else in Drive.
import { getSettings, saveSettings, getLibrary, setLibrary, mergeLibraries, emit } from './store.js';

const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const FILE_NAME = 'watch-tracker.json';
const TOKEN_KEY = 'wt.gtoken';
const FILE_ID_KEY = 'wt.gfileid';
const GIS_SRC = 'https://accounts.google.com/gsi/client';

let tokenClient = null;
let gisLoading = null;
let state = { status: 'off', lastSync: Number(localStorage.getItem('wt.lastSync')) || 0, error: null };

export const syncState = () => state;
function setState(patch) { state = { ...state, ...patch }; emit('sync', state); }

function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  gisLoading ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = GIS_SRC; s.async = true; s.onload = resolve;
    s.onerror = () => { gisLoading = null; reject(new Error('Could not load Google sign-in (are you offline?)')); };
    document.head.appendChild(s);
  });
  return gisLoading;
}

export const preload = () => loadGis().catch(() => {});

function savedToken() {
  try {
    const t = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null');
    return t && t.expiresAt > Date.now() + 60_000 ? t.token : null;
  } catch { return null; }
}

// Must be called from a user gesture (button tap) the first time, so the popup isn't blocked.
export async function signIn({ interactive = true } = {}) {
  const { googleClientId } = getSettings();
  if (!googleClientId) throw new Error('Add your Google OAuth client ID in Settings first.');
  await loadGis();
  return new Promise((resolve, reject) => {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: googleClientId,
      scope: SCOPE,
      callback: (resp) => {
        if (resp.error) { reject(new Error(resp.error_description || resp.error)); return; }
        localStorage.setItem(TOKEN_KEY, JSON.stringify({ token: resp.access_token, expiresAt: Date.now() + (resp.expires_in || 3600) * 1000 }));
        saveSettings({ autoSync: true });
        resolve(resp.access_token);
      },
      error_callback: (err) => reject(new Error(err?.message || err?.type || 'Sign-in was cancelled')),
    });
    // First sign-in always shows the account picker, so you can choose which Google account holds the backup.
    tokenClient.requestAccessToken({ prompt: !interactive ? 'none' : getSettings().autoSync ? '' : 'select_account' });
  });
}

export function signOut() {
  const t = savedToken();
  if (t && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(t, () => {});
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(FILE_ID_KEY);
  saveSettings({ autoSync: false });
  setState({ status: 'off', error: null });
}

export const isSignedIn = () => !!getSettings().autoSync;
export const hasValidToken = () => !!savedToken();

async function api(token, url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { authorization: `Bearer ${token}`, ...(opts.headers || {}) } });
  if (res.status === 401) { localStorage.removeItem(TOKEN_KEY); throw Object.assign(new Error('Google sign-in expired'), { code: 401 }); }
  if (!res.ok) throw new Error(`Google Drive error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res;
}

async function findFile(token) {
  const cached = localStorage.getItem(FILE_ID_KEY);
  if (cached) return cached;
  const q = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`);
  const res = await api(token, `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)&orderBy=modifiedTime desc`);
  const { files } = await res.json();
  const id = files?.[0]?.id || null;
  if (id) localStorage.setItem(FILE_ID_KEY, id);
  return id;
}

async function download(token, id) {
  try {
    const res = await api(token, `https://www.googleapis.com/drive/v3/files/${id}?alt=media`);
    return await res.json();
  } catch (e) {
    if (/ 404/.test(e.message)) { localStorage.removeItem(FILE_ID_KEY); return null; }
    throw e;
  }
}

async function upload(token, id, data) {
  const body = JSON.stringify(data);
  if (id) {
    await api(token, `https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body,
    });
    return id;
  }
  const boundary = 'wt' + Math.random().toString(36).slice(2);
  const meta = { name: FILE_NAME, parents: ['appDataFolder'], mimeType: 'application/json' };
  const multipart =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
  const res = await api(token, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST', headers: { 'content-type': `multipart/related; boundary=${boundary}` }, body: multipart,
  });
  const { id: newId } = await res.json();
  localStorage.setItem(FILE_ID_KEY, newId);
  return newId;
}

let syncing = null;
// Pull, merge, push. `interactive` allows a sign-in popup when the token has expired.
export function syncNow({ interactive = false } = {}) {
  if (syncing) return syncing;
  syncing = (async () => {
    if (!navigator.onLine) { setState({ status: 'offline' }); return; }
    let token = savedToken();
    if (!token) {
      if (!interactive) { setState({ status: 'needs-signin' }); return; }
      token = await signIn();
    }
    setState({ status: 'syncing', error: null });
    try {
      let id = await findFile(token);
      let remote = id ? await download(token, id) : null;
      if (id && !remote) id = await findFile(token);
      const local = getLibrary();
      const merged = remote ? mergeLibraries(local, remote) : local;
      setLibrary(merged, { silent: JSON.stringify(merged.items) === JSON.stringify(local.items) && JSON.stringify(merged.seenUpdates) === JSON.stringify(local.seenUpdates) });
      await upload(token, id, merged);
      const now = Date.now();
      localStorage.setItem('wt.lastSync', String(now));
      setState({ status: 'ok', lastSync: now });
    } catch (e) {
      setState({ status: e.code === 401 ? 'needs-signin' : 'error', error: e.message });
      throw e;
    }
  })().finally(() => { syncing = null; });
  return syncing;
}

// Debounced push after local edits.
let timer = null;
export function scheduleSync() {
  if (!isSignedIn()) return;
  clearTimeout(timer);
  timer = setTimeout(() => { syncNow().catch(() => {}); }, 4000);
}
