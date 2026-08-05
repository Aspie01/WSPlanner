// Time handling.
//
// Whiteout Survival alliances span timezones, so every schedule in this app is
// authored in *server time* and rendered in both server and local time. Server
// time is modelled as a fixed offset from UTC (most states run on UTC+0, which
// is the default).

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** Display order, Monday first — how the in-game week reads. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

const MIN = 60_000;
const DAY_MIN = 1440;

/** The current moment shifted into server wall-clock, read via the UTC getters. */
export function serverNow(offsetMin, now = new Date()) {
  return new Date(now.getTime() + offsetMin * MIN);
}

/** Real instant for a server wall-clock date/time. */
export function fromServerWall(y, month, day, hour, minute, offsetMin) {
  return new Date(Date.UTC(y, month, day, hour, minute) - offsetMin * MIN);
}

export function parseHHMM(text, fallback = 0) {
  const m = String(text ?? '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return fallback;
  return Math.min(23, Number(m[1])) * 60 + Math.min(59, Number(m[2]));
}

export function fmtHHMM(minutes) {
  const m = ((Math.round(minutes) % DAY_MIN) + DAY_MIN) % DAY_MIN;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** "2026-08-05" -> [y, monthIndex, day]; invalid input falls back to today (UTC). */
export function parseISODate(text) {
  const m = String(text ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    const d = new Date();
    return [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()];
  }
  return [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
}

export function toISODate(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Next occurrences of a recurring event, as real instants.
 *
 * Recurrence shapes:
 *   { type: 'weekly', days: [2, 5], times: ['12:00'] }
 *   { type: 'daily',  times: ['02:00', '14:00'] }
 *   { type: 'cycle',  periodDays: 14, anchorDate: '2026-01-05', times: ['00:00'] }
 *   { type: 'once',   date: '2026-09-01', times: ['20:00'] }
 */
export function nextOccurrences(event, { offsetMin = 0, count = 3, from = new Date(), horizonDays = 120 } = {}) {
  const rec = event?.recurrence || {};
  const times = (rec.times?.length ? rec.times : ['00:00']).map((t) => parseHHMM(t));
  const durationMin = Number(event?.durationMin) || 0;
  const out = [];

  // An event counts as upcoming until it has finished, so something running
  // right now still shows on the dashboard.
  const cutoff = from.getTime() - durationMin * MIN;
  const sNow = serverNow(offsetMin, from);
  const startDay = new Date(Date.UTC(sNow.getUTCFullYear(), sNow.getUTCMonth(), sNow.getUTCDate()));

  const push = (y, mo, d, minutes) => {
    const start = fromServerWall(y, mo, d, Math.floor(minutes / 60), minutes % 60, offsetMin);
    if (start.getTime() >= cutoff) {
      out.push({ start, end: new Date(start.getTime() + durationMin * MIN), event });
    }
  };

  if (rec.type === 'once') {
    const [y, mo, d] = parseISODate(rec.date);
    times.forEach((t) => push(y, mo, d, t));
  } else {
    const anchor = rec.type === 'cycle' ? Date.UTC(...parseISODate(rec.anchorDate)) : null;
    const period = Math.max(1, Number(rec.periodDays) || 1);

    for (let i = 0; i <= horizonDays && out.length < count * times.length + 8; i++) {
      const day = new Date(startDay.getTime() - 1 * DAY_MIN * MIN + i * DAY_MIN * MIN);
      if (rec.type === 'weekly') {
        const days = rec.days?.length ? rec.days : [1];
        if (!days.includes(day.getUTCDay())) continue;
      } else if (rec.type === 'cycle') {
        const elapsed = Math.round((day.getTime() - anchor) / (DAY_MIN * MIN));
        if (elapsed < 0 || elapsed % period !== 0) continue;
      } else if (rec.type !== 'daily') {
        continue;
      }
      times.forEach((t) => push(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), t));
    }
  }

  return out.sort((a, b) => a.start - b.start).slice(0, count);
}

/**
 * Merge, sort and trim the next occurrences across many events.
 * `perEvent` caps how many times one event may appear, so a daily event cannot
 * crowd everything else off the list.
 */
export function upcoming(events, opts = {}) {
  const { limit = 8, perEvent = 3 } = opts;
  return events
    .filter((e) => e && e.enabled !== false)
    .flatMap((e) => nextOccurrences(e, { ...opts, count: perEvent }))
    .sort((a, b) => a.start - b.start)
    .slice(0, limit);
}

/**
 * Does this event fall on the given server calendar date, and at what times?
 * Unlike nextOccurrences() this ignores whether the day has already passed, so
 * a week grid can show Monday even when it is Wednesday.
 */
export function occurrencesOnServerDate(event, serverDate, offsetMin) {
  const rec = event?.recurrence || {};
  const times = rec.times?.length ? rec.times : ['00:00'];
  let matches = false;

  if (rec.type === 'weekly') {
    matches = (rec.days?.length ? rec.days : [1]).includes(serverDate.getUTCDay());
  } else if (rec.type === 'daily') {
    matches = true;
  } else if (rec.type === 'cycle') {
    const elapsed = Math.round((serverDate.getTime() - Date.UTC(...parseISODate(rec.anchorDate))) / (DAY_MIN * MIN));
    matches = elapsed >= 0 && elapsed % Math.max(1, Number(rec.periodDays) || 1) === 0;
  } else if (rec.type === 'once') {
    matches = toISODate(serverDate) === rec.date;
  }
  if (!matches) return [];

  return times.map((t) => {
    const minutes = parseHHMM(t);
    const start = fromServerWall(
      serverDate.getUTCFullYear(), serverDate.getUTCMonth(), serverDate.getUTCDate(),
      Math.floor(minutes / 60), minutes % 60, offsetMin,
    );
    return { start, end: new Date(start.getTime() + (Number(event.durationMin) || 0) * MIN), event };
  });
}

/** Server-time Monday 00:00 of the week containing `from`. */
export function weekStart(offsetMin, from = new Date()) {
  const s = serverNow(offsetMin, from);
  const shift = (s.getUTCDay() + 6) % 7; // Monday = 0
  return fromServerWall(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate() - shift, 0, 0, offsetMin);
}

/** 1..6 for VS Duel Mon–Sat, or 0 on Sunday (no duel day). */
export function vsDuelDayNumber(offsetMin, from = new Date()) {
  const s = serverNow(offsetMin, from);
  const dow = s.getUTCDay();
  return dow === 0 ? 0 : dow;
}

export function fmtCountdown(ms) {
  if (ms <= 0) return 'now';
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${String(s).padStart(2, '0')}s`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

export function fmtLocal(date, { withDate = true } = {}) {
  const opts = withDate
    ? { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { hour: 'numeric', minute: '2-digit' };
  return date.toLocaleString(undefined, opts);
}

export function fmtServer(date, offsetMin, { withDate = true } = {}) {
  const s = serverNow(offsetMin, date);
  const time = `${String(s.getUTCHours()).padStart(2, '0')}:${String(s.getUTCMinutes()).padStart(2, '0')}`;
  if (!withDate) return time;
  return `${DAY_SHORT[s.getUTCDay()]} ${s.getUTCDate()} ${s.toLocaleString('en', { month: 'short', timeZone: 'UTC' })}, ${time}`;
}

export function offsetLabel(offsetMin) {
  if (!offsetMin) return 'UTC';
  const sign = offsetMin > 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
}

/** The viewer's own offset from UTC, in minutes (east of UTC is positive). */
export function localOffsetMin(date = new Date()) {
  return -date.getTimezoneOffset();
}
