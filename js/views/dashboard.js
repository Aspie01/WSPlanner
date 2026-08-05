import { esc, fmtDur, fmtNum } from '../util.js';
import { getState, SPEEDUP_KEYS } from '../store.js';
import { gd } from '../gamedata.js';
import { upcoming, fmtLocal, fmtServer, vsDuelDayNumber, offsetLabel, localOffsetMin } from '../time.js';
import { queueTotals } from './growth.js';

function greeting(name) {
  const h = new Date().getHours();
  const part = h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  return name ? `${part}, ${esc(name)}` : part;
}

export default {
  async render(root) {
    const state = getState();
    const { serverOffsetMin } = state.profile;
    const duelData = gd('vsDuel');
    const dayNum = vsDuelDayNumber(serverOffsetMin);
    const today = duelData?.days?.find((d) => d.n === dayNum);
    // One row per event here — the dashboard is a glance, not the full calendar.
    const next = upcoming(state.events, { offsetMin: serverOffsetMin, limit: 6, perEvent: 1 });
    const totals = queueTotals(state.queue);
    const localOff = localOffsetMin();

    const speedupTotal = SPEEDUP_KEYS.reduce((sum, k) => sum + (Number(state.inventory.speedups[k]) || 0), 0);

    root.innerHTML = `
      <h1>${greeting(state.profile.playerName)}</h1>
      <p class="page-intro">
        ${state.profile.alliance ? `<strong>${esc(state.profile.alliance)}</strong>` : 'No alliance set'}
        ${state.profile.state ? ` · State ${esc(state.profile.state)}` : ''}
        · Server time is ${offsetLabel(serverOffsetMin)}${serverOffsetMin === localOff ? ' (same as yours)' : `, you are on ${offsetLabel(localOff)}`}.
      </p>

      <div class="grid cols-4" style="margin-bottom:14px">
        <div class="stat">
          <div class="label">Speedups banked</div>
          <div class="value">${fmtDur(speedupTotal, { compact: true }) || '0m'}</div>
          <div class="sub">across all categories</div>
        </div>
        <div class="stat">
          <div class="label">Growth plan</div>
          <div class="value">${totals.pending}</div>
          <div class="sub">${totals.pending === 1 ? 'step' : 'steps'} outstanding</div>
        </div>
        <div class="stat">
          <div class="label">Plan build time</div>
          <div class="value">${fmtDur(totals.timeMin, { compact: true }) || '—'}</div>
          <div class="sub">before speedups</div>
        </div>
        <div class="stat">
          <div class="label">Roster</div>
          <div class="value">${state.roster.length}</div>
          <div class="sub">members tracked</div>
        </div>
      </div>

      <div class="grid cols-2">
        <div>
          <div class="card">
            <div class="card-head">
              <h2>Today &middot; VS Duel</h2>
              <span class="spacer"></span>
              <a class="btn small" href="#/vs-duel">Open</a>
            </div>
            ${today ? `
              <div class="day-card today">
                <h3><span class="dnum">Day ${today.n}</span> ${esc(today.name)}</h3>
                <p class="small muted" style="margin:6px 0 0">${esc(today.summary)}</p>
                <ul>${today.bank.slice(0, 3).map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
              </div>
            ` : `<p class="muted small">It is Sunday on server time — no duel day today. Use it to bank stamina, speedups and gear for tomorrow's ${esc(duelData?.days?.[0]?.name || 'Day 1')}.</p>`}
          </div>

          <div class="card">
            <div class="card-head"><h2>Resources on hand</h2><span class="spacer"></span>
              <a class="btn small" href="#/inventory">Update</a></div>
            ${state.inventory.updatedAt
              ? `<div class="grid cols-3">${
                  Object.entries(state.inventory.resources)
                    .filter(([, v]) => Number(v) > 0)
                    .slice(0, 6)
                    .map(([k, v]) => `<div class="stat"><div class="label">${esc(k)}</div><div class="value">${fmtNum(v)}</div></div>`)
                    .join('') || '<p class="muted small">Nothing recorded yet.</p>'
                }</div>
                <p class="faint small" style="margin:10px 0 0">Last updated ${esc(new Date(state.inventory.updatedAt).toLocaleString())}</p>`
              : '<p class="muted small">Nothing recorded yet. Adding what you have banked lets the Growth Plan tell you what you can actually afford.</p>'}
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h2>Coming up</h2><span class="spacer"></span>
            <a class="btn small" href="#/calendar">Calendar</a></div>
          ${next.length ? next.map((occ) => `
            <div class="list-row">
              <div class="grow">
                <div class="title">${esc(occ.event.name)}
                  ${occ.event.kind === 'alliance' ? '<span class="pill">alliance</span>' : ''}</div>
                <div class="sub">${esc(fmtLocal(occ.start))} · ${esc(fmtServer(occ.start, serverOffsetMin))} server</div>
              </div>
              <span class="countdown tnum" data-cd="${occ.start.getTime()}">—</span>
            </div>
          `).join('') : '<p class="empty">No events scheduled. Add them on the Event Calendar page.</p>'}
        </div>
      </div>
    `;
  },
};
