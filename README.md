# WS Planner

Planning tools for **Whiteout Survival**, built for a couple of players and their alliances.

It is a plain static web app: no build step, no server, no accounts. Open it in Safari on an
iPhone or iPad, add it to the home screen, and it behaves like an app — including offline.

## What it does

| Page | What it is for |
| --- | --- |
| **Dashboard** | Today's VS Duel day, what is coming up next, and how much you have banked. |
| **VS Duel** | The Mon–Sat duel week: what each day scores, what to bank in advance, a per-day checklist, and a points estimate you can check against a personal target. |
| **Event Calendar** | Bear Trap, Crazy Joe, Foundry, Canyon Clash, SvS and anything else, written in **server time** and shown in each person's local time too. |
| **Growth Plan** | A queue of the upgrades you are saving for, totalled into "here is what you need and here is what you are short by". |
| **Resources** | What you have banked, including a speedup-item counter that adds a stack up into minutes. |
| **Alliance Roster** | Members, power, furnace level, what they march, who leads rallies, and squad assignments. CSV in and out. |
| **Game Data** | Where the game's numbers live, and where you correct them. |
| **Settings & Sharing** | Your profile, server timezone, share links, exports and backups. |

## About the game numbers

Whiteout Survival's upgrade costs, build times and duel point values change with every patch, and
a confidently wrong number is worse than a blank one. So:

- **Cost tables ship empty.** Fill in the levels you are actually working towards, under
  *Game Data*. Anything blank is reported as "no cost data" rather than being silently treated as free.
- **VS Duel point rates ship as community figures, marked `unverified`.** Do one action in game,
  see what it scored, and put the real number in. The pill turns green once you have checked it.
- Everything you enter is stored on your own device and travels with your exports and share links.

Day *themes* (Monday is Radar Training, Tuesday is Base Expansion, and so on) are stable and are
seeded properly. It is the numbers that need checking.

## Sharing between people

There is no server, so nothing syncs automatically. Instead:

- **Share link** — *Settings & Sharing → Create share link*. The data is compressed into the link
  itself and nothing is uploaded. Paste it into alliance chat; whoever opens it gets a preview and
  chooses whether to merge it into their own planner.
- **File export/import** — more reliable than a link for large exports, since chat apps truncate
  long URLs.
- **CSV** — the roster imports and exports as CSV if someone already keeps one in a spreadsheet.

Choose the *schedule only* scope for the smallest link. Merging never overwrites someone's personal
plan; it only adds and updates the shared parts.

## Backups

Data lives in the browser's local storage. Clearing website data, or switching phones, loses it.
*Settings & Sharing → Download full backup* writes a JSON file — keep one somewhere safe.

## Hosting on GitHub Pages

Live at **https://aspie01.github.io/WSPlanner/**

The repository root **is** the site, so there is nothing to build. Pushing to `main` runs
`.github/workflows/pages.yml`, which enables Pages if needed and publishes the root — no settings
to touch first. `.nojekyll` is present so the `js/` directory is served as-is.

`configure-pages` sets `enablement: true`, so the workflow turns Pages on rather than relying on
someone having done it by hand.

**The workflow deliberately has no `environment: github-pages` block**, and adding one back breaks
it. That block makes GitHub check the environment *before* allocating a runner; here the check
rejects the job, which then fails in about two seconds with no runner and no step logs at all —
nothing runs, and there is nothing to read afterwards. It was tried twice, including after Pages
was enabled with the source set to GitHub Actions, and failed identically both times.

All it would buy is the deployed URL displayed on the run page. `actions/deploy-pages` does not
need it. If a deploy ever fails in a couple of seconds with no logs, this is the first thing to
check.

## Running it locally

ES modules need a real HTTP origin, so opening `index.html` from the filesystem will not work:

```sh
python3 -m http.server 8000
# then open http://127.0.0.1:8000/
```

## Layout

```
index.html          markup shell
styles.css          all styling; dark and light themes via CSS variables
app.js              bootstrap, hash router, clock and countdown ticker
sw.js               service worker (offline); bump CACHE to force an update
manifest.webmanifest
js/
  store.js          the single state object, persistence, import/export
  time.js           server-time conversion and event recurrence
  share.js          deflate + base64url share links
  gamedata.js       loads data/, layers user edits on top
  util.js           formatting ("45.2M", "3d 4h"), DOM helpers
  views/            one module per page
data/               seed game data as editable JSON
```

**Adding a page:** write `js/views/<name>.js` exporting `{ render(root, ctx) }`, register it in the
`ROUTES` map in `app.js`, add a link in `index.html`, and list it in `sw.js`'s `ASSETS`.

`render` gets `ctx.query` (the hash query string) and `ctx.rerender()`. Views own their own
listeners; bind them to elements *inside* the view, never to `root`, which outlives the render.
