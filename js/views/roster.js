import { $, $$, esc, uid, fmtNum, parseNum, toast, download, readFile } from '../util.js';
import { getState, update } from '../store.js';
import { offsetLabel } from '../time.js';

const RANKS = ['R5', 'R4', 'R3', 'R2', 'R1'];
const TROOPS = { infantry: 'Infantry', lancer: 'Lancer', marksman: 'Marksman' };

const SORTS = {
  name: (a, b) => String(a.name || '').localeCompare(String(b.name || '')),
  power: (a, b) => (Number(a.power) || 0) - (Number(b.power) || 0),
  rank: (a, b) => RANKS.indexOf(b.rank || 'R1') - RANKS.indexOf(a.rank || 'R1'),
  furnace: (a, b) => String(a.furnace || '').localeCompare(String(b.furnace || ''), undefined, { numeric: true }),
};

function blankMember() {
  return { id: uid('m'), name: '', rank: 'R1', power: 0, furnace: '', troop: 'infantry', rallyLead: false,
    leadHero: '', leadSkillPct: 0, tz: '', notes: '', squad: '' };
}

export default {
  async render(root, ctx) {
    const state = getState();
    const { rosterSort, rosterDir } = state.ui;
    const members = state.roster.slice().sort(SORTS[rosterSort] || SORTS.power);
    if (rosterDir === 'desc') members.reverse();

    const totalPower = state.roster.reduce((a, m) => a + (Number(m.power) || 0), 0);
    const leads = state.roster.filter((m) => m.rallyLead);
    const byTroop = Object.keys(TROOPS).map((k) => [k, state.roster.filter((m) => m.troop === k).length]);
    const squads = state.squads || [];

    root.innerHTML = `
      <h1>Alliance Roster</h1>
      <p class="page-intro">Who is in the alliance, how strong they are, what they march, and who leads rallies.
        Export it and send it round so everyone is working from the same list.</p>

      <div class="grid cols-4" style="margin-bottom:14px">
        <div class="stat"><div class="label">Members</div><div class="value">${state.roster.length}</div></div>
        <div class="stat"><div class="label">Total power</div><div class="value">${fmtNum(totalPower)}</div></div>
        <div class="stat"><div class="label">Average power</div><div class="value">${state.roster.length ? fmtNum(totalPower / state.roster.length) : '—'}</div></div>
        <div class="stat"><div class="label">Rally leads</div><div class="value">${leads.length}</div>
          <div class="sub">${byTroop.map(([k, n]) => `${n} ${TROOPS[k].toLowerCase()}`).join(' · ')}</div></div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Members</h2><span class="spacer"></span>
          <button class="btn small primary" id="addMember">Add member</button>
          <button class="btn small" id="exportCsv">CSV</button>
          <button class="btn small" id="importCsv">Import</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th><button class="btn small" data-sort="name">Name</button></th>
                <th><button class="btn small" data-sort="rank">Rank</button></th>
                <th class="right"><button class="btn small" data-sort="power">Power</button></th>
                <th><button class="btn small" data-sort="furnace">Furnace</button></th>
                <th>Marches</th>
                <th class="right">Lead skill</th>
                <th>Squad</th>
                <th>Timezone</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="rosterBody">
              ${members.length ? members.map((m) => `
                <tr data-id="${esc(m.id)}">
                  <td>${esc(m.name || '—')} ${m.rallyLead ? '<span class="pill accent">rally</span>' : ''}</td>
                  <td>${esc(m.rank || '')}</td>
                  <td class="right tnum">${m.power ? fmtNum(m.power) : '—'}</td>
                  <td>${esc(m.furnace || '—')}</td>
                  <td>${esc(TROOPS[m.troop] || '—')}</td>
                  <td class="right tnum">${m.leadSkillPct ? esc(String(m.leadSkillPct)) + '%' : '—'}</td>
                  <td>${esc(m.squad || '—')}</td>
                  <td class="faint small">${esc(m.tz || '—')}</td>
                  <td class="right"><button class="btn small" data-act="edit">Edit</button></td>
                </tr>`).join('')
              : '<tr><td colspan="9" class="empty">No members yet.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <div id="editorSlot"></div>

      <div class="card">
        <div class="card-head"><h2>Squads</h2><span class="spacer"></span>
          <button class="btn small" id="addSquad">New squad</button></div>
        <p class="muted small" style="margin-top:0">Useful for Bear Trap march order, Foundry teams, or splitting rally duty.
          Assign a member to a squad from their edit panel.</p>
        <div id="squadList">
        ${squads.length ? squads.map((sq) => {
          const inSquad = state.roster.filter((m) => m.squad === sq.name);
          const power = inSquad.reduce((a, m) => a + (Number(m.power) || 0), 0);
          return `
            <details class="acc" data-squad="${esc(sq.id)}">
              <summary>${esc(sq.name)} <span class="pill">${inSquad.length} member${inSquad.length === 1 ? '' : 's'}</span>
                <span class="faint small"> — ${fmtNum(power)} power</span></summary>
              <div>
                <div class="field"><label>Name</label><input type="text" data-sf="name" value="${esc(sq.name)}"></div>
                <div class="field"><label>Purpose</label><input type="text" data-sf="notes" value="${esc(sq.notes || '')}" placeholder="Bear Trap first wave"></div>
                ${inSquad.length ? `<ul class="muted small" style="padding-left:18px">${inSquad.map((m) => `<li>${esc(m.name)} — ${fmtNum(m.power)} ${esc(TROOPS[m.troop] || '')}</li>`).join('')}</ul>` : '<p class="faint small">Nobody assigned yet.</p>'}
                <button class="btn small danger" data-act="delSquad">Delete squad</button>
              </div>
            </details>`;
        }).join('') : '<p class="empty">No squads yet.</p>'}
        </div>
      </div>
    `;

    /* ---- sorting ---- */
    for (const btn of $$('[data-sort]', root)) {
      btn.addEventListener('click', () => {
        const key = btn.dataset.sort;
        update((s) => {
          s.ui.rosterDir = s.ui.rosterSort === key && s.ui.rosterDir === 'desc' ? 'asc' : 'desc';
          s.ui.rosterSort = key;
        });
        ctx.rerender();
      });
    }

    /* ---- add / edit ---- */
    $('#addMember', root).addEventListener('click', () => {
      const m = blankMember();
      m.name = 'New member';
      update((s) => { s.roster.push(m); });
      ctx.rerender();
      setTimeout(() => openEditor(m.id, ctx), 0);
    });

    $('#rosterBody', root).addEventListener('click', (ev) => {
      if (ev.target.dataset?.act !== 'edit') return;
      openEditor(ev.target.closest('[data-id]').dataset.id, ctx);
    });

    /* ---- squads ---- */
    $('#addSquad', root).addEventListener('click', () => {
      update((s) => { s.squads.push({ id: uid('sq'), name: `Squad ${s.squads.length + 1}`, notes: '' }); });
      ctx.rerender();
    });

    const squadList = $('#squadList', root);
    squadList.addEventListener('change', (ev) => {
      const box = ev.target.closest('[data-squad]');
      if (!box || !ev.target.dataset.sf) return;
      update((s) => {
        const sq = s.squads.find((x) => x.id === box.dataset.squad);
        if (sq) sq[ev.target.dataset.sf] = ev.target.value;
      });
    });

    squadList.addEventListener('click', (ev) => {
      if (ev.target.dataset?.act !== 'delSquad') return;
      const box = ev.target.closest('[data-squad]');
      update((s) => { s.squads = s.squads.filter((x) => x.id !== box.dataset.squad); });
      ctx.rerender();
    });

    /* ---- CSV ---- */
    $('#exportCsv', root).addEventListener('click', () => {
      const head = ['name', 'rank', 'power', 'furnace', 'troop', 'rallyLead', 'leadHero', 'leadSkillPct', 'squad', 'tz', 'notes'];
      const rows = state.roster.map((m) => head.map((h) => csvCell(m[h])).join(','));
      download('ws-roster.csv', [head.join(','), ...rows].join('\n'), 'text/csv');
    });

    $('#importCsv', root).addEventListener('click', async () => {
      const text = await readFile('.csv,text/csv');
      if (!text) return;
      try {
        const added = importCsv(text);
        toast(`Imported ${added} member${added === 1 ? '' : 's'}`);
        ctx.rerender();
      } catch (err) {
        toast(err.message);
      }
    });
  },
};

function openEditor(id, ctx) {
  const slot = document.getElementById('editorSlot');
  const m = getState().roster.find((x) => x.id === id);
  if (!slot || !m) return;

  // A fresh node each time, so re-opening the editor never stacks listeners.
  const panel = document.createElement('div');
  panel.innerHTML = `
    <div class="card" style="border-color:var(--accent)">
      <div class="card-head"><h2>Edit member</h2><span class="spacer"></span>
        <button class="btn small" data-act="close">Close</button></div>
      <div class="grid cols-3">
        <div class="field"><label>Name</label><input type="text" data-mf="name" value="${esc(m.name)}"></div>
        <div class="field"><label>Rank</label><select data-mf="rank">
          ${RANKS.map((r) => `<option${m.rank === r ? ' selected' : ''}>${r}</option>`).join('')}</select></div>
        <div class="field"><label>Power</label><input type="text" data-mf="power" value="${m.power ? esc(fmtNum(m.power)) : ''}" placeholder="12.4M"></div>
        <div class="field"><label>Furnace level</label><input type="text" data-mf="furnace" value="${esc(m.furnace || '')}" placeholder="30 or FC5"></div>
        <div class="field"><label>Marches</label><select data-mf="troop">
          ${Object.entries(TROOPS).map(([k, v]) => `<option value="${k}"${m.troop === k ? ' selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="field"><label>Squad</label><input type="text" data-mf="squad" value="${esc(m.squad || '')}" list="squadNames">
          <datalist id="squadNames">${(getState().squads || []).map((s) => `<option value="${esc(s.name)}"></option>`).join('')}</datalist></div>
        <div class="field"><label>Lead hero (Bear Trap)</label>
          <input type="text" data-mf="leadHero" value="${esc(m.leadHero || '')}" placeholder="Hero in slot one"></div>
        <div class="field"><label>Their 1st Expedition Skill %</label>
          <input type="text" data-mf="leadSkillPct" value="${m.leadSkillPct ? esc(String(m.leadSkillPct)) : ''}" placeholder="e.g. 25" inputmode="decimal">
          <div class="hint">Ranks who should take the four rally buff slots.</div></div>
        <div class="field"><label>Timezone / usual hours</label><input type="text" data-mf="tz" value="${esc(m.tz || '')}" placeholder="${esc(offsetLabel(-new Date().getTimezoneOffset()))}, evenings"></div>
      </div>
      <div class="field"><label>Notes</label><input type="text" data-mf="notes" value="${esc(m.notes || '')}" placeholder="Hero teams, gear level, anything worth remembering"></div>
      <div class="btn-row">
        <label class="check"><input type="checkbox" data-mf="rallyLead" ${m.rallyLead ? 'checked' : ''}><span>Leads rallies</span></label>
        <span style="flex:1"></span>
        <button class="btn small danger" data-act="delMember">Remove member</button>
      </div>
    </div>`;
  slot.replaceChildren(panel);
  slot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  panel.addEventListener('change', (ev) => {
    const field = ev.target.dataset.mf;
    if (!field) return;
    update((s) => {
      const member = s.roster.find((x) => x.id === id);
      if (!member) return;
      if (field === 'rallyLead') member.rallyLead = ev.target.checked;
      else if (field === 'power' || field === 'leadSkillPct') member[field] = parseNum(ev.target.value);
      else member[field] = ev.target.value;
    });
    if (field === 'power') ev.target.value = fmtNum(getState().roster.find((x) => x.id === id).power);
  });

  panel.addEventListener('click', (ev) => {
    const act = ev.target.dataset?.act;
    if (act === 'close') { slot.replaceChildren(); ctx.rerender(); }
    if (act === 'delMember') {
      if (!confirm(`Remove ${m.name || 'this member'} from the roster?`)) return;
      update((s) => { s.roster = s.roster.filter((x) => x.id !== id); });
      slot.replaceChildren();
      ctx.rerender();
    }
  });
}

function csvCell(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Minimal CSV reader — handles quoted cells, which is all a roster export needs. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

function importCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('That CSV has no rows to import.');
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const nameIdx = head.indexOf('name');
  if (nameIdx < 0) throw new Error('The CSV needs a "name" column.');

  let added = 0;
  update((s) => {
    for (const row of rows.slice(1)) {
      const get = (key) => {
        const i = head.indexOf(key);
        return i >= 0 ? (row[i] || '').trim() : '';
      };
      const name = row[nameIdx]?.trim();
      if (!name) continue;
      const existing = s.roster.find((m) => m.name.toLowerCase() === name.toLowerCase());
      const member = existing || blankMember();
      member.name = name;
      member.rank = get('rank') || member.rank;
      member.power = get('power') ? parseNum(get('power')) : member.power;
      member.furnace = get('furnace') || member.furnace;
      member.troop = Object.keys(TROOPS).includes(get('troop').toLowerCase()) ? get('troop').toLowerCase() : member.troop;
      member.rallyLead = /^(1|true|yes|y)$/i.test(get('rallylead')) || member.rallyLead;
      member.leadHero = get('leadhero') || member.leadHero;
      member.leadSkillPct = get('leadskillpct') ? parseNum(get('leadskillpct')) : member.leadSkillPct;
      member.squad = get('squad') || member.squad;
      member.tz = get('tz') || member.tz;
      member.notes = get('notes') || member.notes;
      if (!existing) { s.roster.push(member); added++; }
    }
  });
  return added;
}
