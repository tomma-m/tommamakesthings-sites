# sidelinehero.app SEO phase 2: rotation charts, chart maker, guides

Date: 2026-11-17. Status: draft for Tom's approval.
Repos: `tomma-m/tommamakesthings-sites` (public, this repo) and `tomma-m/sideline-hero` (private, the app).
Background: app repo `docs/research/2026-11-13-competitor-analysis.md`, sections "Website recommendations" and "SEO and ASO keywords". Phase 1 (canonical URLs, share cards, sitemap, JSON-LD, Search Console, tagged store badges) went live 2026-11-17.

## Why

More downloads, from coaches finding Sideline Hero when they search (Tom). Today the site has six pages and ranks for nothing but its own name. The analysis found that no competitor has pages built for the searches coaches make ("10 player basketball rotation", "equal playing time basketball", "basketball substitution chart"), so those results are winnable.

**Who, in order** (Tom): US youth and rec coaches first (their season peaks December to February, and the Instagram ads go US-first around 22 Nov), then a handful of Australian pages.

**Success:** Search Console shows clicks on coaching searches, not just the brand name; App Store Connect Campaigns and Play Console acquisition show installs tagged from the site. New pages take 2 to 6 months to rank, so March 2027 is the first fair check.

## Goals

1. Rotation chart pages, one per roster size, that rank for "N player basketball rotation" searches.
2. A free "rotation chart maker" page: pick roster size and format, type names, print.
3. Two or three cornerstone US guides at launch, then more over time.
4. Every new page ends at the store badges, tagged per page, so each page's downloads can be counted.

## Non-goals (for this design)

- Compare pages (vs SubTime, Sub Wizard, a clipboard), the Australian pages, and guides beyond the first three. They come after, as separate small pieces of work, on the page system built here.
- Pricing, clubs, parents pages; localisation; a blog index with dates, tags or RSS.
- Analytics of any kind on the site.

## Anti-goals (would make this a failure even if it works)

- **Publishing the engine.** The substitution engine's code must never reach the public repo or a visitor's browser, minified or not (Tom, 2026-11-17). Only its finished output (charts) is published.
- **Tracking visitors.** The website privacy policy says the site collects nothing. Nothing new may set cookies, store data, send requests, or load a third-party resource. The chart maker runs entirely in the browser and keeps nothing.
- **Thin, near-duplicate pages.** No page per format combination. Google treats dozens of near-identical generated pages as spam, and coaches don't search that finely.
- **Promising what the app can't do.** Pages describe only what is in the store build (the CLAUDE.md "hold the site push" rule).
- **Generic coaching filler.** Guides must read as written by a coach (Tom corrects every draft) and say things a clipboard blog wouldn't.

## Constraints

- Site: hand-built HTML plus `build.mjs`; no framework. Push to `main` deploys (S3 + CloudFront). `scripts/check-third-party.sh` gates every deploy. Assets are hashed in the file name. `node --test scripts/*.test.mjs` runs in CI.
- Content copied from the app repo follows the existing pattern: the app repo owns the source file, a site script copies it in (`sync-faqs.mjs`, `sync-releases.mjs`), never hand-edited on the site.
- Voice: `reference_tom_voice_guide` (lead with the point, plain words, contractions, no em dashes). US pages use US spelling and terms ("10U", "rec league", "color"); the rest of the site keeps Australian spelling.
- Free or Premium: not applicable (website, not an app feature). The chart maker is free and must not look like a cut-down app.

## Approaches considered

- **A. Generator first:** an interactive generator running the real engine in the browser. Strongest tool, but it publishes the engine. **Rejected** (anti-goal).
- **B. Guides first:** a Markdown page system and guides, no tool. Quick, but looks like every coaching blog, with nothing to share or come back to.
- **C. Staged, charts before the tool (chosen, Tom 2026-11-17):** the engine runs at build time in the private repo and only the finished charts are published. Roster pages and the chart maker read that data. Guides ride on the same page system.

## Design

### 1. Chart data (app repo, private)

A script in the app repo runs the real engine over a fixed set of formats and writes `docs/rotation-charts.json`, committed there. A site script `scripts/sync-charts.mjs` copies it to `sites/sidelinehero/src/rotation-charts-app.json` (same shape as `sync-releases.mjs`, including `--check`).

**Formats** (builder's call within this range; my proposal):
- Roster sizes 6 to 12.
- Halves: 16 and 20 minutes. Quarters: 6, 8, 10 and 12 minutes. (US youth commonly plays 6 to 8 minute quarters; high school 8; rec halves 16 to 20.)
- That's 7 × 6 = 42 charts.

**Engine settings for every chart:** cadence `auto`, playing-time priority `equal`, every player average skill, Players 1 to 5 start, no fill-ins, no overtime. These are the app's defaults, so a chart is what a new coach would get.

The auto cadence can put a sub at an odd moment (6:30 into a quarter), so charts show times as game-clock `mm:ss` the way the app does, never decimal minutes (Claude's call).

**Data per chart** (output only, nothing the engine could be rebuilt from): roster size, periods, period length; an ordered list of stretches `{ period, start, end, on: [player numbers] }` in game minutes; each player's total minutes; the sub count. A test in the app repo checks every stretch has exactly five players, stretches tile the game with no gaps, and minutes add up to 5 × game length.

**How the script runs TypeScript:** builder's call. Running it as a Jest test that writes the file (Jest already compiles the app's TS) needs no new dependency; a `tsx` dev dependency is the alternative. It must not touch the app bundle.

**Refresh:** rerun after any engine change that ships, then `sync-charts.mjs` on the site, same as release notes.

### 2. Markdown page system (site)

`sites/sidelinehero/src/pages/*.md` with front matter: `title`, `description`, `path`, `kicker`, and optional `campaign` (the store tag slug). `build.mjs` renders each through `marked` into the existing layout via `page()`, so canonical, share tags and the sitemap come for free. A page that sets no `campaign` uses its file name.

Every content page ends with a shared "Get the app" block: a short line and the two store badges, tagged `ct=site-<campaign>` (App Store) and `utm_campaign=<campaign>` (Play). `check-third-party.sh`'s `STORE_LINKS` widens from two exact campaigns to the pattern `site-[a-z0-9-]{1,30}` / `[a-z0-9-]{1,30}`, still the exact host, path, app id and `pt`.

Navigation (my call): add "Rotation charts" to the header nav and "Guides" to the footer. Header space is tight on phones; if it doesn't fit at 360 px, the header link goes and the footer keeps both.

### 3. Rotation chart pages (site)

One page per roster size, 6 to 12: `/rotation-charts/8-players` and so on, plus a hub at `/rotation-charts` (target: "basketball rotation chart"). Each roster page:

- leads with the most common US format for that size (8-minute quarters) as a printable chart: a grid with a row per player, a column per stretch, filled where the player is on court, and each player's minutes;
- lists the other formats as links into the chart maker, preset to that roster and format;
- has 150 to 300 words of real advice specific to that roster size (with 6, everyone plays most of the game and rest is the issue; with 12, sitting time is), drafted by Claude, corrected by Tom;
- ends with the app block: "These charts assume nothing goes wrong. The app re-plans live when a player fouls out, gets hurt or arrives late."

Built from `rotation-charts-app.json` at build time: static HTML, no JavaScript needed to read or print.

### 4. Chart maker (site)

`/rotation-chart-maker` (target: "basketball rotation generator", "equal playing time calculator").

- Pick roster size, halves or quarters, and period length (only the formats in the data). Optional: type player names. They relabel Player 1, 2, … in the page only.
- Shows the chart and a print button. Print CSS gives a clean one-page sheet with the site name small at the bottom.
- Plain JavaScript in `site.<v>.js` or a second hashed module, reading the chart data embedded in the page at build time. No fetch, no storage (not even localStorage), no third parties. Names never leave the page.
- Presets from links: `?players=10&format=q8` selects that chart (read by the script only; CloudFront ignores the query, which is fine for a static page).
- Without JavaScript: the page shows the 10-player, 8-minute-quarter chart and links to the roster pages.
- Ends with the app block, stating plainly what the app adds: live re-planning, sub alerts, fouls and injuries, stats, season fairness.

### 5. First three US guides (site)

Drafted by Claude in Tom's voice, US terms, each 800 to 1,500 words, corrected by Tom before merge:

1. **How to sub fairly in youth basketball** (`/guides/fair-subs-youth-basketball`): the cornerstone; links to the charts and the maker.
2. **Equal playing time in rec league basketball** (`/guides/equal-playing-time`): what "equal" means in practice, how to explain it to parents.
3. **Running a rotation with 10 players (or more)** (`/guides/big-roster-rotation`): the most common pain point, links to the 10 to 12 player charts.

Facts about league rules are only stated with a source the reader can check; otherwise the guide speaks from coaching practice. Guides get a "Guides" hub at `/guides`.

### Review workflow

Code changes go through branches and tests as usual. For words: Claude drafts on a branch, Tom reads the rendered page (a local build, or a private preview page Claude publishes), corrects, and only then does it merge to `main` (which deploys). Nothing goes live uncorrected.

### Order of work

1. App repo: chart script, `docs/rotation-charts.json`, its test. Site: `sync-charts.mjs`.
2. Site: Markdown page system, app block, widened store-link gate, nav links.
3. Site: hub + seven roster pages (drafted, Tom corrects).
4. Site: chart maker.
5. Site: three guides and the guides hub (drafted, Tom corrects).

Each step ships on its own; the site is never left half-built on `main`.

## Left to the builder

- Exact chart grid markup and print CSS, within the site's existing design language (ruled stat-sheet rows, broadcast tags, no pills or icon cards).
- How the chart script runs TypeScript (Jest or `tsx`).
- The final format list within the proposed range, and the stretch representation.
- Test coverage for the new build steps, following `scripts/site.test.mjs`.
