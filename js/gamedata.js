// Game reference data.
//
// The numbers in Whiteout Survival move with every patch, so nothing here is
// hard-coded into the UI: the JSON files under /data are the seed, and anything
// the user edits is stored as an override in their own state and layered on top.

import { getState, update } from './store.js';

const FILES = {
  vsDuel: 'data/vsduel.json',
  events: 'data/events.json',
  buildings: 'data/buildings.json',
  research: 'data/research.json',
  troops: 'data/troops.json',
};

let seed = null;

export async function loadGameData() {
  if (seed) return seed;
  const entries = await Promise.all(
    Object.entries(FILES).map(async ([key, path]) => {
      try {
        const res = await fetch(path, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`${res.status}`);
        return [key, await res.json()];
      } catch (err) {
        console.error(`could not load ${path}`, err);
        return [key, null];
      }
    }),
  );
  seed = Object.fromEntries(entries);
  return seed;
}

/** Seed data for one section with the user's overrides merged over the top. */
export function gd(section) {
  const base = seed?.[section] ?? null;
  const override = getState().gameDataOverrides?.[section];
  if (!override) return base;
  if (Array.isArray(base) || Array.isArray(override)) return override ?? base;
  return { ...base, ...override };
}

export function setOverride(section, value) {
  update((s) => {
    s.gameDataOverrides = { ...s.gameDataOverrides, [section]: value };
  });
}

export function clearOverride(section) {
  update((s) => {
    const next = { ...s.gameDataOverrides };
    delete next[section];
    s.gameDataOverrides = next;
  });
}

export function hasOverride(section) {
  return Boolean(getState().gameDataOverrides?.[section]);
}

export function seedFor(section) {
  return seed?.[section] ?? null;
}

/**
 * Cost of taking `table` from one level to another.
 * Returns null when the levels in range have no data filled in yet.
 */
export function costBetween(levels, fromLevel, toLevel) {
  if (!Array.isArray(levels)) return null;
  const rows = levels.filter((r) => Number(r.level) > Number(fromLevel) && Number(r.level) <= Number(toLevel));
  if (!rows.length) return null;
  const totals = { resources: {}, timeMin: 0, steps: rows.length, missing: 0 };
  for (const row of rows) {
    const hasData = row.timeMin != null || (row.resources && Object.keys(row.resources).length);
    if (!hasData) { totals.missing++; continue; }
    totals.timeMin += Number(row.timeMin) || 0;
    for (const [k, v] of Object.entries(row.resources || {})) {
      totals.resources[k] = (totals.resources[k] || 0) + (Number(v) || 0);
    }
  }
  return totals;
}

/** Every level entry a table needs, whether or not costs are filled in. */
export function levelRows(entry) {
  if (!entry) return [];
  if (Array.isArray(entry.levels) && entry.levels.length) return entry.levels;
  const max = Number(entry.maxLevel) || 0;
  return Array.from({ length: max }, (_, i) => ({ level: i + 1, resources: {}, timeMin: null }));
}
