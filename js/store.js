// Persistent state. Everything lives in this one object; it is saved to
// localStorage and is also exactly what export / import / share links carry.

import { uid } from './util.js';

const KEY = 'wsplanner.state';
export const SCHEMA_VERSION = 1;

export const RESOURCE_KEYS = ['meat', 'wood', 'coal', 'iron', 'fireCrystal', 'refinedCrystal'];

export const RESOURCE_LABELS = {
  meat: 'Meat',
  wood: 'Wood',
  coal: 'Coal',
  iron: 'Iron',
  fireCrystal: 'Fire Crystals',
  refinedCrystal: 'Refined Fire Crystals',
};

export const SPEEDUP_KEYS = ['general', 'construction', 'research', 'training', 'healing'];

export const SPEEDUP_LABELS = {
  general: 'General',
  construction: 'Construction',
  research: 'Research',
  training: 'Training',
  healing: 'Healing',
};

/** Speedup category a queue entry can draw on, besides General. */
export const CATEGORY_SPEEDUP = {
  building: 'construction',
  research: 'research',
  troops: 'training',
  custom: 'general',
};

function defaultState() {
  return {
    v: SCHEMA_VERSION,
    profile: {
      playerName: '',
      // The state this planner was built for. Change it in Settings.
      state: '3574',
      alliance: '',
      // Server time as an offset from UTC. The game runs on UTC across all
      // states — event cooldowns and daily resets are documented as rolling
      // over on UTC — so 0 is correct unless you deliberately want the
      // schedule authored in some other zone.
      serverOffsetMin: 0,
      furnaceLevel: '30',
      theme: 'dark',
    },
    inventory: {
      resources: Object.fromEntries(RESOURCE_KEYS.map((k) => [k, 0])),
      speedups: Object.fromEntries(SPEEDUP_KEYS.map((k) => [k, 0])),
      updatedAt: null,
    },
    queue: [],
    // Heroes the player owns, used by the Bear Trap planner.
    heroes: [],
    vsDuel: {
      // Per duel day (1-6): free-text plan plus a personal point target.
      days: {},
      // Checklist ticks, keyed `${isoWeekStart}:${dayNumber}:${taskIndex}`.
      ticks: {},
      // Points-calculator quantities, keyed `${dayNumber}:${scoringId}`.
      calc: {},
    },
    events: [],
    roster: [],
    squads: [],
    gameDataOverrides: {},
    ui: { rosterSort: 'power', rosterDir: 'desc' },
  };
}

let state = defaultState();
const listeners = new Set();

export function getState() {
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  listeners.forEach((fn) => {
    try { fn(state); } catch (err) { console.error('store listener failed', err); }
  });
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    console.error('could not save state', err);
  }
  emit();
}

/** Mutate through this so persistence and re-render always happen together. */
export function update(mutator) {
  mutator(state);
  save();
}

export function load(seedEvents = []) {
  let stored = null;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) stored = JSON.parse(raw);
  } catch (err) {
    console.error('stored data was unreadable, starting fresh', err);
  }
  state = migrate(stored);
  if (!state.events.length && seedEvents.length) {
    state.events = seedEvents.map((e) => ({ ...e, id: e.id || uid('ev'), enabled: e.enabled !== false }));
    save();
  }
  return state;
}

/** Fill in anything a stored payload predates, so old saves keep working. */
export function migrate(stored) {
  const base = defaultState();
  if (!stored || typeof stored !== 'object') return base;

  const merged = {
    ...base,
    ...stored,
    v: SCHEMA_VERSION,
    profile: { ...base.profile, ...(stored.profile || {}) },
    inventory: {
      ...base.inventory,
      ...(stored.inventory || {}),
      resources: { ...base.inventory.resources, ...(stored.inventory?.resources || {}) },
      speedups: { ...base.inventory.speedups, ...(stored.inventory?.speedups || {}) },
    },
    vsDuel: { ...base.vsDuel, ...(stored.vsDuel || {}) },
    ui: { ...base.ui, ...(stored.ui || {}) },
  };

  for (const key of ['queue', 'events', 'roster', 'squads', 'heroes']) {
    merged[key] = Array.isArray(stored[key]) ? stored[key] : base[key];
  }
  merged.gameDataOverrides = stored.gameDataOverrides && typeof stored.gameDataOverrides === 'object'
    ? stored.gameDataOverrides
    : {};

  return merged;
}

/** Replace all state, e.g. after an import or opening a share link. */
export function replaceState(next) {
  state = migrate(next);
  save();
}

export function resetState() {
  state = defaultState();
  save();
}

/**
 * Slice the state for sharing. Alliance-facing data (schedule + roster) is
 * usually all anyone wants to hand around; personal covers the rest.
 */
export function exportPayload(scope = 'all') {
  const meta = { app: 'wsplanner', v: SCHEMA_VERSION, scope, exportedAt: new Date().toISOString() };
  if (scope === 'alliance') {
    return {
      ...meta,
      profile: { alliance: state.profile.alliance, state: state.profile.state, serverOffsetMin: state.profile.serverOffsetMin },
      events: state.events,
      roster: state.roster,
      squads: state.squads,
    };
  }
  if (scope === 'heroes') {
    return {
      ...meta,
      profile: { alliance: state.profile.alliance },
      heroes: state.heroes,
    };
  }
  if (scope === 'schedule') {
    return {
      ...meta,
      profile: { alliance: state.profile.alliance, serverOffsetMin: state.profile.serverOffsetMin },
      events: state.events,
    };
  }
  return { ...meta, ...state };
}

/**
 * Merge an incoming payload rather than clobbering the local one, so importing
 * an alliance schedule never wipes somebody's personal plan.
 */
export function importPayload(payload, mode = 'merge') {
  if (!payload || typeof payload !== 'object') throw new Error('That file is not WS Planner data.');
  if (payload.app && payload.app !== 'wsplanner') throw new Error('That file came from a different app.');

  if (mode === 'replace') {
    replaceState(payload);
    return { replaced: true };
  }

  const counts = { events: 0, roster: 0, squads: 0, queue: 0, heroes: 0 };
  update((s) => {
    if (payload.profile) {
      for (const k of ['alliance', 'state', 'serverOffsetMin']) {
        if (payload.profile[k] !== undefined && payload.profile[k] !== '') s.profile[k] = payload.profile[k];
      }
    }
    for (const key of ['events', 'roster', 'squads', 'queue', 'heroes']) {
      if (!Array.isArray(payload[key])) continue;
      const byId = new Map(s[key].map((item) => [item.id, item]));
      for (const incoming of payload[key]) {
        const item = { ...incoming, id: incoming.id || uid(key.slice(0, 2)) };
        if (!byId.has(item.id)) counts[key]++;
        byId.set(item.id, { ...byId.get(item.id), ...item });
      }
      s[key] = Array.from(byId.values());
    }
    if (payload.gameDataOverrides) {
      s.gameDataOverrides = { ...s.gameDataOverrides, ...payload.gameDataOverrides };
    }
    if (payload.inventory && payload.scope === 'all') {
      s.inventory = { ...s.inventory, ...payload.inventory };
    }
    if (payload.vsDuel && payload.scope === 'all') {
      s.vsDuel = { ...s.vsDuel, ...payload.vsDuel };
    }
  });
  return counts;
}
