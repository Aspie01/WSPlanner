import { $, esc, toast, download, readFile, copyText, debounce } from '../util.js';
import { getState, update, exportPayload, importPayload, resetState } from '../store.js';
import { buildShareUrl, MAX_SHARE_LENGTH } from '../share.js';
import { offsetLabel, localOffsetMin } from '../time.js';

const SCOPES = {
  schedule: 'Event schedule only — smallest, best for a share link',
  alliance: 'Schedule + roster + squads — what an alliance needs',
  all: 'Everything, including your own plan and resources',
};

const OFFSETS = Array.from({ length: 27 }, (_, i) => (i - 12) * 60);

export default {
  async render(root, ctx) {
    const state = getState();
    const localOff = localOffsetMin();

    root.innerHTML = `
      <h1>Settings &amp; Sharing</h1>
      <p class="page-intro">Everything you enter is stored on this device only — there is no account and no server.
        That also means it is not backed up, so export a copy now and then.</p>

      <div class="card">
        <div class="card-head"><h2>You</h2></div>
        <div class="grid cols-2">
          <div class="field"><label for="playerName">Your name in game</label>
            <input type="text" id="playerName" value="${esc(state.profile.playerName)}"></div>
          <div class="field"><label for="alliance">Alliance</label>
            <input type="text" id="alliance" value="${esc(state.profile.alliance)}" placeholder="e.g. FRZ"></div>
          <div class="field"><label for="stateNum">State</label>
            <input type="text" id="stateNum" value="${esc(state.profile.state)}" placeholder="e.g. 1042"></div>
          <div class="field"><label for="furnace">Furnace level</label>
            <input type="text" id="furnace" value="${esc(state.profile.furnaceLevel)}" placeholder="30 or FC5"></div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Server time</h2></div>
        <p class="muted small" style="margin-top:0">Every schedule in the app is written in server time. Most states run on UTC —
          if your in-game clock matches UTC, leave this alone.</p>
        <div class="grid cols-2">
          <div class="field"><label for="offset">Server timezone</label>
            <select id="offset">
              ${OFFSETS.map((o) => `<option value="${o}"${state.profile.serverOffsetMin === o ? ' selected' : ''}>${offsetLabel(o)}</option>`).join('')}
            </select>
            <div class="hint">Your device is on ${esc(offsetLabel(localOff))}.
              ${state.profile.serverOffsetMin === localOff ? 'Same as the server.' : `Server times are shown ${esc(offsetLabel(state.profile.serverOffsetMin))}.`}</div>
          </div>
          <div class="field"><label>&nbsp;</label>
            <button class="btn" id="matchLocal">Use my device timezone</button></div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Share with your alliance</h2></div>
        <p class="muted small" style="margin-top:0">A share link carries the data inside the link itself — nothing is uploaded.
          Send it in chat and whoever opens it gets the choice to merge it into their own planner.</p>
        <div class="field"><label for="scope">What to include</label>
          <select id="scope">${Object.entries(SCOPES).map(([k, v]) => `<option value="${k}"${k === 'schedule' ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
        <div class="btn-row">
          <button class="btn primary" id="makeLink">Create share link</button>
          <button class="btn" id="exportFile">Download as file</button>
          <button class="btn" id="importFile">Import a file</button>
        </div>
        <div id="shareOut" style="margin-top:12px"></div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Backup</h2></div>
        <p class="muted small" style="margin-top:0">A full export is your backup. Keep a copy somewhere safe — clearing your
          browser data or switching phones will otherwise lose everything.</p>
        <div class="btn-row">
          <button class="btn" id="backup">Download full backup</button>
          <button class="btn danger" id="reset">Erase everything</button>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Install on an iPhone or iPad</h2></div>
        <ol class="muted small" style="padding-left:20px;margin:0">
          <li>Open this page in Safari.</li>
          <li>Tap the Share button, then <strong>Add to Home Screen</strong>.</li>
          <li>It opens full-screen like an app, and works offline once loaded.</li>
        </ol>
        <p class="faint small" style="margin-bottom:0">Each device keeps its own data — installing it does not sync anything between phones.</p>
      </div>
    `;

    const bindText = (id, key) => {
      $(`#${id}`, root).addEventListener('input', debounce((ev) => {
        update((s) => { s.profile[key] = ev.target.value; });
      }, 300));
    };
    bindText('playerName', 'playerName');
    bindText('alliance', 'alliance');
    bindText('stateNum', 'state');
    bindText('furnace', 'furnaceLevel');

    $('#offset', root).addEventListener('change', (ev) => {
      update((s) => { s.profile.serverOffsetMin = Number(ev.target.value); });
      ctx.rerender();
    });

    $('#matchLocal', root).addEventListener('click', () => {
      update((s) => { s.profile.serverOffsetMin = localOff; });
      toast(`Server time set to ${offsetLabel(localOff)}`);
      ctx.rerender();
    });

    $('#makeLink', root).addEventListener('click', async () => {
      const scope = $('#scope', root).value;
      const out = $('#shareOut', root);
      try {
        const url = await buildShareUrl(exportPayload(scope));
        const tooLong = url.length > MAX_SHARE_LENGTH;
        out.innerHTML = `
          <div class="field">
            <label>Share link ${tooLong ? '<span class="pill bad">very long</span>' : `<span class="pill good">${url.length} characters</span>`}</label>
            <textarea id="shareUrl" readonly style="min-height:70px">${esc(url)}</textarea>
            ${tooLong ? '<div class="hint">Some chat apps cut links this long. A downloaded file is more reliable for a full export.</div>' : ''}
          </div>
          <button class="btn primary" id="copyLink">Copy link</button>`;
        $('#copyLink', root).addEventListener('click', async () => {
          toast(await copyText(url) ? 'Link copied' : 'Could not copy — select the text and copy it manually');
        });
      } catch (err) {
        out.innerHTML = `<p class="small" style="color:var(--bad)">${esc(err.message)}</p>`;
      }
    });

    $('#exportFile', root).addEventListener('click', () => {
      const scope = $('#scope', root).value;
      download(`ws-planner-${scope}.json`, JSON.stringify(exportPayload(scope), null, 2));
    });

    $('#backup', root).addEventListener('click', () => {
      const stamp = new Date().toISOString().slice(0, 10);
      download(`ws-planner-backup-${stamp}.json`, JSON.stringify(exportPayload('all'), null, 2));
    });

    $('#importFile', root).addEventListener('click', async () => {
      const text = await readFile();
      if (!text) return;
      try {
        const payload = JSON.parse(text);
        const replace = confirm(
          'Merge this into what you already have?\n\n'
          + 'OK — merge (keeps your data, adds and updates from the file)\n'
          + 'Cancel — replace everything with the file',
        ) ? 'merge' : 'replace';
        importPayload(payload, replace);
        toast(replace === 'merge' ? 'Merged' : 'Replaced');
        ctx.rerender();
      } catch (err) {
        toast(err.message || 'That file could not be read.');
      }
    });

    $('#reset', root).addEventListener('click', () => {
      if (!confirm('Erase every plan, event, roster entry and data edit on this device? This cannot be undone.')) return;
      if (!confirm('Really erase everything? Download a backup first if you are unsure.')) return;
      resetState();
      location.hash = '#/';
      ctx.rerender();
      toast('Everything erased');
    });
  },
};
