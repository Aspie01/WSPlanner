import { $, esc, fmtNum, fmtDur, parseNum, parseDur, toast } from '../util.js';
import { RESOURCE_LABELS } from '../store.js';
import { gd, setOverride, clearOverride, hasOverride, levelRows } from '../gamedata.js';

const SECTIONS = [
  { key: 'vsDuel', name: 'VS Duel', blurb: 'Day themes, what to bank, and the points-per-action rates.' },
  { key: 'buildings', name: 'Buildings', blurb: 'Upgrade costs and build times per level.' },
  { key: 'research', name: 'Research', blurb: 'Research costs and times per level.' },
  { key: 'troops', name: 'Troops', blurb: 'Training and promotion costs per troop.' },
];

export default {
  async render(root, ctx) {
    const section = ctx.query.get('s') || 'buildings';
    const active = SECTIONS.find((s) => s.key === section) || SECTIONS[1];

    root.innerHTML = `
      <h1>Game Data</h1>
      <p class="page-intro">The app ships with the structure but almost no numbers, because upgrade costs and point rates
        change with every patch and a wrong number is worse than a blank one. Fill in what you use, when you use it —
        edits are saved on this device and travel with your export.</p>

      <div class="btn-row" style="margin-bottom:14px">
        ${SECTIONS.map((s) => `<a class="btn small ${s.key === active.key ? 'primary' : ''}" href="#/data?s=${s.key}">${esc(s.name)}${hasOverride(s.key) ? ' •' : ''}</a>`).join('')}
      </div>

      <div class="card">
        <div class="card-head">
          <h2>${esc(active.name)}</h2>
          ${hasOverride(active.key) ? '<span class="pill accent">edited</span>' : '<span class="pill">as shipped</span>'}
          <span class="spacer"></span>
          <button class="btn small danger" id="resetSection" ${hasOverride(active.key) ? '' : 'disabled'}>Reset to shipped data</button>
        </div>
        <p class="muted small" style="margin-top:0">${esc(active.blurb)}
          Fill in only the levels you are actually working towards — a blank row costs nothing and the
          Growth Plan will tell you when a step it needs has no numbers.</p>
        <div id="editor"></div>
      </div>

      <details class="acc">
        <summary>Advanced: edit the raw JSON for ${esc(active.name)}</summary>
        <div>
          <p class="muted small">For bulk edits — paste a table in from a spreadsheet, or hand the whole section to someone else.</p>
          <textarea id="rawJson" spellcheck="false">${esc(JSON.stringify(gd(active.key), null, 2))}</textarea>
          <div class="btn-row" style="margin-top:8px">
            <button class="btn primary" id="saveRaw">Save JSON</button>
            <button class="btn" id="revertRaw">Revert</button>
          </div>
          <div id="rawError" class="hint" style="color:var(--bad)"></div>
        </div>
      </details>
    `;

    $('#resetSection', root).addEventListener('click', () => {
      if (!confirm(`Throw away your edits to ${active.name} and go back to the data the app shipped with?`)) return;
      clearOverride(active.key);
      toast('Reset to shipped data');
      ctx.rerender();
    });

    $('#saveRaw', root).addEventListener('click', () => {
      try {
        const parsed = JSON.parse($('#rawJson', root).value);
        setOverride(active.key, parsed);
        toast('Saved');
        ctx.rerender();
      } catch (err) {
        $('#rawError', root).textContent = `That is not valid JSON: ${err.message}`;
      }
    });

    $('#revertRaw', root).addEventListener('click', () => {
      $('#rawJson', root).value = JSON.stringify(gd(active.key), null, 2);
      $('#rawError', root).textContent = '';
    });

    const editor = $('#editor', root);
    if (active.key === 'buildings') renderLevelEditor(editor, ctx, 'buildings');
    else if (active.key === 'research') renderLevelEditor(editor, ctx, 'research');
    else if (active.key === 'vsDuel') renderRateEditor(editor, ctx);
    else renderTroopsInfo(editor);
  },
};

/* ---------- Buildings / research level tables ---------- */

function entriesFor(sectionKey, treeKey) {
  const data = gd(sectionKey);
  if (sectionKey === 'buildings') return data?.entries || [];
  return data?.trees?.find((t) => t.key === treeKey)?.entries || [];
}

function renderLevelEditor(host, ctx, sectionKey) {
  const data = gd(sectionKey);
  const trees = sectionKey === 'research' ? (data?.trees || []) : null;
  const resourceKeys = data?.resourceKeys || ['meat', 'wood', 'coal', 'iron', 'steel'];

  const treeKey = trees?.[0]?.key;
  host.innerHTML = `
    ${data?.namesVerified === false ? `<div class="note"><strong>These node names are not confirmed.</strong>
      The three trees and their level caps were checked, but the individual entries are placeholders so the Growth Plan
      has something to pick from. Rename them to match your Research Center, or delete the ones you never touch.
      ${esc(data.levelNote || '')}</div>` : ''}
    <div class="grid ${trees ? 'cols-3' : 'cols-2'}">
      ${trees ? `<div class="field"><label>Tree</label><select id="treeSel">
        ${trees.map((t) => `<option value="${esc(t.key)}">${esc(t.name)}</option>`).join('')}</select></div>` : ''}
      <div class="field"><label>${sectionKey === 'buildings' ? 'Building' : 'Research'}</label><select id="entrySel"></select></div>
      <div class="field"><label>Levels to show</label><select id="rangeSel">
        <option value="10" selected>1–10</option><option value="20">1–20</option><option value="99">All</option>
      </select></div>
    </div>
    <div id="levelTable"></div>`;

  const state = { treeKey, entryKey: null, limit: 10 };

  const syncEntries = () => {
    const list = entriesFor(sectionKey, state.treeKey);
    $('#entrySel', host).innerHTML = list.map((e) => `<option value="${esc(e.key)}">${esc(e.name)}</option>`).join('');
    state.entryKey = list[0]?.key || null;
  };

  const drawTable = () => {
    const entry = entriesFor(sectionKey, state.treeKey).find((e) => e.key === state.entryKey);
    const rows = levelRows(entry).slice(0, state.limit);
    if (!entry) { $('#levelTable', host).innerHTML = '<p class="empty">Nothing to edit here.</p>'; return; }

    $('#levelTable', host).innerHTML = `
      ${entry.note ? `<div class="note">${esc(entry.note)}</div>` : ''}
      <div class="table-wrap">
        <table>
          <thead><tr><th>Level</th>${resourceKeys.map((k) => `<th class="right">${esc(RESOURCE_LABELS[k] || k)}</th>`).join('')}<th class="right">Time</th></tr></thead>
          <tbody>
            ${rows.map((row) => `
              <tr data-level="${row.level}">
                <td class="tnum">${row.level}</td>
                ${resourceKeys.map((k) => `<td class="right"><input type="text" data-cell="${esc(k)}" value="${row.resources?.[k] ? esc(fmtNum(row.resources[k])) : ''}" placeholder="—" style="width:92px;text-align:right"></td>`).join('')}
                <td class="right"><input type="text" data-cell="timeMin" value="${row.timeMin ? esc(fmtDur(row.timeMin)) : ''}" placeholder="—" style="width:110px;text-align:right"></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <p class="faint small">Blank means "not filled in yet" — the Growth Plan will say so rather than pretend the step is free.</p>`;
  };

  // Bound once: the table's contents are redrawn, but the container is not.
  $('#levelTable', host).addEventListener('change', (ev) => {
    const cell = ev.target.dataset.cell;
    if (!cell) return;
    const level = Number(ev.target.closest('[data-level]').dataset.level);
    const value = cell === 'timeMin' ? parseDur(ev.target.value) : parseNum(ev.target.value);

    const next = structuredClone(gd(sectionKey));
    const list = sectionKey === 'buildings'
      ? next.entries
      : next.trees.find((t) => t.key === state.treeKey).entries;
    const target = list.find((e) => e.key === state.entryKey);
    // levelRows() fills in the blank rows so a sparse table can be edited anywhere.
    target.levels = levelRows(target).map((r) => ({ ...r, resources: { ...(r.resources || {}) } }));
    const row = target.levels.find((r) => Number(r.level) === level);
    if (cell === 'timeMin') row.timeMin = value || null;
    else if (value > 0) row.resources[cell] = value;
    else delete row.resources[cell];

    setOverride(sectionKey, next);
    ev.target.value = cell === 'timeMin'
      ? (value ? fmtDur(value) : '')
      : (value ? fmtNum(value) : '');
  });

  if (trees) {
    $('#treeSel', host).addEventListener('change', (ev) => {
      state.treeKey = ev.target.value;
      syncEntries();
      drawTable();
    });
  }
  $('#entrySel', host).addEventListener('change', (ev) => { state.entryKey = ev.target.value; drawTable(); });
  $('#rangeSel', host).addEventListener('change', (ev) => { state.limit = Number(ev.target.value); drawTable(); });

  syncEntries();
  drawTable();
}

/* ---------- VS Duel point rates ---------- */

function renderRateEditor(host, ctx) {
  const data = gd('vsDuel');
  host.innerHTML = `
    <div class="note">Point values are the one thing worth checking in-game. Do one action, look at the score it gave you,
      and put the real number in here — from then on the VS Duel estimate is trustworthy.</div>
    ${(data?.days || []).map((day) => `
      <details class="acc">
        <summary>Day ${day.n} · ${esc(day.name)}</summary>
        <div>
          <div class="table-wrap"><table>
            <thead><tr><th>Action</th><th>Per</th><th class="right">Points</th><th>Checked?</th></tr></thead>
            <tbody>
              ${(day.scoring || []).map((line) => `
                <tr data-day="${day.n}" data-line="${esc(line.id)}">
                  <td class="wrap">${esc(line.label)}</td>
                  <td class="faint small">${esc(line.unit)}</td>
                  <td class="right"><input type="text" data-cell="points" value="${line.points ?? ''}" style="width:90px;text-align:right"></td>
                  <td>${line.verified === false ? '<span class="pill warm">unverified</span>' : '<span class="pill good">checked</span>'}</td>
                </tr>`).join('')}
            </tbody>
          </table></div>
        </div>
      </details>`).join('')}
  `;

  host.addEventListener('change', (ev) => {
    if (ev.target.dataset.cell !== 'points') return;
    const tr = ev.target.closest('[data-line]');
    const next = structuredClone(gd('vsDuel'));
    const line = next.days.find((d) => d.n === Number(tr.dataset.day))?.scoring?.find((l) => l.id === tr.dataset.line);
    if (!line) return;
    line.points = parseNum(ev.target.value);
    line.verified = true;
    setOverride('vsDuel', next);
    ctx.rerender();
  });
}

function renderTroopsInfo(host) {
  const data = gd('troops');
  host.innerHTML = `
    <p class="muted small">Troop costs vary by tier and by your own research, so this section is left for you to fill in
      through the raw JSON below using the shape shown in <code>entrySchema</code>. For a one-off calculation, a
      <strong>Custom</strong> step on the Growth Plan is usually quicker.</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Type</th><th>Role</th></tr></thead>
      <tbody>${(data?.types || []).map((t) => `<tr><td>${esc(t.name)}</td><td class="wrap muted">${esc(t.role)}</td></tr>`).join('')}</tbody>
    </table></div>`;
}
