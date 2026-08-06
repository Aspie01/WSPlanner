import { $, $$, esc, fmtInt, fmtNum, parseNum, parseDur, debounce } from '../util.js';
import { getState, update } from '../store.js';
import { gd, setOverride } from '../gamedata.js';
import { vsDuelDayNumber, weekStart, toISODate, serverNow, nextOccurrences, DAY_SHORT } from '../time.js';

/**
 * Where the state is in its scoring week. The themed days below only pay out
 * during State of Power, which comes round one week in four, so the page says
 * plainly whether spending today actually scores.
 */
export function scoringWeek(events, offsetMin) {
  const sop = events.find((e) => e.id === 'ev_sop');
  if (!sop) return null;
  const occ = nextOccurrences(sop, { offsetMin, count: 1 })[0];
  if (!occ) return null;
  const now = Date.now();
  const active = occ.start.getTime() <= now && now < occ.end.getTime();
  return {
    active,
    start: occ.start,
    dayOfWeek: active ? Math.floor((now - occ.start.getTime()) / 86_400_000) + 1 : 0,
  };
}

/** Points a day's calculator inputs add up to, given the current rates. */
function dayPoints(day, calc) {
  let total = 0;
  let unrated = 0;
  for (const line of day.scoring || []) {
    const qty = Number(calc[`${day.n}:${line.id}`]) || 0;
    if (!qty) continue;
    if (!line.points) { unrated++; continue; }
    total += qty * Number(line.points);
  }
  return { total, unrated };
}

export default {
  async render(root, ctx) {
    const state = getState();
    const { serverOffsetMin } = state.profile;
    const data = gd('vsDuel');
    const days = data?.days || [];
    if (!days.length) {
      root.innerHTML = '<div class="card"><h1>Scoring Week</h1><p class="muted">The scoring-day data file could not be loaded.</p></div>';
      return;
    }

    const sop = scoringWeek(state.events, serverOffsetMin);
    const todayNum = vsDuelDayNumber(serverOffsetMin);
    const weekIso = toISODate(serverNow(serverOffsetMin, weekStart(serverOffsetMin)));
    const selected = Number(ctx.query.get('day')) || todayNum || 1;
    const day = days.find((d) => d.n === selected) || days[0];
    const dayState = state.vsDuel.days[day.n] || {};
    const calc = state.vsDuel.calc || {};
    const { total, unrated } = dayPoints(day, calc);
    const target = Number(dayState.target) || 0;
    const anyUnverified = (day.scoring || []).some((l) => l.verified === false);

    root.innerHTML = `
      <h1>Scoring Week</h1>
      <p class="page-intro">Each day of the scoring week rewards a different activity, so the whole game is banking the
        right things and spending them on the right day. In state ${esc(state.profile.state || '—')} that week is
        <strong>State of Power</strong>, which comes round one week in four.</p>

      ${sop ? (sop.active
        ? `<div class="note" style="border-color:var(--good);background:color-mix(in srgb, var(--good) 9%, transparent)">
             <strong>State of Power is running now — day ${sop.dayOfWeek} of 7.</strong>
             What you spend today scores.
           </div>`
        : `<div class="note">
             <strong>State of Power is not running.</strong> Speedups and gear you burn this week earn no event points —
             bank them. Next one starts <span class="countdown tnum" data-cd="${sop.start.getTime()}">—</span>
             (${esc(sop.start.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }))}).
           </div>`) : ''}

      <div class="btn-row" style="margin-bottom:14px">
        ${days.map((d) => `
          <a class="btn small ${d.n === day.n ? 'primary' : ''}" href="#/vs-duel?day=${d.n}">
            <span class="tnum">${DAY_SHORT[d.n]}</span> · ${esc(d.name)}${d.n === todayNum ? ' •' : ''}
          </a>`).join('')}
      </div>

      ${todayNum === 0 ? `<div class="note">It is <strong>Sunday</strong> on server time — the day after the preparation
        phase closes. ${sop?.active ? 'This is the battle phase, fought in the losing state\'s territory.' : 'Nothing scores today.'}</div>` : ''}

      <div class="grid cols-2">
        <div>
          <div class="card">
            <div class="card-head">
              <h2>Day ${day.n} · ${esc(day.name)}</h2>
              <span class="spacer"></span>
              ${day.n === todayNum ? (sop && !sop.active ? '<span class="pill">today&rsquo;s theme</span>' : '<span class="pill accent">today</span>') : ''}
            </div>
            <p class="muted" style="margin-top:0">${esc(day.summary)}</p>

            <h3 style="margin-top:16px">Bank this in advance</h3>
            <div id="checklist">
              ${(day.bank || []).map((item, i) => {
                const key = `${weekIso}:${day.n}:${i}`;
                return `<label class="check">
                  <input type="checkbox" data-tick="${esc(key)}" ${state.vsDuel.ticks[key] ? 'checked' : ''}>
                  <span>${esc(item)}</span>
                </label>`;
              }).join('') || '<p class="muted small">Nothing listed.</p>'}
            </div>
            <p class="faint small">Ticks reset each week (this week starts ${esc(weekIso)}).</p>

            ${day.tips?.length ? `
              <h3 style="margin-top:16px">Worth knowing</h3>
              <ul class="muted small" style="padding-left:18px;margin:0">
                ${day.tips.map((t) => `<li style="margin-bottom:4px">${esc(t)}</li>`).join('')}
              </ul>` : ''}
          </div>

          <div class="card">
            <div class="card-head"><h2>Your plan for this day</h2></div>
            <div class="field">
              <label for="target">Personal point target</label>
              <input type="text" id="target" value="${target ? esc(fmtInt(target)) : ''}" placeholder="e.g. 2M">
            </div>
            <div class="field">
              <label for="dayNotes">Notes</label>
              <textarea id="dayNotes" placeholder="What you are saving, what your alliance asked for, who you are coordinating with…">${esc(dayState.notes || '')}</textarea>
            </div>
          </div>
        </div>

        <div>
          <div class="card">
            <div class="card-head"><h2>${day.resultsOnly ? 'No scoring today' : 'Points estimate'}</h2><span class="spacer"></span>
              ${day.resultsOnly ? '' : '<button class="btn small" id="clearCalc">Clear</button>'}</div>

            ${day.resultsOnly ? `<p class="muted small" style="margin-top:0">${esc(data.phaseNote || '')}</p>` : ''}

            ${anyUnverified ? `<div class="note"><strong>These rates are unverified.</strong>
              They are community figures that change with patches. Check one action in-game, then correct the rate below —
              it saves to your device and travels with your export.</div>` : ''}

            ${day.resultsOnly ? '' : `
            <div class="table-wrap">
              <table>
                <thead><tr><th>Action</th><th class="right">Points each</th><th class="right" style="width:110px">How many</th></tr></thead>
                <tbody>
                  ${(day.scoring || []).map((line) => `
                    <tr>
                      <td class="wrap">${esc(line.label)}
                        <div class="faint small">per ${esc(line.unit)}${line.verified === false ? ' · <span class="pill warm">unverified</span>' : ''}</div></td>
                      <td class="right"><input type="text" data-rate="${esc(line.id)}" value="${line.points ? esc(String(line.points)) : ''}" placeholder="set" style="width:80px;text-align:right"></td>
                      <td class="right"><input type="text" data-qty="${esc(line.id)}" value="${calc[`${day.n}:${line.id}`] ? esc(fmtNum(calc[`${day.n}:${line.id}`])) : ''}" placeholder="0" style="text-align:right"></td>
                    </tr>`).join('')}
                </tbody>
              </table>
            </div>

            <div class="grid cols-2" style="margin-top:14px">
              <div class="stat">
                <div class="label">Estimated points</div>
                <div class="value" id="calcTotal">${fmtInt(total)}</div>
                ${unrated ? `<div class="sub">${unrated} action${unrated === 1 ? '' : 's'} have no rate set</div>` : ''}
              </div>
              <div class="stat">
                <div class="label">Against your target</div>
                <div class="value" id="calcPct">${target ? `${Math.round((total / target) * 100)}%` : '—'}</div>
                <div class="sub">${target ? `target ${fmtInt(target)}` : 'set a target on the left'}</div>
              </div>
            </div>
            <p class="faint small" style="margin-bottom:0">Speedup rows take a duration —
              type <code>3d 4h</code> or <code>1440</code> and it converts to minutes.</p>`}
          </div>

          <div class="card">
            <div class="card-head"><h2>Whole week at a glance</h2></div>
            <div class="table-wrap">
              <table>
                <thead><tr><th>Day</th><th>Focus</th><th class="right">Target</th><th class="right">Estimate</th></tr></thead>
                <tbody>
                  ${days.map((d) => {
                    const t = Number(state.vsDuel.days[d.n]?.target) || 0;
                    const e = dayPoints(d, calc).total;
                    return `<tr>
                      <td><a href="#/vs-duel?day=${d.n}">${DAY_SHORT[d.n]} · ${esc(d.name)}</a></td>
                      <td class="wrap faint small">${esc((d.bank || [])[0] || '')}</td>
                      <td class="right tnum">${d.resultsOnly ? '<span class="faint">n/a</span>' : (t ? fmtNum(t) : '—')}</td>
                      <td class="right tnum ${t && e >= t ? 'countdown live' : ''}">${d.resultsOnly ? '<span class="faint">no scoring</span>' : (e ? fmtNum(e) : '—')}</td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;

    /* ---- interactions ---- */

    $('#checklist', root).addEventListener('change', (ev) => {
      const key = ev.target.dataset?.tick;
      if (!key) return;
      const on = ev.target.checked;
      update((s) => {
        if (on) s.vsDuel.ticks[key] = true;
        else delete s.vsDuel.ticks[key];
      });
    });

    const saveTarget = debounce(() => {
      const value = parseNum($('#target', root).value);
      update((s) => {
        s.vsDuel.days[day.n] = { ...(s.vsDuel.days[day.n] || {}), target: value };
      });
      recompute();
    }, 300);
    $('#target', root).addEventListener('input', saveTarget);

    $('#dayNotes', root).addEventListener('input', debounce((ev) => {
      const notes = ev.target.value;
      update((s) => {
        s.vsDuel.days[day.n] = { ...(s.vsDuel.days[day.n] || {}), notes };
      });
    }, 400));

    // Quantity fields accept durations for speedup rows and plain counts elsewhere.
    const isDurationLine = (id) => (day.scoring || []).find((l) => l.id === id)?.unit === 'minute';

    for (const input of $$('[data-qty]', root)) {
      input.addEventListener('input', debounce(() => {
        const id = input.dataset.qty;
        const value = isDurationLine(id) ? parseDur(input.value) : parseNum(input.value);
        update((s) => { s.vsDuel.calc = { ...(s.vsDuel.calc || {}), [`${day.n}:${id}`]: value }; });
        recompute();
      }, 250));
    }

    for (const input of $$('[data-rate]', root)) {
      input.addEventListener('change', () => {
        const id = input.dataset.rate;
        const points = parseNum(input.value);
        const next = structuredClone(gd('vsDuel'));
        const target = next.days.find((d) => d.n === day.n)?.scoring?.find((l) => l.id === id);
        if (!target) return;
        target.points = points;
        target.verified = true; // the user just told us what it really is
        setOverride('vsDuel', next);
        ctx.rerender();
      });
    }

    $('#clearCalc', root)?.addEventListener('click', () => {
      update((s) => {
        for (const key of Object.keys(s.vsDuel.calc || {})) {
          if (key.startsWith(`${day.n}:`)) delete s.vsDuel.calc[key];
        }
      });
      ctx.rerender();
    });

    function recompute() {
      const totalEl = $('#calcTotal', root);
      if (!totalEl) return; // results day has no calculator
      const s = getState();
      const { total: sum } = dayPoints(day, s.vsDuel.calc || {});
      const tgt = Number(s.vsDuel.days[day.n]?.target) || 0;
      totalEl.textContent = fmtInt(sum);
      $('#calcPct', root).textContent = tgt ? `${Math.round((sum / tgt) * 100)}%` : '—';
    }
  },
};
