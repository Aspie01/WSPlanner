// Small DOM + formatting helpers shared by every view.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/* ---------- Resource amounts ----------
   The game shows resources as "45.2M" / "1.35B", so both the parser and the
   formatter speak that dialect. */

const SUFFIXES = [
  { s: 'B', v: 1e9 },
  { s: 'M', v: 1e6 },
  { s: 'K', v: 1e3 },
];

export function fmtNum(n, digits = 2) {
  const num = Number(n) || 0;
  const abs = Math.abs(num);
  for (const { s, v } of SUFFIXES) {
    if (abs >= v) {
      const scaled = num / v;
      // Drop the decimals once the leading part is big enough to carry the signal.
      const d = abs >= v * 100 ? 0 : digits;
      return `${trimZeros(scaled.toFixed(d))}${s}`;
    }
  }
  return trimZeros(num.toFixed(abs < 10 && abs % 1 !== 0 ? 1 : 0));
}

export function fmtInt(n) {
  return (Number(n) || 0).toLocaleString();
}

function trimZeros(s) {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

export function parseNum(input) {
  if (typeof input === 'number') return input;
  const raw = String(input ?? '').trim().replace(/[, _]/g, '');
  if (!raw) return 0;
  const m = raw.match(/^(-?\d*\.?\d+)\s*([kmbt]?)$/i);
  if (!m) return Number(raw) || 0;
  const mult = { '': 1, k: 1e3, m: 1e6, b: 1e9, t: 1e12 }[m[2].toLowerCase()];
  return Number(m[1]) * mult;
}

/* ---------- Durations (stored everywhere as minutes) ---------- */

export function fmtDur(minutes, { compact = false } = {}) {
  let m = Math.max(0, Math.round(Number(minutes) || 0));
  if (m === 0) return '0m';
  const d = Math.floor(m / 1440); m -= d * 1440;
  const h = Math.floor(m / 60); m -= h * 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  return (compact ? parts.slice(0, 2) : parts).join(' ');
}

export function parseDur(input) {
  if (typeof input === 'number') return input;
  const raw = String(input ?? '').trim().toLowerCase();
  if (!raw) return 0;
  // Bare numbers are read as minutes, which is what people type most often.
  if (/^\d+(\.\d+)?$/.test(raw)) return Number(raw);
  let total = 0;
  let matched = false;
  for (const m of raw.matchAll(/(\d+(?:\.\d+)?)\s*(d|h|m)/g)) {
    matched = true;
    const mult = { d: 1440, h: 60, m: 1 }[m[2]];
    total += Number(m[1]) * mult;
  }
  return matched ? Math.round(total) : 0;
}

/* ---------- Misc formatting ---------- */

export function pluralize(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export function download(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readFile(accept = 'application/json') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    };
    input.click();
  });
}

export function toast(message) {
  const wrap = document.getElementById('toasts');
  if (!wrap) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // iOS blocks the async clipboard outside a user gesture; fall back to a
    // hidden textarea + execCommand, which still works there.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}
