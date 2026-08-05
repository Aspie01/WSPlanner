import { $, $$, esc, uid, fmtDur, parseDur, toast } from '../util.js';
import { getState, update } from '../store.js';
import {
  upcoming, nextOccurrences, occurrencesOnServerDate, fmtLocal, fmtServer, offsetLabel,
  localOffsetMin, DAY_SHORT, WEEK_ORDER, toISODate, serverNow,
} from '../time.js';

const KINDS = { alliance: 'Alliance', state: 'State / server', personal: 'Personal', daily: 'Daily' };

function blankEvent() {
  return {
    id: uid('ev'),
    name: '',
    kind: 'alliance',
    enabled: true,
    durationMin: 60,
    notes: '',
    recurrence: { type: 'weekly', days: [1], times: ['12:00'] },
  };
}

function describeRecurrence(ev) {
  const r = ev.recurrence || {};
  const times = (r.times || []).join(', ') || '00:00';
  if (r.type === 'daily') return `Every day at ${times}`;
  if (r.type === 'cycle') return `Every ${r.periodDays} days from ${r.anchorDate}, at ${times}`;
  if (r.type === 'once') return `Once on ${r.date} at ${times}`;
  const days = (r.days || []).slice().sort((a, b) => WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b));
  return `${days.map((d) => DAY_SHORT[d]).join(', ') || '—'} at ${times}`;
}

export default {
  async render(root, ctx) {
    const state = getState();
    const { serverOffsetMin } = state.profile;
    const localOff = localOffsetMin();
    const next = upcoming(state.events, { offsetMin: serverOffsetMin, limit: 12, perEvent: 2 });

    root.innerHTML = `
      <h1>Event Calendar</h1>
      <p class="page-intro">Every time here is written in <strong>server time</strong> (${offsetLabel(serverOffsetMin)}) and shown
        alongside your own local time (${offsetLabel(localOff)}), so an alliance spread across timezones reads the same schedule.</p>

      <div class="grid cols-2">
        <div class="card">
          <div class="card-head"><h2>Next 12</h2></div>
          ${next.length ? next.map((occ) => `
            <div class="list-row">
              <div class="grow">
                <div class="title">${esc(occ.event.name)} <span class="pill">${esc(KINDS[occ.event.kind] || occ.event.kind)}</span></div>
                <div class="sub">${esc(fmtLocal(occ.start))} your time · ${esc(fmtServer(occ.start, serverOffsetMin))} server</div>
              </div>
              <span class="countdown tnum" data-cd="${occ.start.getTime()}">—</span>
            </div>`).join('')
          : '<p class="empty">No events yet.</p>'}
        </div>

        <div class="card">
          <div class="card-head"><h2>This week, server time</h2></div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Day</th><th>Events</th></tr></thead>
              <tbody>${weekGrid(state.events, serverOffsetMin)}</tbody>
            </table>
          </div>
          <p class="faint small" style="margin-bottom:0">Times shown are server time. Tap an event below to change it.</p>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Events</h2><span class="spacer"></span>
          <button class="btn small primary" id="addEvent">New event</button></div>
        <div id="eventList">${state.events.map((ev) => eventRow(ev, serverOffsetMin)).join('') || '<p class="empty">No events.</p>'}</div>
      </div>
    `;

    $('#addEvent', root).addEventListener('click', () => {
      const ev = blankEvent();
      ev.name = 'New event';
      update((s) => { s.events.push(ev); });
      ctx.rerender();
      setTimeout(() => {
        const el = document.querySelector(`details[data-id="${ev.id}"]`);
        if (el) { el.open = true; el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      }, 0);
    });

    bindEditors(root, ctx);
  },
};

function weekGrid(events, offsetMin) {
  const sNow = serverNow(offsetMin);
  const monday = new Date(Date.UTC(sNow.getUTCFullYear(), sNow.getUTCMonth(), sNow.getUTCDate() - ((sNow.getUTCDay() + 6) % 7)));
  const rows = [];

  for (let i = 0; i < 7; i++) {
    const dayServer = new Date(monday.getTime() + i * 86400_000);
    const iso = toISODate(dayServer);
    const items = events
      .filter((e) => e.enabled !== false)
      .flatMap((e) => occurrencesOnServerDate(e, dayServer, offsetMin))
      .sort((a, b) => a.start - b.start);

    const todayIso = toISODate(sNow);
    const isToday = todayIso === iso;
    const isPast = iso < todayIso;
    rows.push(`
      <tr${isToday ? ' style="background:var(--bg-elev-2)"' : ''}${isPast ? ' style="opacity:.5"' : ''}>
        <td><strong>${DAY_SHORT[dayServer.getUTCDay()]}</strong>${isToday ? ' <span class="pill accent">now</span>' : ''}</td>
        <td class="wrap">${items.length
          ? items.map((o) => `<span class="pill ${o.event.kind === 'alliance' ? 'accent' : ''}">${esc(fmtServer(o.start, offsetMin, { withDate: false }))} ${esc(o.event.name)}</span>`).join(' ')
          : '<span class="faint small">—</span>'}</td>
      </tr>`);
  }
  return rows.join('');
}

function eventRow(ev, offsetMin) {
  const r = ev.recurrence || {};
  const nextOne = nextOccurrences(ev, { offsetMin, count: 1 })[0];
  return `
    <details class="acc" data-id="${esc(ev.id)}">
      <summary>
        ${esc(ev.name || 'Untitled')}
        <span class="pill">${esc(KINDS[ev.kind] || ev.kind)}</span>
        ${ev.enabled === false ? '<span class="pill bad">off</span>' : ''}
        <span class="faint small"> — ${esc(describeRecurrence(ev))}</span>
      </summary>
      <div>
        ${nextOne ? `<p class="small muted" style="margin-top:0">Next: ${esc(fmtLocal(nextOne.start))} your time · ${esc(fmtServer(nextOne.start, offsetMin))} server</p>` : ''}
        <div class="grid cols-2">
          <div class="field"><label>Name</label><input type="text" data-f="name" value="${esc(ev.name)}"></div>
          <div class="field"><label>Type</label><select data-f="kind">
            ${Object.entries(KINDS).map(([k, v]) => `<option value="${k}"${ev.kind === k ? ' selected' : ''}>${v}</option>`).join('')}
          </select></div>
        </div>

        <div class="grid cols-2">
          <div class="field"><label>Repeats</label><select data-f="recType">
            ${['weekly', 'daily', 'cycle', 'once'].map((t) => `<option value="${t}"${r.type === t ? ' selected' : ''}>${t}</option>`).join('')}
          </select></div>
          <div class="field"><label>Lasts</label><input type="text" data-f="durationMin" value="${esc(fmtDur(ev.durationMin))}" placeholder="1h 30m"></div>
        </div>

        <div class="field" data-when="weekly"${r.type === 'weekly' ? '' : ' hidden'}>
          <label>Days (server time)</label>
          <div class="btn-row">
            ${WEEK_ORDER.map((d) => `
              <label class="check" style="padding:0">
                <input type="checkbox" data-day="${d}" ${(r.days || []).includes(d) ? 'checked' : ''}>
                <span class="small">${DAY_SHORT[d]}</span>
              </label>`).join('')}
          </div>
        </div>

        <div class="grid cols-2" data-when="cycle"${r.type === 'cycle' ? '' : ' hidden'}>
          <div class="field"><label>Every N days</label><input type="number" data-f="periodDays" min="1" value="${esc(r.periodDays || 14)}"></div>
          <div class="field"><label>Starting from (a day it did happen)</label><input type="date" data-f="anchorDate" value="${esc(r.anchorDate || '')}"></div>
        </div>

        <div class="field" data-when="once"${r.type === 'once' ? '' : ' hidden'}>
          <label>Date</label><input type="date" data-f="date" value="${esc(r.date || '')}">
        </div>

        <div class="field">
          <label>Times, server time (comma separated)</label>
          <input type="text" data-f="times" value="${esc((r.times || []).join(', '))}" placeholder="12:00, 20:00">
        </div>

        <div class="field"><label>Notes</label><textarea data-f="notes" style="font-family:inherit;font-size:15px;min-height:60px">${esc(ev.notes || '')}</textarea></div>

        <div class="btn-row">
          <label class="check"><input type="checkbox" data-f="enabled" ${ev.enabled !== false ? 'checked' : ''}><span>Show this event</span></label>
          <span style="flex:1"></span>
          <button class="btn small danger" data-act="delete">Delete event</button>
        </div>
      </div>
    </details>`;
}

function bindEditors(root, ctx) {
  const list = $('#eventList', root);
  if (!list) return;

  const readInto = (ev, box) => {
    const val = (f) => $(`[data-f="${f}"]`, box)?.value ?? '';
    ev.name = val('name').trim() || 'Untitled';
    ev.kind = val('kind');
    ev.durationMin = parseDur(val('durationMin'));
    ev.notes = val('notes');
    ev.enabled = $('[data-f="enabled"]', box)?.checked !== false;

    const type = val('recType');
    const times = val('times').split(',').map((t) => t.trim()).filter(Boolean);
    const rec = { type, times: times.length ? times : ['00:00'] };
    if (type === 'weekly') {
      rec.days = $$('[data-day]', box).filter((c) => c.checked).map((c) => Number(c.dataset.day));
      if (!rec.days.length) rec.days = [1];
    }
    if (type === 'cycle') {
      rec.periodDays = Math.max(1, Number(val('periodDays')) || 14);
      rec.anchorDate = val('anchorDate') || toISODate(new Date());
    }
    if (type === 'once') rec.date = val('date') || toISODate(new Date());
    ev.recurrence = rec;
  };

  list.addEventListener('change', (target) => {
    const box = target.target.closest('details[data-id]');
    if (!box) return;
    const id = box.dataset.id;

    if (target.target.dataset.f === 'recType') {
      const type = target.target.value;
      $$('[data-when]', box).forEach((el) => { el.hidden = el.dataset.when !== type; });
    }

    update((s) => {
      const ev = s.events.find((e) => e.id === id);
      if (ev) readInto(ev, box);
    });

    // Refreshing the summary line keeps it honest without redrawing the page.
    const ev = getState().events.find((e) => e.id === id);
    const summary = box.querySelector('summary .faint');
    if (ev && summary) summary.textContent = ` — ${describeRecurrence(ev)}`;
  });

  list.addEventListener('click', (target) => {
    if (target.target.dataset?.act !== 'delete') return;
    const box = target.target.closest('details[data-id]');
    const ev = getState().events.find((e) => e.id === box.dataset.id);
    if (!confirm(`Delete "${ev?.name || 'this event'}"?`)) return;
    update((s) => { s.events = s.events.filter((e) => e.id !== box.dataset.id); });
    toast('Event deleted');
    ctx.rerender();
  });
}
