import { $, $$, esc, uid, fmtNum, fmtDur, parseNum, parseDur, toast } from '../util.js';
import { getState, update, RESOURCE_KEYS, RESOURCE_LABELS, SPEEDUP_KEYS, SPEEDUP_LABELS, CATEGORY_SPEEDUP } from '../store.js';
import { gd, costBetween } from '../gamedata.js';

const KIND_LABELS = { building: 'Building', research: 'Research', troops: 'Troops', custom: 'Custom' };

/** Cost for one queue entry: manual numbers win, otherwise look it up in the tables. */
export function resolveEntry(entry) {
  if (entry.manual || entry.kind === 'custom') {
    return {
      resources: entry.resources || {},
      timeMin: Number(entry.timeMin) || 0,
      known: true,
      missing: 0,
    };
  }
  const levels = findLevels(entry);
  const cost = costBetween(levels, entry.fromLevel, entry.toLevel);
  if (!cost) return { resources: {}, timeMin: 0, known: false, missing: 0 };
  return {
    resources: cost.resources,
    timeMin: cost.timeMin,
    known: cost.missing < cost.steps,
    missing: cost.missing,
  };
}

function findLevels(entry) {
  if (entry.kind === 'building') {
    return gd('buildings')?.entries?.find((e) => e.key === entry.entryKey)?.levels || [];
  }
  if (entry.kind === 'research') {
    const tree = gd('research')?.trees?.find((t) => t.key === entry.treeKey);
    return tree?.entries?.find((e) => e.key === entry.entryKey)?.levels || [];
  }
  return [];
}

export function queueTotals(queue) {
  const totals = {
    pending: 0,
    timeMin: 0,
    resources: Object.fromEntries(RESOURCE_KEYS.map((k) => [k, 0])),
    byCategory: { construction: 0, research: 0, training: 0, general: 0 },
    unknown: 0,
  };
  for (const entry of queue) {
    if (entry.done) continue;
    totals.pending++;
    const cost = resolveEntry(entry);
    if (!cost.known) { totals.unknown++; continue; }
    totals.timeMin += cost.timeMin;
    totals.byCategory[CATEGORY_SPEEDUP[entry.kind] || 'general'] += cost.timeMin;
    for (const [k, v] of Object.entries(cost.resources)) {
      totals.resources[k] = (totals.resources[k] || 0) + Number(v || 0);
    }
  }
  return totals;
}

function entryTitle(entry) {
  if (entry.kind === 'custom') return entry.label || 'Custom step';
  if (entry.kind === 'troops') return `${entry.label || 'Troops'} × ${fmtNum(entry.qty || 0)}`;
  return `${entry.label || 'Upgrade'} · ${entry.fromLevel} → ${entry.toLevel}`;
}

export default {
  async render(root, ctx) {
    const state = getState();
    const buildings = gd('buildings')?.entries || [];
    const trees = gd('research')?.trees || [];
    const totals = queueTotals(state.queue);
    const inv = state.inventory;

    root.innerHTML = `
      <h1>Growth Plan</h1>
      <p class="page-intro">Queue up the upgrades you are working towards and see the total cost in one place —
        what you need, what you already have, and how much speedup it would take to finish.</p>

      ${totals.unknown ? `<div class="note"><strong>${totals.unknown} step${totals.unknown === 1 ? '' : 's'} have no cost data.</strong>
        Fill in the level tables under <a href="#/data">Game Data</a>, or edit the step and enter the numbers by hand.</div>` : ''}

      <div class="grid cols-2">
        <div class="card">
          <div class="card-head"><h2>Total cost</h2><span class="spacer"></span>
            <span class="pill">${totals.pending} step${totals.pending === 1 ? '' : 's'}</span></div>
          ${totals.pending ? `
            <div class="table-wrap">
              <table>
                <thead><tr><th>Resource</th><th class="right">Needed</th><th class="right">Have</th><th class="right">Short by</th></tr></thead>
                <tbody>
                  ${RESOURCE_KEYS.filter((k) => totals.resources[k] > 0).map((k) => {
                    const need = totals.resources[k];
                    const have = Number(inv.resources[k]) || 0;
                    const short = Math.max(0, need - have);
                    return `<tr>
                      <td>${esc(RESOURCE_LABELS[k])}</td>
                      <td class="right tnum">${fmtNum(need)}</td>
                      <td class="right tnum ${have >= need ? '' : 'muted'}">${fmtNum(have)}</td>
                      <td class="right tnum">${short ? `<span style="color:var(--bad)">${fmtNum(short)}</span>` : '<span class="pill good">covered</span>'}</td>
                    </tr>`;
                  }).join('') || '<tr><td colspan="4" class="muted">No resource costs recorded on these steps.</td></tr>'}
                </tbody>
              </table>
            </div>
            <p class="small muted" style="margin:12px 0 0">Total build time <strong>${fmtDur(totals.timeMin) || '0m'}</strong> before speedups or research bonuses.</p>
          ` : '<p class="empty">Nothing queued yet.</p>'}
        </div>

        <div class="card">
          <div class="card-head"><h2>Speedup coverage</h2></div>
          ${['construction', 'research', 'training'].map((cat) => {
            const need = totals.byCategory[cat];
            const have = (Number(inv.speedups[cat]) || 0) + (Number(inv.speedups.general) || 0);
            const pct = need ? Math.min(100, (have / need) * 100) : 0;
            return `
              <div style="margin-bottom:12px">
                <div class="small" style="display:flex;gap:8px;margin-bottom:4px">
                  <span>${esc(SPEEDUP_LABELS[cat])}</span>
                  <span class="spacer" style="margin-left:auto"></span>
                  <span class="muted tnum">${fmtDur(have, { compact: true }) || '0m'} of ${fmtDur(need, { compact: true }) || '0m'}</span>
                </div>
                <div class="bar"><span style="width:${pct.toFixed(1)}%"></span></div>
              </div>`;
          }).join('')}
          <p class="faint small">Category speedups are counted together with your General speedups, since General can be spent anywhere.</p>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Queue</h2><span class="spacer"></span>
          <button class="btn small" id="addBtn">Add step</button></div>
        <div id="queueList">${renderQueue(state.queue)}</div>
      </div>

      <details class="acc" id="addPanel">
        <summary>Add a step</summary>
        <div>
          <div class="field">
            <label for="kind">Type</label>
            <select id="kind">
              ${Object.entries(KIND_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
            </select>
          </div>
          <div id="kindFields"></div>
          <div class="btn-row"><button class="btn primary" id="saveStep">Add to queue</button></div>
        </div>
      </details>
    `;

    const panel = $('#addPanel', root);
    const kindSel = $('#kind', root);
    const fields = $('#kindFields', root);

    const drawFields = () => {
      const kind = kindSel.value;
      if (kind === 'building') {
        fields.innerHTML = `
          <div class="grid cols-3">
            <div class="field"><label>Building</label>
              <select id="entryKey">${buildings.map((b) => `<option value="${esc(b.key)}">${esc(b.name)}</option>`).join('')}</select></div>
            <div class="field"><label>From level</label><input type="number" id="fromLevel" value="1" min="0"></div>
            <div class="field"><label>To level</label><input type="number" id="toLevel" value="2" min="1"></div>
          </div>`;
      } else if (kind === 'research') {
        fields.innerHTML = `
          <div class="grid cols-4">
            <div class="field"><label>Tree</label>
              <select id="treeKey">${trees.map((t) => `<option value="${esc(t.key)}">${esc(t.name)}</option>`).join('')}</select></div>
            <div class="field"><label>Research</label><select id="entryKey"></select></div>
            <div class="field"><label>From level</label><input type="number" id="fromLevel" value="0" min="0"></div>
            <div class="field"><label>To level</label><input type="number" id="toLevel" value="1" min="1"></div>
          </div>`;
        const syncResearch = () => {
          const tree = trees.find((t) => t.key === $('#treeKey', root).value);
          $('#entryKey', root).innerHTML = (tree?.entries || [])
            .map((e) => `<option value="${esc(e.key)}">${esc(e.name)}</option>`).join('');
        };
        $('#treeKey', root).addEventListener('change', syncResearch);
        syncResearch();
      } else if (kind === 'troops') {
        fields.innerHTML = `
          <div class="grid cols-2">
            <div class="field"><label>Description</label><input type="text" id="label" placeholder="Promote Marksman T9 → T10"></div>
            <div class="field"><label>How many</label><input type="text" id="qty" placeholder="50000"></div>
          </div>
          ${manualCostFields()}`;
      } else {
        fields.innerHTML = `
          <div class="field"><label>Description</label><input type="text" id="label" placeholder="Chief Gear — Coat to Epic T2"></div>
          ${manualCostFields()}`;
      }
    };

    kindSel.addEventListener('change', drawFields);
    drawFields();

    $('#addBtn', root).addEventListener('click', () => {
      panel.open = true;
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    $('#saveStep', root).addEventListener('click', () => {
      const kind = kindSel.value;
      const entry = { id: uid('q'), kind, done: false };

      if (kind === 'building' || kind === 'research') {
        entry.entryKey = $('#entryKey', root).value;
        entry.fromLevel = Number($('#fromLevel', root).value) || 0;
        entry.toLevel = Number($('#toLevel', root).value) || 0;
        if (entry.toLevel <= entry.fromLevel) return toast('The target level must be higher than the current one.');
        if (kind === 'research') entry.treeKey = $('#treeKey', root).value;
        const source = kind === 'building'
          ? buildings.find((b) => b.key === entry.entryKey)
          : trees.find((t) => t.key === entry.treeKey)?.entries.find((e) => e.key === entry.entryKey);
        entry.label = source?.name || entry.entryKey;
      } else {
        entry.label = ($('#label', root).value || '').trim();
        if (!entry.label) return toast('Give the step a description.');
        entry.manual = true;
        entry.timeMin = parseDur($('#timeMin', root).value);
        entry.resources = readResourceInputs(root);
        if (kind === 'troops') entry.qty = parseNum($('#qty', root).value);
      }

      update((s) => { s.queue.push(entry); });
      toast('Added to the queue');
      ctx.rerender();
    });

    bindQueueEvents(root, ctx);
  },
};

function manualCostFields(values = {}) {
  return `
    <div class="field"><label>Time needed</label>
      <input type="text" id="timeMin" value="${values.timeMin ? esc(fmtDur(values.timeMin)) : ''}" placeholder="2d 6h 30m">
      <div class="hint">Type it however you like — <code>2d 6h</code>, <code>90m</code>, or a plain number of minutes.</div></div>
    <div class="field"><label>Resources needed</label>
      <div class="grid cols-3">
        ${RESOURCE_KEYS.map((k) => `
          <div><label class="small muted" for="res_${k}">${esc(RESOURCE_LABELS[k])}</label>
            <input type="text" id="res_${k}" data-res="${k}" value="${values.resources?.[k] ? esc(fmtNum(values.resources[k])) : ''}" placeholder="0"></div>`).join('')}
      </div>
      <div class="hint">Short forms work: <code>12.5M</code>, <code>800k</code>.</div></div>`;
}

function readResourceInputs(root) {
  const out = {};
  for (const input of $$('[data-res]', root)) {
    const v = parseNum(input.value);
    if (v > 0) out[input.dataset.res] = v;
  }
  return out;
}

function renderQueue(queue) {
  if (!queue.length) return '<p class="empty">Nothing queued. Add the upgrades you are saving for and the totals above fill in.</p>';
  return queue.map((entry, i) => {
    const cost = resolveEntry(entry);
    const resourceBits = Object.entries(cost.resources)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${esc(RESOURCE_LABELS[k] || k)} ${fmtNum(v)}`)
      .join(' · ');
    return `
      <div class="list-row" data-id="${esc(entry.id)}">
        <input class="cbx" type="checkbox" data-act="done" title="Mark done"
               aria-label="Mark done" ${entry.done ? 'checked' : ''}>
        <div class="grow">
          <div class="title" style="${entry.done ? 'text-decoration:line-through;opacity:.55' : ''}">${esc(entryTitle(entry))}</div>
          <div class="sub">
            <span class="pill">${esc(KIND_LABELS[entry.kind] || entry.kind)}</span>
            ${cost.known
              ? `${cost.timeMin ? esc(fmtDur(cost.timeMin)) : 'no time set'}${resourceBits ? ` · ${resourceBits}` : ''}`
              : '<span class="pill bad">no cost data</span>'}
          </div>
        </div>
        <div class="row-actions">
          <button class="btn small" data-act="up" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
          <button class="btn small" data-act="down" ${i === queue.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
          <button class="btn small danger" data-act="del" aria-label="Remove">✕</button>
        </div>
      </div>`;
  }).join('');
}

function bindQueueEvents(root, ctx) {
  $('#queueList', root).addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-act]');
    if (!btn) return;
    const id = btn.closest('[data-id]')?.dataset.id;
    const act = btn.dataset.act;
    if (!id) return;

    update((s) => {
      const i = s.queue.findIndex((q) => q.id === id);
      if (i < 0) return;
      if (act === 'done') s.queue[i].done = !s.queue[i].done;
      if (act === 'del') s.queue.splice(i, 1);
      if (act === 'up' && i > 0) s.queue.splice(i - 1, 0, s.queue.splice(i, 1)[0]);
      if (act === 'down' && i < s.queue.length - 1) s.queue.splice(i + 1, 0, s.queue.splice(i, 1)[0]);
    });
    ctx.rerender();
  });
}
