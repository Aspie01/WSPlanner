import { $, esc, toast } from '../util.js';
import { importPayload } from '../store.js';
import { decodePayload } from '../share.js';
import { offsetLabel } from '../time.js';

function summarize(payload) {
  const bits = [];
  if (payload.events?.length) bits.push(`${payload.events.length} calendar event${payload.events.length === 1 ? '' : 's'}`);
  if (payload.roster?.length) bits.push(`${payload.roster.length} roster member${payload.roster.length === 1 ? '' : 's'}`);
  if (payload.squads?.length) bits.push(`${payload.squads.length} squad${payload.squads.length === 1 ? '' : 's'}`);
  if (payload.heroes?.length) bits.push(`${payload.heroes.length} hero${payload.heroes.length === 1 ? '' : 'es'}`);
  if (payload.queue?.length) bits.push(`${payload.queue.length} growth step${payload.queue.length === 1 ? '' : 's'}`);
  if (payload.gameDataOverrides && Object.keys(payload.gameDataOverrides).length) {
    bits.push(`edits to ${Object.keys(payload.gameDataOverrides).join(', ')} data`);
  }
  if (payload.inventory) bits.push('resource and speedup totals');
  return bits;
}

export default {
  async render(root, ctx) {
    const code = ctx.query.get('d');
    if (!code) {
      root.innerHTML = `<div class="card"><h1>Nothing to import</h1>
        <p class="muted">This page opens shared planner links. Ask whoever sent it to create the link again from
        Settings &amp; Sharing.</p><a class="btn" href="#/">Back to the dashboard</a></div>`;
      return;
    }

    root.innerHTML = '<div class="loading">Opening shared plan…</div>';

    let payload;
    try {
      payload = await decodePayload(code);
    } catch (err) {
      root.innerHTML = `<div class="card"><h1>That link could not be opened</h1>
        <p class="muted">${esc(err.message)}</p>
        <p class="muted small">Links sometimes get cut short by chat apps. Ask for a downloaded file instead —
        you can import one from Settings &amp; Sharing.</p>
        <a class="btn" href="#/">Back to the dashboard</a></div>`;
      return;
    }

    const bits = summarize(payload);

    root.innerHTML = `
      <h1>Shared plan</h1>
      <p class="page-intro">Somebody sent you part of their planner. Nothing changes until you choose below.</p>

      <div class="card">
        <div class="card-head"><h2>What is in it</h2>
          <span class="spacer"></span>
          <span class="pill">${esc(payload.scope || 'unknown scope')}</span></div>
        ${payload.profile?.alliance ? `<p class="muted" style="margin-top:0">From alliance <strong>${esc(payload.profile.alliance)}</strong>${payload.profile.state ? `, state ${esc(payload.profile.state)}` : ''}.</p>` : ''}
        ${payload.profile?.serverOffsetMin !== undefined ? `<p class="muted small">Server time ${esc(offsetLabel(payload.profile.serverOffsetMin))}.</p>` : ''}
        ${bits.length
          ? `<ul class="muted" style="padding-left:20px">${bits.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`
          : '<p class="muted">It looks empty.</p>'}
        ${payload.exportedAt ? `<p class="faint small">Shared ${esc(new Date(payload.exportedAt).toLocaleString())}.</p>` : ''}
      </div>

      <div class="card">
        <div class="card-head"><h2>Add it to your planner</h2></div>
        <p class="muted small" style="margin-top:0"><strong>Merge</strong> keeps everything you already have and adds
          what is missing, updating anything with the same name. <strong>Replace</strong> throws your data away first —
          only do that on a fresh device.</p>
        <div class="btn-row">
          <button class="btn primary" id="merge">Merge into mine</button>
          <button class="btn danger" id="replace">Replace everything</button>
          <a class="btn" href="#/">Cancel</a>
        </div>
      </div>
    `;

    $('#merge', root).addEventListener('click', () => {
      const counts = importPayload(payload, 'merge');
      const added = Object.entries(counts).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`).join(', ');
      toast(added ? `Merged — added ${added}` : 'Merged — everything was already up to date');
      location.hash = '#/calendar';
    });

    $('#replace', root).addEventListener('click', () => {
      if (!confirm('Erase your own plan and replace it with this shared one?')) return;
      importPayload(payload, 'replace');
      toast('Replaced with the shared plan');
      location.hash = '#/';
    });
  },
};
