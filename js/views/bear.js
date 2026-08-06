// Bear Trap organiser.
//
// Every recommendation here follows from four mechanics (see data/bear.json):
//   1. The Bear deals no damage, so there is nothing to tank — send marksmen.
//   2. A rally LEADER's three heroes all contribute every Expedition Skill.
//   3. Only the FIRST FOUR joiners buff the rally, and only via their lead
//      hero's 1st Expedition Skill.
//   4. Everyone joining after that adds no buff — hero level only raises how
//      many troops the march carries.
//
// So the advice genuinely changes with your role, which is why the role picker
// drives the whole page rather than being a display filter.

import { $, $$, esc, uid, fmtInt, fmtNum, parseNum, toast, debounce } from '../util.js';
import { getState, update } from '../store.js';
import { gd } from '../gamedata.js';
import { nextOccurrences, fmtLocal, fmtServer } from '../time.js';

const CLASSES = { infantry: 'Infantry', lancer: 'Lancer', marksman: 'Marksman' };
const ROLES = {
  lead: 'Leading the rally',
  early: 'Joining (one of the first four)',
  late: 'Joining (fifth or later)',
};

function skillTypes() {
  return gd('bear')?.skillTypes || [];
}

function isCombat(key) {
  return skillTypes().find((t) => t.key === key)?.combat === true;
}

/** How much a hero is worth in slot one when only one skill will count. */
function leadValue(hero) {
  return isCombat(hero.skillType) ? Number(hero.skillPct) || 0 : 0;
}

/**
 * Pick heroes for the three march slots given the role.
 * Returns { slots: [{hero, why}], note }.
 */
export function pickTeam(heroes, role) {
  const owned = heroes.filter((h) => h.name);
  if (!owned.length) return { slots: [], note: 'Add the heroes you own and this fills in.' };

  const byLevel = [...owned].sort((a, b) => (Number(b.level) || 0) - (Number(a.level) || 0));
  const bySkill = [...owned].sort((a, b) => leadValue(b) - leadValue(a) || (Number(b.level) || 0) - (Number(a.level) || 0));

  if (role === 'lead') {
    // Every skill on all three heroes counts, so take the three best overall
    // and ignore slot order entirely.
    const chosen = bySkill.slice(0, 3);
    return {
      slots: chosen.map((h) => ({ hero: h, why: 'All three of your heroes contribute every skill — order does not matter.' })),
      note: 'As rally leader every Expedition Skill on all three heroes feeds the rally. Bring your three strongest, in any order.',
    };
  }

  if (role === 'early') {
    const first = bySkill[0];
    // Slots two and three buff nothing, so they are pure march capacity.
    const rest = byLevel.filter((h) => h.id !== first?.id).slice(0, 2);
    return {
      slots: [
        { hero: first, why: 'Slot one is the only hero that counts — this is your best 1st Expedition Skill.', lead: true },
        ...rest.map((h) => ({ hero: h, why: 'Buffs nothing. Highest level, purely to carry more troops.' })),
      ].filter((s) => s.hero),
      note: 'As one of the first four joiners only your lead hero\'s 1st Expedition Skill reaches the rally. Slot one is the whole decision.',
    };
  }

  return {
    slots: byLevel.slice(0, 3).map((h) => ({ hero: h, why: 'Highest level, purely to carry more troops.' })),
    note: 'Joining fifth or later adds no hero buffs at all. Pick purely for march capacity and fill it with marksmen.',
  };
}

/** Marksmen first, then whatever else fills the march. */
export function marchSplit(capacity, available) {
  const cap = Math.max(0, Math.floor(Number(capacity) || 0));
  const marks = Math.min(cap, Math.max(0, Math.floor(Number(available.marksman) || 0)));
  let left = cap - marks;
  const lancer = Math.min(left, Math.max(0, Math.floor(Number(available.lancer) || 0)));
  left -= lancer;
  const infantry = Math.min(left, Math.max(0, Math.floor(Number(available.infantry) || 0)));
  return { marksman: marks, lancer, infantry, unfilled: left - infantry, capacity: cap };
}

export default {
  async render(root, ctx) {
    const state = getState();
    const bear = gd('bear');
    const role = state.ui.bearRole || 'early';
    const heroes = state.heroes || [];
    const march = state.ui.bearMarch || { capacity: 0, marksman: 0, lancer: 0, infantry: 0 };

    const team = pickTeam(heroes, role);
    const split = marchSplit(march.capacity, march);

    const ev = state.events.find((e) => e.id === 'ev_bear');
    const next = ev ? nextOccurrences(ev, { offsetMin: state.profile.serverOffsetMin, count: 1 })[0] : null;

    // Alliance side: the four best lead skills should take the four buff slots.
    const ranked = (state.roster || [])
      .filter((m) => m.name)
      .map((m) => ({ ...m, v: Number(m.leadSkillPct) || 0 }))
      .sort((a, b) => b.v - a.v || (Number(b.power) || 0) - (Number(a.power) || 0));
    const rated = ranked.filter((m) => m.v > 0);

    root.innerHTML = `
      <h1>Bear Trap</h1>
      <p class="page-intro">Tell it what you own and it works out which heroes go in which slot and what to fill the
        march with. The answer is different depending on whether you lead the rally or join it — that is the whole point.</p>

      ${next ? `<div class="note"><strong>Next Bear Trap</strong> ${esc(fmtLocal(next.start))} your time ·
        ${esc(fmtServer(next.start, state.profile.serverOffsetMin))} server ·
        <span class="countdown tnum" data-cd="${next.start.getTime()}">—</span>.
        The seeded times are placeholders — set the real ones on the <a href="#/calendar">Event Calendar</a>.</div>` : ''}

      <div class="card">
        <div class="card-head"><h2>What are you doing this hunt?</h2></div>
        <div class="btn-row">
          ${Object.entries(ROLES).map(([k, v]) => `
            <button class="btn ${role === k ? 'primary' : ''}" data-role="${k}">${esc(v)}</button>`).join('')}
        </div>
        <p class="faint small" style="margin-bottom:0">Only the first four players to join a rally buff it. If you are
          not one of them, your heroes make no difference and you should optimise purely for troops.</p>
      </div>

      <div class="grid cols-2">
        <div class="card">
          <div class="card-head"><h2>Your march</h2></div>
          <div class="grid cols-2">
            <div class="field"><label for="cap">March capacity</label>
              <input type="text" id="cap" data-march="capacity" value="${march.capacity ? esc(fmtInt(march.capacity)) : ''}" placeholder="e.g. 135000" inputmode="numeric"></div>
            <div class="field"><label for="mk">Marksmen you can send</label>
              <input type="text" id="mk" data-march="marksman" value="${march.marksman ? esc(fmtInt(march.marksman)) : ''}" placeholder="0" inputmode="numeric"></div>
            <div class="field"><label for="ln">Lancers</label>
              <input type="text" id="ln" data-march="lancer" value="${march.lancer ? esc(fmtInt(march.lancer)) : ''}" placeholder="0" inputmode="numeric"></div>
            <div class="field"><label for="if">Infantry</label>
              <input type="text" id="if" data-march="infantry" value="${march.infantry ? esc(fmtInt(march.infantry)) : ''}" placeholder="0" inputmode="numeric"></div>
          </div>

          ${split.capacity ? `
            <h3 style="margin-top:6px">Send</h3>
            <div class="table-wrap"><table><tbody>
              <tr><td><strong>Marksmen</strong></td><td class="right tnum"><strong>${fmtInt(split.marksman)}</strong></td>
                <td class="faint small">all the damage</td></tr>
              <tr><td>Lancers</td><td class="right tnum">${fmtInt(split.lancer)}</td>
                <td class="faint small">${split.lancer ? 'only to fill the march' : 'not needed'}</td></tr>
              <tr><td>Infantry</td><td class="right tnum">${fmtInt(split.infantry)}</td>
                <td class="faint small">${split.infantry ? 'only to fill the march' : 'not needed — the Bear deals no damage'}</td></tr>
            </tbody></table></div>
            ${split.unfilled > 0
              ? `<p class="small" style="color:var(--warm)">${fmtInt(split.unfilled)} of your march capacity is empty — you do not have enough troops to fill it.</p>`
              : '<p class="small" style="color:var(--good)">March fills completely.</p>'}
            ${split.marksman < split.capacity && (Number(march.marksman) || 0) < split.capacity
              ? '<p class="faint small">Short on marksmen. They out-damage everything else here, so they are the troop worth training before the next hunt.</p>' : ''}
          ` : '<p class="empty">Enter your march capacity to get a split.</p>'}
        </div>

        <div class="card">
          <div class="card-head"><h2>Hero slots</h2>
            <span class="spacer"></span>
            <span class="pill accent">${esc(ROLES[role])}</span></div>
          <p class="muted small" style="margin-top:0">${esc(team.note)}</p>
          ${team.slots.length ? team.slots.map((s, i) => `
            <div class="list-row">
              <span class="pill ${s.lead ? 'accent' : ''}" style="min-width:56px;text-align:center">Slot ${i + 1}</span>
              <div class="grow">
                <div class="title">${esc(s.hero.name)}
                  ${s.hero.skillPct && isCombat(s.hero.skillType) ? `<span class="pill good">${esc(String(s.hero.skillPct))}%</span>` : ''}</div>
                <div class="sub">${esc(s.why)}</div>
              </div>
            </div>`).join('') : '<p class="empty">No heroes added yet.</p>'}
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Your heroes</h2><span class="spacer"></span>
          <button class="btn small primary" id="addHero">Add hero</button></div>
        <p class="muted small" style="margin-top:0">Enter the <strong>1st Expedition Skill</strong> from each hero's page —
          that is the only one that travels when you join a rally. Percentages come off your own screen, so they stay right
          as you level heroes up.</p>
        <div id="heroList">${heroList(heroes)}</div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Alliance rally plan</h2><span class="spacer"></span>
          <a class="btn small" href="#/roster">Roster</a></div>
        ${rated.length ? `
          <p class="muted small" style="margin-top:0">Ranked by the lead-hero skill recorded on the roster. Because only
            four joiners can buff a rally, the order people press join in is worth agreeing in advance.</p>
          <div class="table-wrap"><table>
            <thead><tr><th>#</th><th>Member</th><th class="right">Lead skill</th><th>Job</th></tr></thead>
            <tbody>
              ${ranked.slice(0, 12).map((m, i) => {
                const job = i === 0 ? ['accent', 'Lead the rally']
                  : i < 5 ? ['good', `Join ${i}${['st', 'nd', 'rd', 'th'][Math.min(i - 1, 3)]} — buffs the rally`]
                    : ['', 'Join any time — send max marksmen'];
                return `<tr>
                  <td class="tnum">${i + 1}</td>
                  <td>${esc(m.name)}${m.rallyLead ? ' <span class="pill">rally lead</span>' : ''}</td>
                  <td class="right tnum">${m.v ? `${esc(String(m.v))}%` : '<span class="faint">—</span>'}</td>
                  <td><span class="pill ${job[0]}">${esc(job[1])}</span></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table></div>
          ${ranked.length > rated.length ? `<p class="faint small">${ranked.length - rated.length} member${ranked.length - rated.length === 1 ? ' has' : 's have'} no lead-hero skill recorded, so they sort last. Add it on the roster.</p>` : ''}
        ` : `<p class="empty">Add members on the <a href="#/roster">Alliance Roster</a> and record each one's lead hero
          and 1st Expedition Skill percentage. Then this ranks who should lead and who should take the four buff slots.</p>`}
      </div>

      <details class="acc">
        <summary>Why it recommends this</summary>
        <div>
          ${(bear?.mechanics || []).map((m) => `
            <div style="margin-bottom:10px">
              <strong>${esc(m.title)}</strong>
              <div class="muted small">${esc(m.detail)}</div>
            </div>`).join('')}
          <p class="faint small" style="margin-bottom:0">These rules come from community guides rather than the game's own
            documentation. If your alliance has measured something different, trust them over this.</p>
        </div>
      </details>
    `;

    /* ---- interactions ---- */

    for (const btn of $$('[data-role]', root)) {
      btn.addEventListener('click', () => {
        update((s) => { s.ui.bearRole = btn.dataset.role; });
        ctx.rerender();
      });
    }

    for (const input of $$('[data-march]', root)) {
      input.addEventListener('change', () => {
        const key = input.dataset.march;
        const value = Math.max(0, Math.round(parseNum(input.value)));
        update((s) => { s.ui.bearMarch = { ...(s.ui.bearMarch || {}), [key]: value }; });
        ctx.rerender();
      });
    }

    $('#addHero', root).addEventListener('click', () => {
      update((s) => {
        s.heroes.push({ id: uid('h'), name: '', cls: 'marksman', level: 1, skillType: 'attack', skillPct: 0 });
      });
      ctx.rerender();
      setTimeout(() => $$('#heroList [data-hf="name"]').pop()?.focus(), 0);
    });

    const list = $('#heroList', root);
    list.addEventListener('change', (ev) => {
      const field = ev.target.dataset.hf;
      if (!field) return;
      const id = ev.target.closest('[data-id]').dataset.id;
      update((s) => {
        const h = s.heroes.find((x) => x.id === id);
        if (!h) return;
        h[field] = field === 'level' || field === 'skillPct' ? parseNum(ev.target.value) : ev.target.value;
      });
      ctx.rerender();
    });

    list.addEventListener('click', (ev) => {
      if (ev.target.dataset?.act !== 'delHero') return;
      const id = ev.target.closest('[data-id]').dataset.id;
      update((s) => { s.heroes = s.heroes.filter((h) => h.id !== id); });
      toast('Hero removed');
      ctx.rerender();
    });
  },
};

function heroList(heroes) {
  if (!heroes.length) {
    const names = gd('bear')?.suggestedHeroes?.names || [];
    return `<p class="empty">No heroes yet. Players often bring ${names.slice(0, 4).map(esc).join(', ')} and similar —
      but add whichever you actually own.</p>`;
  }
  const types = skillTypes();
  return `<div class="table-wrap"><table>
    <thead><tr><th>Hero</th><th>Class</th><th class="right">Level</th><th>1st Expedition Skill</th><th class="right">%</th><th></th></tr></thead>
    <tbody>
      ${heroes.map((h) => `
        <tr data-id="${esc(h.id)}">
          <td><input type="text" data-hf="name" value="${esc(h.name)}" placeholder="Hero name" style="min-width:120px"></td>
          <td><select data-hf="cls">${Object.entries(CLASSES).map(([k, v]) => `<option value="${k}"${h.cls === k ? ' selected' : ''}>${v}</option>`).join('')}</select></td>
          <td class="right"><input type="text" data-hf="level" value="${h.level ? esc(String(h.level)) : ''}" style="width:64px;text-align:right" inputmode="numeric"></td>
          <td><select data-hf="skillType" style="min-width:170px">
            ${types.map((t) => `<option value="${esc(t.key)}"${h.skillType === t.key ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select></td>
          <td class="right"><input type="text" data-hf="skillPct" value="${h.skillPct ? esc(String(h.skillPct)) : ''}" style="width:64px;text-align:right" placeholder="0" inputmode="decimal"></td>
          <td class="right"><button class="btn small danger" data-act="delHero" aria-label="Remove">✕</button></td>
        </tr>`).join('')}
    </tbody>
  </table></div>
  <p class="faint small">Skills that only add defence or health score nothing here — the Bear never attacks back.</p>`;
}
