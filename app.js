// Bootstrap + hash router.
//
// Hash routing (rather than history routing) is deliberate: GitHub Pages serves
// static files only, so a deep link like /calendar would 404 on refresh.

import { $, $$, toast } from './js/util.js';
import { load, getState, update, subscribe } from './js/store.js';
import { loadGameData, seedFor } from './js/gamedata.js';
import { serverNow, fmtCountdown, offsetLabel } from './js/time.js';

import dashboard from './js/views/dashboard.js';
import vsduel from './js/views/vsduel.js';
import calendar from './js/views/calendar.js';
import growth from './js/views/growth.js';
import inventory from './js/views/inventory.js';
import roster from './js/views/roster.js';
import gamedata from './js/views/gamedata.js';
import settings from './js/views/settings.js';
import importView from './js/views/import.js';

const ROUTES = {
  '': dashboard,
  'vs-duel': vsduel,
  calendar,
  growth,
  inventory,
  roster,
  data: gamedata,
  settings,
  import: importView,
};

const viewEl = $('#view');
let currentCleanup = null;

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, queryString = ''] = raw.split('?');
  return { path: path.replace(/\/$/, ''), query: new URLSearchParams(queryString) };
}

async function render() {
  const { path, query } = parseHash();
  const view = ROUTES[path] || ROUTES[''];

  if (typeof currentCleanup === 'function') currentCleanup();
  currentCleanup = null;

  $$('.sidenav a').forEach((a) => a.classList.toggle('active', a.dataset.route === (ROUTES[path] ? path : '')));
  closeNav();

  viewEl.innerHTML = '<div class="loading">Loading…</div>';
  try {
    currentCleanup = await view.render(viewEl, { query, rerender: render });
  } catch (err) {
    console.error('view failed to render', err);
    viewEl.innerHTML = `<div class="card"><h1>Something went wrong</h1>
      <p class="muted">This page could not be drawn. The error was:</p>
      <pre class="small">${String(err && err.message ? err.message : err)}</pre>
      <p class="muted small">Your saved data is untouched. Try another page, or reset from Settings if it keeps happening.</p></div>`;
  }
  viewEl.scrollTop = 0;
  window.scrollTo(0, 0);
  // Fill in countdowns immediately rather than leaving placeholders until the
  // next interval tick.
  tick();
}

/* ---------- Chrome: nav, theme, clock ---------- */

function openNav() {
  $('#sidenav').classList.add('open');
  $('#scrim').hidden = false;
  $('#menuBtn').setAttribute('aria-expanded', 'true');
}

function closeNav() {
  $('#sidenav').classList.remove('open');
  $('#scrim').hidden = true;
  $('#menuBtn').setAttribute('aria-expanded', 'false');
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === 'light' ? '#eef3fb' : '#0b1220';
}

function tick() {
  const { serverOffsetMin } = getState().profile;
  const s = serverNow(serverOffsetMin);
  const clock = $('#serverClock');
  if (clock) {
    const hh = String(s.getUTCHours()).padStart(2, '0');
    const mm = String(s.getUTCMinutes()).padStart(2, '0');
    clock.textContent = `${hh}:${mm} ${offsetLabel(serverOffsetMin)}`;
  }
  // Any view can drop in <span data-cd="<epoch ms>"> and get a live countdown.
  for (const el of $$('[data-cd]')) {
    const target = Number(el.dataset.cd);
    const diff = target - Date.now();
    el.textContent = fmtCountdown(diff);
    el.classList.toggle('live', diff <= 0);
    el.classList.toggle('soon', diff > 0 && diff < 3600_000);
  }
}

async function main() {
  await loadGameData();
  const seedEvents = seedFor('events')?.events ?? [];
  load(seedEvents);

  applyTheme(getState().profile.theme === 'light' ? 'light' : 'dark');

  $('#menuBtn').addEventListener('click', () => {
    ($('#sidenav').classList.contains('open') ? closeNav : openNav)();
  });
  $('#scrim').addEventListener('click', closeNav);
  $('#themeBtn').addEventListener('click', () => {
    const next = getState().profile.theme === 'light' ? 'dark' : 'light';
    update((s) => { s.profile.theme = next; });
    applyTheme(next);
  });

  subscribe(() => tick());
  window.addEventListener('hashchange', render);
  setInterval(tick, 1000);

  await render();
  tick();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    // Registered relative to this file so it works from a project-page subpath.
    navigator.serviceWorker.register(new URL('sw.js', import.meta.url)).catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  viewEl.innerHTML = `<div class="card"><h1>Could not start</h1><p class="muted">${String(err.message || err)}</p></div>`;
  toast('Startup failed');
});
