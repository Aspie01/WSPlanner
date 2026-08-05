import { $, $$, esc, fmtNum, fmtDur, parseNum, parseDur, toast, debounce } from '../util.js';
import { getState, update, RESOURCE_KEYS, RESOURCE_LABELS, SPEEDUP_KEYS, SPEEDUP_LABELS } from '../store.js';
import { queueTotals } from './growth.js';

export default {
  async render(root, ctx) {
    const state = getState();
    const inv = state.inventory;
    const totals = queueTotals(state.queue);

    root.innerHTML = `
      <h1>Resources</h1>
      <p class="page-intro">Write down what you have banked. Everything on the Growth Plan and the VS Duel estimate
        is measured against these numbers, so they only need to be roughly right — update them before a big push.</p>

      <div class="card">
        <div class="card-head"><h2>Resources</h2><span class="spacer"></span>
          ${inv.updatedAt ? `<span class="faint small">updated ${esc(new Date(inv.updatedAt).toLocaleString())}</span>` : ''}</div>
        <div class="grid cols-3">
          ${RESOURCE_KEYS.map((k) => {
            const have = Number(inv.resources[k]) || 0;
            const need = totals.resources[k] || 0;
            return `
              <div class="field">
                <label for="res_${k}">${esc(RESOURCE_LABELS[k])}</label>
                <input type="text" id="res_${k}" data-res="${k}" value="${have ? esc(fmtNum(have)) : ''}" placeholder="0" inputmode="decimal">
                ${need ? `<div class="hint">${have >= need
                  ? '<span class="pill good">covers the plan</span>'
                  : `plan needs ${esc(fmtNum(need))} — short ${esc(fmtNum(need - have))}`}</div>` : ''}
              </div>`;
          }).join('')}
        </div>
        <p class="faint small" style="margin-bottom:0">Short forms are fine: <code>45.2M</code>, <code>800k</code>, <code>1.4b</code>.</p>
      </div>

      <div class="card">
        <div class="card-head"><h2>Speedups</h2></div>
        <div class="grid cols-3">
          ${SPEEDUP_KEYS.map((k) => {
            const have = Number(inv.speedups[k]) || 0;
            return `
              <div class="field">
                <label for="sp_${k}">${esc(SPEEDUP_LABELS[k])}</label>
                <input type="text" id="sp_${k}" data-sp="${k}" value="${have ? esc(fmtDur(have)) : ''}" placeholder="0m">
                <div class="hint">${have ? `${esc(String(have))} minutes` : 'e.g. 3d 4h 30m'}</div>
              </div>`;
          }).join('')}
        </div>
        <div class="grid cols-2" style="margin-top:6px">
          <div class="stat">
            <div class="label">Total banked</div>
            <div class="value">${fmtDur(SPEEDUP_KEYS.reduce((a, k) => a + (Number(inv.speedups[k]) || 0), 0)) || '0m'}</div>
          </div>
          <div class="stat">
            <div class="label">Growth plan needs</div>
            <div class="value">${fmtDur(totals.timeMin) || '0m'}</div>
            <div class="sub">before research and buff bonuses</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Speedup converter</h2></div>
        <p class="muted small" style="margin-top:0">Counting a stack of speedup items? Enter how many of each you hold and it totals the minutes.</p>
        <div class="grid cols-4" id="conv">
          ${[1, 5, 10, 15, 30, 60, 180, 480, 1440, 4320].map((mins) => `
            <div class="field">
              <label>${esc(fmtDur(mins))} items</label>
              <input type="number" min="0" data-conv="${mins}" placeholder="0" inputmode="numeric">
            </div>`).join('')}
        </div>
        <div class="btn-row" style="align-items:center">
          <strong id="convTotal" class="tnum">0m</strong>
          <span class="muted small">total</span>
          <span style="flex:1"></span>
          <select id="convTarget" style="width:auto">
            ${SPEEDUP_KEYS.map((k) => `<option value="${k}">${esc(SPEEDUP_LABELS[k])}</option>`).join('')}
          </select>
          <button class="btn small" id="convAdd">Add to bank</button>
          <button class="btn small" id="convSet">Replace bank</button>
        </div>
      </div>
    `;

    const stamp = (s) => { s.inventory.updatedAt = new Date().toISOString(); };

    for (const input of $$('[data-res]', root)) {
      input.addEventListener('change', () => {
        const value = parseNum(input.value);
        update((s) => { s.inventory.resources[input.dataset.res] = value; stamp(s); });
        input.value = value ? fmtNum(value) : '';
        ctx.rerender();
      });
    }

    for (const input of $$('[data-sp]', root)) {
      input.addEventListener('change', () => {
        const value = parseDur(input.value);
        update((s) => { s.inventory.speedups[input.dataset.sp] = value; stamp(s); });
        ctx.rerender();
      });
    }

    const convTotal = () => $$('[data-conv]', root)
      .reduce((sum, i) => sum + (Number(i.value) || 0) * Number(i.dataset.conv), 0);

    $('#conv', root).addEventListener('input', debounce(() => {
      $('#convTotal', root).textContent = fmtDur(convTotal()) || '0m';
    }, 150));

    const applyConv = (replace) => {
      const minutes = convTotal();
      if (!minutes) return toast('Enter how many speedup items you have first.');
      const key = $('#convTarget', root).value;
      update((s) => {
        s.inventory.speedups[key] = replace ? minutes : (Number(s.inventory.speedups[key]) || 0) + minutes;
        stamp(s);
      });
      toast(`${replace ? 'Set' : 'Added'} ${fmtDur(minutes)} of ${SPEEDUP_LABELS[key]} speedups`);
      ctx.rerender();
    };

    $('#convAdd', root).addEventListener('click', () => applyConv(false));
    $('#convSet', root).addEventListener('click', () => applyConv(true));
  },
};
