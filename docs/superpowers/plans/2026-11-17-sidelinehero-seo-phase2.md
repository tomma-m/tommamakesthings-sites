# sidelinehero.app SEO Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rotation chart pages, a printable rotation chart maker and the first three US guides on sidelinehero.app, built from the app engine's output without publishing the engine.

**Architecture:** A Jest-run script in the private app repo runs the real engine over 42 fixed formats and commits `docs/rotation-charts.json` (output only). The public site copies it in (`sync-charts.mjs`, like `sync-releases.mjs`), validates it, and renders it at build time with one shared renderer (`src/js/chart-render.js`) that the browser chart maker also imports. Content pages are Markdown with front matter, rendered through the existing `page()` so canonical, share tags and sitemap come for free.

**Tech Stack:** App: TypeScript, Jest (jest-expo). Site: Node 24 ESM, `marked`, `node:test`, plain browser JS modules, S3/CloudFront deploy.

**Spec:** `docs/superpowers/specs/2026-11-17-sidelinehero-seo-phase2-design.md` (this repo).

## Global Constraints

- The engine's code never enters this repo or a browser. Only `docs/rotation-charts.json` output crosses over.
- Nothing on the site sets cookies, uses `localStorage`/`sessionStorage`/IndexedDB, fetches, or loads a third-party resource. `scripts/check-third-party.sh` must pass.
- Chart engine settings: `sub_cadence_mode: 'auto'`, `playing_time_priority: 'equal'`, every player `skill: null`, starters = players 1 to 5, `subs_per_rotation = max(1, N - 5)`, `sub_interval_minutes: 2`, `period_end_quiet_seconds: 0`, `timer_mode: 'countdown'`.
- Formats: rosters 6 to 12; format keys `h16`, `h20` (2 periods of 16/20 min), `q6`, `q8`, `q10`, `q12` (4 periods). 42 charts. Roster pages lead with `q8`; the chart maker defaults to 10 players `q8`.
- Times shown as the scoreboard countdown `m:ss` within the period, the way the app shows them. Data stores whole game seconds.
- Copy: Tom's voice (lead with the point, plain words, contractions, no em dashes). US pages use US spelling and terms. Every content page ends with the app block and tagged store badges.
- Store tags: App Store `https://apps.apple.com/app/apple-store/id6796588008?pt=129245947&amp;ct=site-<campaign>&amp;mt=8`, Play `https://play.google.com/store/apps/details?id=app.sidelinehero.coach&amp;utm_source=sidelinehero.app&amp;utm_medium=website&amp;utm_campaign=<campaign>`, campaign matches `[a-z0-9-]{1,30}`.
- Words go live only after Tom has corrected them. Push to site `main` deploys.

## Review Focus

1. **Names typed into the chart maker that contain HTML** (`<b>`, `"`, `&`) must show as plain text, never markup. Test in Task 2 (`renderChartTable` escapes).
2. **Fewer names than players, blank names, or extra names** fall back to `Player n` for blank or missing names and ignore extras. Test in Task 2 (`playerLabels`).
3. **A preset query the data doesn't have** (`?players=20`, `?format=q7`, garbage) shows the default chart, never a blank page. Test in Task 5 (`parsePreset`).
4. **Engine output rounding:** two subs in the same minute, or fractional minutes, must never produce a zero-length or overlapping stretch, and player seconds must sum exactly to 5 × game seconds. Test in Task 1 (invariants over all 42) and Task 2 (`validateCharts` rejects violations).
5. **A 12-player, 12-minute-quarter chart printed** fits one landscape page. Manual print check in Task 5, Step 6.

---

### Task 1: Chart data from the engine (app repo, private)

Work in a worktree of `sideline-hero` off `origin/master`, branch `feat/rotation-charts`.

**Files:**
- Create: `scripts/rotation-charts/rotationCharts.ts`
- Create: `scripts/rotation-charts/__tests__/rotationCharts.test.ts`
- Create: `docs/rotation-charts.json` (generated)
- Modify: `package.json` (script `"charts": "WRITE_ROTATION_CHARTS=1 jest scripts/rotation-charts"`)
- Modify: `RUNBOOK.md` (one paragraph: rerun `npm run charts` after an engine change that ships, then `sync-charts.mjs` on the site)

**Interfaces:**
- Produces (the JSON contract the site relies on):
  ```ts
  type FormatKey = 'h16' | 'h20' | 'q6' | 'q8' | 'q10' | 'q12';
  interface Stretch { period: number; start: number; end: number; on: number[] } // game seconds, on = player numbers 1..N, sorted
  interface RotationChart { players: number; format: FormatKey; periods: number; period_length_minutes: number; subs: number; stretches: Stretch[]; seconds: number[] } // seconds[i] = player i+1
  interface RotationChartsFile { version: 1; charts: RotationChart[] } // sorted by players, then format in the order above
  ```
- `buildRotationChart(players: number, format: FormatKey): RotationChart` and `buildAllCharts(): RotationChartsFile` in `rotationCharts.ts`. Engine imported by relative path from `src/services/substitution/algorithm`. Nothing under `src/` imports this file (keeps it out of the app bundle).

- [ ] **Step 1: Write the failing tests** in `rotationCharts.test.ts`:
  - `builds all 42 charts`: `buildAllCharts().charts.length === 42`, every `players` in 6..12, every format present once per roster.
  - `every stretch has exactly five distinct players in 1..N, sorted`.
  - `stretches tile each period with no gaps or overlaps, no zero-length stretch, and never cross a period boundary`: for each period p, stretches with `period === p` run contiguously from `(p-1)*L*60` to `p*L*60`, each `end > start`.
  - `player seconds come from the stretches and sum to exactly 5 × game seconds`.
  - `subs` equals the number of stretch boundaries where `on` changes.
  - `deterministic`: two calls to `buildAllCharts()` deep-equal.
  - `committed file is current`: if `process.env.WRITE_ROTATION_CHARTS === '1'`, write `JSON.stringify(buildAllCharts(), null, 2) + '\n'` to `docs/rotation-charts.json` first; then assert the file's parsed contents deep-equal `buildAllCharts()`. This is the drift guard: an engine change without `npm run charts` fails CI.

- [ ] **Step 2: Run** `npx jest scripts/rotation-charts --runInBand`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement `rotationCharts.ts`.** Build input like `src/services/substitution/__tests__/helpers.ts` `makeInput` does, with the Global Constraints settings and player ids `p1..pN`. Call `generateSubstitutionPlan`. Walk the plan: seeds (minute 0, empty `players_out`) give the opening five; real subs (non-empty `players_out`, not `skipped`) sorted by minute change the court. Cut stretches at every sub minute and every period boundary; convert minute to game seconds with `Math.round(minute * 60)`; merge any stretch that rounds to zero length into its neighbour. Compute `seconds` from the stretches, not from `projected_minutes`.

- [ ] **Step 4: Run** `npm run charts`, then `npx jest scripts/rotation-charts --runInBand`. Expected: PASS, `docs/rotation-charts.json` written (about 42 charts).

- [ ] **Step 5: Run the CI mirror** `npx tsc --noEmit && npm run lint && npm test -- --runInBand`. Expected: all green.

- [ ] **Step 6: Commit, push, PR** (`feat: rotation chart data for the website`). Merge once CI is green (Tom has approved this plan).

---

### Task 2: Site chart data: sync, validate, render

Work in `tommamakesthings-sites` on branch `sidelinehero-seo-phase2` (it holds the spec).

**Files:**
- Create: `scripts/charts.mjs` (`parseChartsJson`, `validateCharts`, `formatCharts`), modelled on `scripts/releases.mjs`
- Create: `scripts/sync-charts.mjs`, a copy of `scripts/sync-releases.mjs` reading `docs/rotation-charts.json` and writing `sites/sidelinehero/src/rotation-charts-app.json`
- Create: `sites/sidelinehero/src/js/chart-render.js` (pure ES module, no DOM, imported by both `build.mjs` and the browser)
- Create: `scripts/charts.test.mjs`
- Create: `sites/sidelinehero/src/rotation-charts-app.json` (via the sync script)
- Modify: `README.md` (a "Rotation charts" section like "What's new")

**Interfaces:**
- Consumes: the `RotationChartsFile` contract from Task 1.
- Produces, in `chart-render.js`:
  - `FORMATS: Array<{ key, periods, minutes, label }>`, labels `'2 × 16-min halves'`, `'2 × 20-min halves'`, `'4 × 6-min quarters'`, … in the Task 1 order.
  - `findChart(file, players, formatKey): RotationChart | undefined`
  - `playerLabels(n: number, names?: string[]): string[]`, trimmed names, `Player k` for blank or missing, extras ignored.
  - `periodClock(seconds: number, chart): string`, the countdown `m:ss` within the period (`'8:00'` at a quarter's start).
  - `renderChartTable(chart, labels: string[]): string`, an HTML `<table class="rotation-chart">` with a header row of stretches (period tag plus clock range), a row per player with filled cells where on court (`<td class="on">`), a final minutes column (`m:ss`), and a `<caption>` naming roster and format. Every label is HTML-escaped.

- [ ] **Step 1: Write failing tests** in `charts.test.mjs`:
  - `validateCharts` accepts the synced file; rejects (with a message naming the chart) a stretch with 4 players, a gap between stretches, seconds not summing to 5 × game, an unknown format key, a duplicate roster/format pair.
  - `findChart(file, 10, 'q8')` returns that chart; `findChart(file, 20, 'q8')` is `undefined`.
  - `playerLabels(3, ['Ava', '  ', undefined, 'Extra'])` deep-equals `['Ava', 'Player 2', 'Player 3']`.
  - `periodClock(0, q8chart) === '8:00'`, `periodClock(480 + 90, q8chart) === '6:30'`.
  - `renderChartTable(chart, ['<b>x</b> & "y"', ...])` contains `&lt;b&gt;x&lt;/b&gt; &amp; &quot;y&quot;` and no `<b>`; has N player rows and one `class="on"` cell per player per stretch they play; total `class="on"` cells = 5 × stretches.
  - `sync-charts.mjs --check` exits 0 against the committed copy (spawn it with the app checkout path).

- [ ] **Step 2: Run** `node --test scripts/charts.test.mjs`. Expected: FAIL.

- [ ] **Step 3: Implement** `charts.mjs`, `chart-render.js`, `sync-charts.mjs`; run `node scripts/sync-charts.mjs` with the merged app checkout.

- [ ] **Step 4: Run** `node --test scripts/*.test.mjs`. Expected: all pass.

- [ ] **Step 5: Commit** (`sidelinehero: rotation chart data, validator and renderer`).

---

### Task 3: Markdown pages, app block, tagged badges, nav

**Files:**
- Modify: `build.mjs` (load `src/pages/**/*.md`, front matter, `{{chart}}` token, app block)
- Create: `sites/sidelinehero/src/partials/app-block.html` (copy below, with `{{campaign}}`)
- Modify: `sites/sidelinehero/src/layout.html` (header nav "Rotation charts" → `/rotation-charts`; footer "Guides" → `/guides`)
- Modify: `scripts/check-third-party.sh` (`STORE_LINKS` campaign becomes `[a-z0-9-]{1,30}`, host, path, app id and `pt` unchanged)
- Modify: `sites/sidelinehero/src/css/site.css` (app block, `.rotation-chart` table, print rules)
- Modify: `scripts/site.test.mjs`

**Interfaces:**
- Front matter (YAML-like, `---` fenced, simple `key: value` lines; no new dependency): `title`, `description`, `path`, `kicker`, optional `campaign` (default: file name without `.md`), optional `chartPlayers` (6..12).
- A Markdown page body may contain a line `{{chart}}`; `build.mjs` replaces it with `renderChartTable(findChart(charts, chartPlayers, 'q8'), playerLabels(chartPlayers))` plus a list of links to the other five formats in the maker (`/rotation-chart-maker?players=<n>&format=<key>`). A page without `chartPlayers` that contains `{{chart}}` fails the build.
- Every Markdown page gets the app block appended, with `{{campaign}}` filled in.

App block copy (exact):

> **Plans change. The app keeps up.** Sideline Hero plans fair rotations before tip-off, then re-plans live when a player fouls out, gets hurt or shows up late. Free on iPhone and Android.

- [ ] **Step 1: Write failing tests** for what this task ships (page rendering itself is tested against real pages in Task 4, since tests run on the real build):
  - `every page has the new header and footer` gains `href="/rotation-charts"` in the header nav and `href="/guides"` in the footer.
  - `check-third-party.sh` passes on a tagged link with campaign `rotation-charts-8-players` and fails on one with `pt=999` (run the script against a temp dist containing each, as a spawned process).
  - `parseFrontMatter` (export it from a new `scripts/pages.mjs` that `build.mjs` imports) returns fields and body; throws on a missing `path`, a `path` not starting with `/`, a `campaign` outside `[a-z0-9-]{1,30}`, or `chartPlayers` outside 6..12.

- [ ] **Step 2: Run** `node --test scripts/*.test.mjs`. Expected: FAIL.

- [ ] **Step 3: Implement** `scripts/pages.mjs` (`parseFrontMatter(text, file)`), the `build.mjs` page loop (after the existing pages, before robots/sitemap), the partial, nav links, gate pattern, CSS. Print CSS: `@page { size: landscape; margin: 12mm }`, hide header, footer, app block and nav; keep the chart and caption; site name small at the bottom.

- [ ] **Step 4: Run** `node --test scripts/*.test.mjs && ./scripts/check-third-party.sh`. Expected: PASS, gate ok.

- [ ] **Step 5: Check the header at 360 px wide** in Chrome. If "Rotation charts" wraps or crowds the tag, remove it from the header (footer keeps it) and update the header test.

- [ ] **Step 6: Commit** (`sidelinehero: Markdown pages, app block, chart nav`).

---

### Task 4: Rotation chart hub and roster pages

**Files:**
- Create: `sites/sidelinehero/src/pages/rotation-charts.md` (`path: /rotation-charts`, campaign `rotation-charts`)
- Create: `sites/sidelinehero/src/pages/rotation-charts/{6..12}-players.md` (`path: /rotation-charts/<n>-players`, `chartPlayers: <n>`, campaign `rotation-charts-<n>-players`)
- Modify: `scripts/site.test.mjs`

Titles follow `"<n> player basketball rotation · Sideline Hero"`; hub `"Basketball rotation charts for 6 to 12 players · Sideline Hero"`. Each roster page body: a one-line lede, `{{chart}}`, then 150 to 300 words of advice specific to that roster size (US terms), drafted by Claude. The hub links all seven and the maker.

- [ ] **Step 1: Write failing tests:** the hub and all seven pages build; each roster page has exactly one `table.rotation-chart` with N player rows and caption naming `4 × 8-min quarters`; each links the five other formats in the maker; each has the app block with its own campaign in both badge URLs; all eight are in `sitemap.xml`; no `{{` survives.

- [ ] **Step 2: Run tests.** Expected: FAIL.

- [ ] **Step 3: Write the eight Markdown pages** (draft copy).

- [ ] **Step 4: Run** `node --test scripts/*.test.mjs && ./scripts/check-third-party.sh`. Expected: PASS.

- [ ] **Step 5: Tom review.** Publish the built hub and one roster page as a private preview (Artifact), send Tom the copy for all eight, apply his corrections, rebuild, rerun tests.

- [ ] **Step 6: Commit, merge to `main`, watch the deploy, verify** `/rotation-charts/10-players` live with its chart, and record in memory (`project_sideline_hero_website.md`).

---

### Task 5: Rotation chart maker

**Files:**
- Create: `sites/sidelinehero/src/rotation-chart-maker.html` (body: kicker, H1 "Rotation chart maker", lede, form, chart container, print button)
- Create: `sites/sidelinehero/src/js/chart-maker.js` (DOM wiring; imports `chart-render.<v>.js` and exports pure `parsePreset`)
- Modify: `build.mjs` (page at `/rotation-chart-maker`, campaign `rotation-chart-maker`, embeds the charts file as `<script type="application/json" id="chart-data">` with `<` escaped, renders the default 10-player `q8` chart into the container so it works without JS, appends the app block)
- Modify: `sites/sidelinehero/src/layout.html` only if the maker needs its own module tag (prefer loading it from the page body)
- Modify: `scripts/site.test.mjs`, `scripts/charts.test.mjs`

**Interfaces:**
- Consumes: `FORMATS`, `findChart`, `playerLabels`, `renderChartTable` (Task 2).
- `parsePreset(search: string, file): { players: number, format: FormatKey }`: valid `players` and `format` from the query if that chart exists; otherwise `{ players: 10, format: 'q8' }`.
- Form: roster `<select>` 6..12, format `<select>` from `FORMATS`, a `<textarea>` "Player names (optional, one per line)"; changing any re-renders. Print button calls `window.print()`. No storage, no fetch.

- [ ] **Step 1: Write failing tests:** `parsePreset('?players=8&format=h20', file)` → `{8,'h20'}`; `'?players=20'`, `'?format=q7'`, `'?players=abc'`, `''` → `{10,'q8'}`. Built page: contains `id="chart-data"` whose JSON parses and validates; contains the default chart table without JS; has canonical `/rotation-chart-maker`, is in the sitemap; `chart-maker` script source contains no `localStorage`, `sessionStorage`, `indexedDB`, `fetch(`, `XMLHttpRequest` or `document.cookie`.

- [ ] **Step 2: Run tests.** Expected: FAIL.

- [ ] **Step 3: Implement** the page, `chart-maker.js` and the build step. Names render through `renderChartTable` (escaped); assign with `innerHTML` only from that function's output.

- [ ] **Step 4: Run** `node --test scripts/*.test.mjs && ./scripts/check-third-party.sh`. Expected: PASS.

- [ ] **Step 5: Browser check** (local static server over `dist/`, Chrome): change roster and format; type names including `<b>x</b>`; open `?players=12&format=q12` and `?players=99`; confirm no network requests beyond the page's own files (DevTools Network).

- [ ] **Step 6: Print check:** print preview of 12 players `q12` and 6 players `h20`. Each fits one landscape page with names readable. Adjust print CSS if not.

- [ ] **Step 7: Tom review** of the page copy (preview Artifact), apply corrections. Commit, merge to `main`, watch the deploy, verify live, update the roster pages' "other formats" links if anything changed, record in memory.

---

### Task 6: Guides hub and first three US guides

**Files:**
- Create: `sites/sidelinehero/src/pages/guides.md` (`path: /guides`)
- Create: `sites/sidelinehero/src/pages/guides/fair-subs-youth-basketball.md`, `equal-playing-time.md`, `big-roster-rotation.md` (paths `/guides/<file name>`)
- Modify: `scripts/site.test.mjs`

Each guide is 800 to 1,500 words, US terms, Tom's voice, links to the relevant roster pages and the maker. League rules are stated only with a link the reader can check; otherwise the guide speaks from coaching practice. Titles: "How to sub fairly in youth basketball", "Equal playing time in rec league basketball", "Running a rotation with 10 or more players".

- [ ] **Step 1: Write failing tests:** the hub lists exactly the three guides with links; each guide builds with canonical, app block with its own campaign, and is in the sitemap; each guide links `/rotation-chart-maker` and at least one `/rotation-charts/` page; no guide contains an em dash (`—`).

- [ ] **Step 2: Run tests.** Expected: FAIL.

- [ ] **Step 3: Draft the hub and three guides.**

- [ ] **Step 4: Run** `node --test scripts/*.test.mjs && ./scripts/check-third-party.sh`. Expected: PASS.

- [ ] **Step 5: Tom review**, one guide at a time (preview Artifact), apply corrections, rerun tests.

- [ ] **Step 6: Commit, merge to `main`, watch the deploy, verify live,** request indexing of the new pages in Search Console (Tom, or Claude in Tom's Chrome), record in memory.
