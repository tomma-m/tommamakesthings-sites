# Sideline Hero Site Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the look of sidelinehero.tommamakesthings.com on the app's own design language (broadcast tags, ruled stat-sheet rows, bib chips, Plan-tab timeline) for the freemium app, then deploy it.

**Architecture:** The site stays a static site: plain HTML pages, rendered into `layout.html` by `build.mjs`, with one stylesheet (plus tokens) and one small ES-module script. Layout changes go into `layout.html`, `site.css` and `index.html`. Inner pages only swap classes. `build.mjs` gains asset versioning and a wrapper for inner pages. Tests are `node:test` files that build the site and assert on `dist/`.

**Tech Stack:** Node 20 (`node:test`, `node:crypto`), `marked` (already a dependency), vanilla CSS and JS. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-02-sidelinehero-site-redesign-design.md`. Read it before starting. The approved mockups are `.superpowers/brainstorm/64962-1790918376/content/full-page-v2.html`, `mobile.html` and `pricing-rows.html` (local, git-ignored). Open them in a browser for reference. Don't copy their CSS: their class names are mockup-only.

**Repo:** `~/projects/tommamakesthings-sites`, branch `sidelinehero-redesign`. It sits on top of `sidelinehero-freemium` and has no upstream. **Never push before Task 6.** Pushing `main` deploys the live site.

## Global Constraints

- No third-party requests. `./scripts/check-third-party.sh` must pass on every build.
- No new npm dependencies, no framework, no bundler.
- Copy: the existing paragraphs stay word for word. New strings are exactly the ones in the spec's "New copy" table (Proposed column) and the stat-sheet table. **No em dashes (—) or en dashes (–)** in any new or changed copy. Australian spelling.
- Premium wording is exactly: `No ads, plus new premium features as they're released.` (the app's `PREMIUM_BENEFITS`). Never name an unbuilt feature. No prices.
- Store badges stay unlinked (no `<a>` around them).
- Contrast: orange tag background `--orange-cta` `#C2510A` (never `--orange` behind text), amber tag `#9A5C00`, Done tag ink on `--rule`, Upcoming tag `--muted` outline, no state shown by opacity alone.
- Breakpoint `720px`, mobile-first. Container `1120px`, text measure `40rem`, gutter `clamp(16px, 4vw, 32px)`.
- The script must exit quietly on pages without its elements, and the page must be complete without it.
- Commit after every task, with the `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` trailer.

## Review Focus

1. **A returning visitor whose browser cached last week's CSS/JS** (assets are served `max-age=604800`) should get the new styles, not a broken mix. This is covered by asset versioning in Task 1: every CSS/JS URL carries `?v=<hash>`, including the `@import` of `tokens.css`.
2. **JavaScript off, or the module fails to load,** should still give a complete homepage: every step's screenshot visible, nothing hidden. Covered in Task 4: the CSS that hides inline step screenshots must be scoped to `.js`.
3. **The sticky header covering anchor targets** (`/#how-it-works`, FAQ `#topic` links). The heading should land below the header. Covered in Task 2: `scroll-padding-top` on `html`.
4. **A 360px-wide Android phone.** The header should fit on one line with no horizontal scroll. Covered in Task 2 (the "How it works" link is hidden below 420px) and checked in a real browser in Task 5.
5. **The countdown clock reaching zero.** It should hold at `00:00`, never show a negative or `NaN`. Covered in Task 4 by `formatClock` tests.

---

### Task 1: Asset versioning, test harness, smoke fix

**Files:**
- Create: `scripts/asset-version.mjs`
- Create: `scripts/site.test.mjs`
- Modify: `build.mjs` (copy loop, `render`)
- Modify: `sites/sidelinehero/src/layout.html` (stylesheet href)
- Modify: `sites/sidelinehero/src/css/site.css:1` (the `@import`)
- Modify: `scripts/smoke.sh`
- Modify: `.github/workflows/deploy.yml` (test step; check the real filename with `ls .github/workflows`)

**Interfaces:**
- Produces: `assetVersion(dirs: string[]): Promise<string>`, 8 lowercase hex characters, from `scripts/asset-version.mjs`.
- Produces: the `{{v}}` placeholder. Any file in `dist/` (HTML, CSS, JS) may contain it, and the build replaces it everywhere.
- Produces: `scripts/site.test.mjs` with a `before()` that builds the site once, plus helpers `read(path)` (reads a file under `sites/sidelinehero/dist/`) and `flat(html)` (collapses whitespace). Later tasks add tests to this file.

- [ ] **Step 1: Write the failing tests**

Create `scripts/site.test.mjs`:

```js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, readdir, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assetVersion } from './asset-version.mjs';

const DIST = 'sites/sidelinehero/dist';
const read = (p) => readFile(join(DIST, p), 'utf8');
const flat = (s) => s.replace(/\s+/g, ' ');

before(() => {
  execFileSync('node', ['build.mjs', 'sidelinehero'], { stdio: 'pipe' });
});

async function allFiles(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await allFiles(p));
    else if (/\.(html|css|js)$/.test(e.name)) out.push(p);
  }
  return out;
}

test('no {{placeholder}} survives the build', async () => {
  for (const f of await allFiles(DIST)) {
    assert.ok(!(await readFile(f, 'utf8')).includes('{{'), `${f} still has a {{placeholder}}`);
  }
});

test('stylesheet and its tokens import carry the same 8-hex version', async () => {
  const html = await read('index.html');
  const css = await read('css/site.css');
  const v = html.match(/\/css\/site\.css\?v=([0-9a-f]{8})"/)?.[1];
  assert.ok(v, 'index.html links /css/site.css?v=<8 hex>');
  assert.match(css, new RegExp(`tokens\\.css\\?v=${v}`));
});

test('assetVersion changes when any asset changes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'av-'));
  await writeFile(join(dir, 'a.css'), 'body{}');
  const first = await assetVersion([dir]);
  assert.match(first, /^[0-9a-f]{8}$/);
  assert.equal(await assetVersion([dir]), first, 'stable for the same content');
  await writeFile(join(dir, 'a.css'), 'body{color:red}');
  assert.notEqual(await assetVersion([dir]), first);
});

test('assetVersion skips directories that do not exist', async () => {
  assert.match(await assetVersion(['definitely/not/here']), /^[0-9a-f]{8}$/);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test scripts/site.test.mjs`
Expected: FAIL. `Cannot find module .../asset-version.mjs`.

- [ ] **Step 3: Implement**

Create `scripts/asset-version.mjs`:

```js
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

// CSS and JS are served with a 7-day browser cache. Every URL to them carries
// ?v=<this hash>, so a changed file is a new URL and no visitor mixes old
// styles with new markup. Hash covers paths AND contents, sorted, so it is
// stable across machines.
export async function assetVersion(dirs) {
  const hash = createHash('sha256');
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    const names = (await readdir(dir, { recursive: true })).sort();
    for (const name of names) {
      const p = join(dir, name);
      try { hash.update(name).update(await readFile(p)); } catch { /* directory entry */ }
    }
  }
  return hash.digest('hex').slice(0, 8);
}
```

In `build.mjs`, add the import at the top:

```js
import { assetVersion } from './scripts/asset-version.mjs';
```

Replace the copy loop:

```js
for (const dir of ['css', 'fonts', 'img']) {
  if (existsSync(`${SRC}/${dir}`)) await cp(`${SRC}/${dir}`, `${DIST}/${dir}`, { recursive: true });
}
```

with:

```js
for (const dir of ['css', 'fonts', 'img', 'js']) {
  if (existsSync(`${SRC}/${dir}`)) await cp(`${SRC}/${dir}`, `${DIST}/${dir}`, { recursive: true });
}

// See scripts/asset-version.mjs. Stamped into CSS/JS here and into HTML in render().
const V = await assetVersion([`${SRC}/css`, `${SRC}/js`]);
for (const dir of ['css', 'js']) {
  if (!existsSync(`${DIST}/${dir}`)) continue;
  for (const name of await readdir(`${DIST}/${dir}`)) {
    const p = `${DIST}/${dir}/${name}`;
    await writeFile(p, (await readFile(p, 'utf8')).replaceAll('{{v}}', V));
  }
}
```

and add `readdir` to the `node:fs/promises` import on line 1.

In `render()`, add a `{{v}}` replacement **after** `{{body}}` so page bodies can use it too:

```js
function render(body, { title, description }) {
  return layout
    .replaceAll('{{title}}', () => escapeHtml(title))
    .replaceAll('{{description}}', () => escapeHtml(description))
    .replaceAll('{{body}}', () => body)
    .replaceAll('{{v}}', () => V);
}
```

`render` is a function declaration but `V` is assigned before the first `page()` call, so ordering is fine. Keep the copy/stamp block above the first `await page(...)`.

In `layout.html`: `href="/css/site.css"` → `href="/css/site.css?v={{v}}"`.
In `src/css/site.css` line 1: `@import url('tokens.css');` → `@import url('tokens.css?v={{v}}');`.

- [ ] **Step 4: Fix the smoke test for the freemium privacy policy**

In `scripts/smoke.sh`, the policy check greps for `all your data stays on your device`, which the rewritten `privacy-app.md` no longer contains (its line 11 says "...stays on your device."). Change that line to:

```bash
if grep -q 'stays on your device' <<<"$privacy"; then
```

and add a Terms check after `check "faq" ...`:

```bash
check "terms"             200 "/terms"
```

- [ ] **Step 5: Run all tests in CI**

In the deploy workflow, replace:

```yaml
      - name: Test FAQ helpers
        run: node --test scripts/faqs.test.mjs
```

with:

```yaml
      - name: Tests
        run: node --test scripts/
```

`node --test scripts/` runs every `*.test.mjs` in `scripts/` on Node 20.

- [ ] **Step 6: Run tests and the gate**

Run: `node --test scripts/ && ./scripts/check-third-party.sh`
Expected: all tests pass, then `ok   no third-party asset URLs`.

- [ ] **Step 7: Commit**

```bash
git add scripts/asset-version.mjs scripts/site.test.mjs build.mjs sites/sidelinehero/src/layout.html sites/sidelinehero/src/css/site.css scripts/smoke.sh .github/workflows
git commit -m "build: version CSS/JS URLs, add built-site tests, fix smoke for new policy

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Shared shell (tokens, header, footer, inner pages)

**Files:**
- Modify: `sites/sidelinehero/src/css/tokens.css` (append tokens)
- Modify: `sites/sidelinehero/src/css/site.css` (rewrite the shell, keep the badge and `.policy-site` rules)
- Modify: `sites/sidelinehero/src/layout.html` (header, footer, `<main>`)
- Modify: `build.mjs` (`page()` wraps non-home bodies; FAQ contents markup)
- Modify: `sites/sidelinehero/src/support.html`, `sites/sidelinehero/src/404.html`
- Test: `scripts/site.test.mjs`

**Interfaces:**
- Consumes: `{{v}}`, `read`, `flat` from Task 1.
- Produces: CSS classes later tasks use: `.container`, `.kicker`, `.lede`, `.tag`, `.tag-ink`, `.tag-orange`, `.tag-amber`, `.bib`, `.band-dark`, `.store-badges`, `.badge-app-store`, `.badge-google-play`, `.phone`. Tokens: `--container --measure --gutter --header-h --dark --dark-surface --dark-rule --dark-ink --dark-body --dark-kicker --tint --amber-tag`.
- Produces: `page(outPath, body, meta)`. When `meta.fullBleed` is true, the body goes straight into `<main>`. Otherwise it's wrapped in `<div class="container page">…</div>`.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/site.test.mjs`:

```js
const PAGES = ['index.html', 'faq/index.html', 'privacy/index.html', 'terms/index.html', 'support/index.html', '404.html'];

test('every page has the new header and footer', async () => {
  for (const p of PAGES) {
    const html = await read(p);
    assert.match(html, /<header class="site-header">/, p);
    assert.match(html, /<main id="main">/, p);
    for (const href of ['/privacy', '/terms', '/faq', '/support']) {
      assert.match(html, new RegExp(`<footer class="site-footer">[\\s\\S]*href="${href}"`), `${p} footer → ${href}`);
    }
    assert.match(html, /href="\/#how-it-works"/, `${p} header links How it works`);
    assert.ok(!/class="(wrap|card)"/.test(html), `${p} still uses .wrap or .card`);
  }
});

test('inner pages sit in the container column, the homepage does not', async () => {
  for (const p of PAGES.filter((p) => p !== 'index.html')) {
    assert.match(await read(p), /<main id="main"><div class="container page">/, p);
  }
  assert.doesNotMatch(await read('index.html'), /<div class="container page">/);
});

test('FAQ contents are ruled rows, not a card', async () => {
  const html = await read('faq/index.html');
  assert.match(html, /<nav class="faq-contents" aria-label="Questions on this page">/);
});

test('anchors land below the sticky header', async () => {
  const css = await read('css/site.css');
  assert.match(css, /html\s*\{[^}]*scroll-padding-top:\s*calc\(var\(--header-h\)/);
});

test('the How it works header link hides below 420px', async () => {
  const css = await read('css/site.css');
  assert.match(css, /@media \(max-width: 419px\)\s*\{\s*\.nav-how\s*\{\s*display:\s*none;?\s*\}/);
});

// WCAG relative luminance contrast, computed from the real token values.
function contrast(a, b) {
  const lum = (h) => {
    const [r, g, b2] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b2;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

test('text colour pairs meet WCAG AA (4.5:1)', async () => {
  const tokens = await read('css/tokens.css');
  const t = Object.fromEntries([...tokens.matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1], m[2]]));
  const pairs = [
    ['#FFFFFF', t['orange-cta'], 'white on orange tag'],
    ['#FFFFFF', t['amber-tag'], 'white on amber tag'],
    [t.ink, t.rule, 'Done tag'],
    [t.muted, t.canvas, 'muted text / Upcoming tag'],
    [t.muted, t.tint, 'muted text on open row'],
    [t['dark-body'], t.dark, 'body on dark band'],
    [t['dark-kicker'], t.dark, 'kicker on dark band'],
    [t['dark-ink'], t.dark, 'headings on dark band'],
    [t.canvas, t.ink, 'ink tag text'],
    [t['orange-ink'], t.canvas, 'links'],
  ];
  for (const [fg, bg, name] of pairs) {
    assert.ok(fg && bg, `${name}: token missing`);
    assert.ok(contrast(fg, bg) >= 4.5, `${name}: ${contrast(fg, bg).toFixed(2)}:1`);
  }
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test scripts/site.test.mjs`
Expected: FAIL on the header/footer, container, FAQ, scroll-padding, nav-how and contrast tests (the new tokens are missing).

- [ ] **Step 3: Tokens**

Append inside the `:root { … }` block of `src/css/tokens.css`, after `--orange-ink`:

```css
  --container:   1120px;
  --measure:     40rem;
  --gutter:      clamp(16px, 4vw, 32px);
  --header-h:    56px;
  /* Dark bands use the app's dark theme. */
  --dark:         #14100B;
  --dark-surface: #1E1811;
  --dark-rule:    #2E2619;
  --dark-ink:     #F3EADB;  /* headings on --dark */
  --dark-body:    #CFC4B2;  /* body on --dark, 11.0:1 */
  --dark-kicker:  #F4B27A;  /* kickers on --dark, 10.4:1 */
  --tint:         #FCE7D5;  /* "window open" row; --muted on it is 5.0:1 */
  --amber-tag:    #9A5C00;  /* white on it 5.4:1; the app's #C77700 is only 3.5:1 */
```

- [ ] **Step 4: Rewrite the shell of `site.css`**

Replace everything in `src/css/site.css` **except** the `.store-badges` / `.badge-app-store` / `.badge-google-play` block and its comment, and the `.policy-site` block and its comments, which stay verbatim. Delete the old `.wrap`, `.card`, `.shot`, `.hero`, `.trust`, `.faq-*`, `h1, h2` rules. The new file, top to bottom:

```css
@import url('tokens.css?v={{v}}');

*, *::before, *::after { box-sizing: border-box; }
html { scroll-padding-top: calc(var(--header-h) + 16px); }
body {
  margin: 0; background: var(--canvas); color: var(--ink);
  font-family: Hanken, system-ui, sans-serif; font-size: 17px; line-height: 1.6;
}
img { max-width: 100%; }
a { color: var(--orange-ink); }
/* --orange is 3.29:1 on canvas: above the 3:1 minimum for a focus ring. */
:focus-visible { outline: 2px solid var(--orange); outline-offset: 2px; }

.container { max-width: var(--container); margin: 0 auto; padding: 0 var(--gutter); }

/* Type */
h1, h2 {
  font-family: Anton, Impact, sans-serif; font-weight: 400;
  text-transform: uppercase; letter-spacing: 0.01em; line-height: 1;
}
h1 { font-size: clamp(2.5rem, 7vw, 3.75rem); margin: 0 0 16px; }
h2 { font-size: clamp(1.6rem, 4.5vw, 2.25rem); margin: 48px 0 12px; }
.kicker {
  font-family: Saira, sans-serif; font-weight: 700; font-size: 11px;
  letter-spacing: 0.16em; text-transform: uppercase; color: var(--orange-ink);
  margin: 0 0 8px;
}
.lede { font-size: 1.12rem; color: var(--muted); max-width: 34em; }

/* Broadcast tags: solid rectangles, never pills (app design system motif 1). */
.tag {
  display: inline-block; font-family: Saira, sans-serif; font-weight: 700;
  font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase;
  line-height: 1; padding: 5px 9px; border-radius: 3px; white-space: nowrap;
}
.tag-ink    { background: var(--ink); color: var(--canvas); }
.tag-orange { background: var(--orange-cta); color: #fff; }
.tag-amber  { background: var(--amber-tag); color: #fff; }

/* Bib numbers: rounded squares, never circles (motif 3). */
.bib {
  display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; border-radius: 8px; background: var(--ink);
  color: var(--canvas); font-family: Saira, sans-serif; font-weight: 700; font-size: 12px;
}

.phone {
  display: block; height: auto; border: 5px solid var(--ink);
  border-radius: 22px; background: var(--ink);
}

.band-dark { background: var(--dark); color: var(--dark-body); }

/* Header */
.site-header {
  position: sticky; top: 0; z-index: 10;
  background: var(--canvas); border-bottom: 2px solid var(--ink);
}
.site-header .container {
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px; height: var(--header-h);
}
.brand { display: flex; align-items: center; gap: 10px; color: var(--ink); text-decoration: none; }
.brand-tile {
  flex: none; width: 30px; height: 30px; border-radius: 8px; background: var(--ink);
  display: flex; align-items: center; justify-content: center;
}
.brand-name {
  font-family: Anton, Impact, sans-serif; text-transform: uppercase;
  font-size: 19px; letter-spacing: 0.01em; line-height: 1; white-space: nowrap;
}
.site-nav { display: flex; align-items: center; gap: clamp(12px, 3vw, 24px); font-size: 14px; font-weight: 700; }
.site-nav a { color: var(--ink); text-decoration: none; white-space: nowrap; }
.site-nav a:hover { color: var(--orange-ink); }
.site-nav .tag { display: none; }
@media (min-width: 720px) { .site-nav .tag { display: inline-block; } }
/* 360px Android: wordmark + three links overflow. The page scrolls straight
   into How it works anyway, so that link is the one to drop. */
@media (max-width: 419px) { .nav-how { display: none; } }

/* Main + footer */
main { padding-bottom: 64px; }
main:has(> .band-fulltime:last-child) { padding-bottom: 0; }
.site-footer { border-top: 2px solid var(--ink); padding: 20px 0 32px; font-size: 14px; color: var(--muted); }
.site-footer .container { display: flex; flex-wrap: wrap; gap: 8px 24px; justify-content: space-between; }
.site-footer p { margin: 0; }
.site-footer nav { display: flex; flex-wrap: wrap; gap: 8px 18px; }
.site-footer nav a { color: var(--ink); font-weight: 700; text-decoration: none; }
.site-footer nav a:hover { color: var(--orange-ink); }

/* Inner pages: one readable column, left-aligned with the header wordmark. */
.page { padding-top: 40px; }
.page > * { max-width: var(--measure); }
/* Section headers sit above a 2px ink rule (motif 2). */
.page h2 { padding-bottom: 6px; border-bottom: 2px solid var(--ink); }
.ruled-block { border-top: 2px solid var(--ink); border-bottom: 1px solid var(--rule); padding: 12px 0; margin: 16px 0 8px; }
.ruled-block p { margin: 0 0 8px; }
.ruled-block p:last-child { margin: 0; }

/* FAQ: ruled rows like the app's Help screen. h3 is only used here. */
.faq-contents { margin: 24px 0 8px; }
.faq-contents .kicker {
  margin: 24px 0 0; padding-bottom: 6px; border-bottom: 2px solid var(--ink); color: var(--muted);
}
.faq-contents ul { list-style: none; margin: 0; padding: 0; }
.faq-contents li { border-bottom: 1px solid var(--rule); }
.faq-contents li a { display: block; padding: 10px 0; font-weight: 700; text-decoration: none; }
.faq-topic { padding: 4px 0 8px; border-bottom: 1px solid var(--rule); }
.faq-topic h3 {
  font-family: Saira, sans-serif; font-weight: 700; font-size: 1.1rem;
  letter-spacing: 0.02em; margin: 20px 0 8px;
}
.faq-topic p { margin: 0 0 12px; }
```

Then the kept `.store-badges` block, then the kept `.policy-site` block (with `.policy > h2:first-child`).

- [ ] **Step 5: Layout**

Replace `src/layout.html` with:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{title}}</title>
<meta name="description" content="{{description}}">
<link rel="stylesheet" href="/css/site.css?v={{v}}">
</head>
<body>
<header class="site-header">
  <div class="container">
    <a class="brand" href="/">
      <span class="brand-tile" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#E8671A" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18M5.6 5.6c3.5 3.5 3.5 9.3 0 12.8M18.4 5.6c-3.5 3.5-3.5 9.3 0 12.8"/></svg></span>
      <span class="brand-name">Sideline Hero</span>
    </a>
    <nav class="site-nav" aria-label="Site">
      <a class="nav-how" href="/#how-it-works">How it works</a>
      <a href="/faq">FAQ</a>
      <a href="/support">Support</a>
      <span class="tag tag-ink">Coming soon</span>
    </nav>
  </div>
</header>
<main id="main">{{body}}</main>
<footer class="site-footer">
  <div class="container">
    <p>Sideline Hero · made by tommamakesthings.</p>
    <nav aria-label="Footer">
      <a href="/privacy">Privacy</a>
      <a href="/terms">Terms</a>
      <a href="/faq">FAQ</a>
      <a href="/support">Support</a>
    </nav>
  </div>
</footer>
</body>
</html>
```

The SVG uses `xmlns`-less inline markup, so `check-third-party.sh` sees no URL. Don't add `xmlns="http://www.w3.org/2000/svg"` (it's allowed, but it isn't needed inline).

- [ ] **Step 6: `build.mjs`, wrap inner pages and the FAQ contents**

Change `page()` so non-home pages get the column wrapper:

```js
async function page(outPath, body, meta) {
  const full = `${DIST}/${outPath}`;
  await mkdir(full.replace(/\/[^/]+$/, ''), { recursive: true });
  const content = meta.fullBleed ? body : `<div class="container page">\n${body}\n</div>`;
  await writeFile(full, render(content, meta));
  console.log('  ->', outPath);
}
```

`<main id="main">{{body}}</main>` has no whitespace, so the test regex `<main id="main"><div class="container page">` matches.

Add `fullBleed: true` to the homepage call's meta object (`page('index.html', …, { title, description, fullBleed: true })`).

In `faqBody`, change `'<nav class="card faq-contents" aria-label="Questions on this page">'` to `'<nav class="faq-contents" aria-label="Questions on this page">'`.

- [ ] **Step 7: Support and 404**

`src/support.html`: change `<div class="card">` to `<div class="ruled-block">`. Nothing else changes.

`src/404.html`: replace the file with (same copy, no `.hero` wrapper):

```html
<p class="kicker">404</p>
<h1>Nothing here.</h1>
<p class="lede">That page doesn't exist. Try the
<a href="/">home page</a>, or <a href="/support">get in touch</a>.</p>
```

- [ ] **Step 8: Run tests and the gate**

Run: `node --test scripts/ && ./scripts/check-third-party.sh`
Expected: PASS. (The homepage still has its old markup and looks unstyled. Task 3 replaces it.)

- [ ] **Step 9: Commit**

```bash
git add -A sites/sidelinehero/src build.mjs scripts/site.test.mjs
git commit -m "sidelinehero: new shared shell: header, footer, ruled inner pages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Homepage

**Files:**
- Modify: `sites/sidelinehero/src/index.html` (full rewrite)
- Modify: `sites/sidelinehero/src/css/site.css` (append the homepage sections)
- Test: `scripts/site.test.mjs`

**Interfaces:**
- Consumes: classes and tokens from Task 2.
- Produces (Task 4 relies on these exact hooks):
  - `<li class="step" data-state="done|open|next|upcoming">`, four of them inside `<ol class="story-steps">`
  - inside each step: `.step-tag` (text = label) and `img.step-shot`
  - `img[data-story-phone]` inside `.story-phone`
  - `[data-clock="372"]` on the clock element (seconds remaining; text `06:12`)
  - initial states in HTML: `done, open, next, upcoming`

- [ ] **Step 1: Write the failing tests**

Append to `scripts/site.test.mjs`:

```js
const PREMIUM = "No ads, plus new premium features as they're released.";

test('homepage keeps the existing copy word for word', async () => {
  const html = flat(await read('index.html'));
  for (const s of [
    'Coach the game,<br>not the subs.',
    'Fair rotations, planned before tip-off. The app guides you through every sub during the game.',
    'Who\'s been on longest? Who hasn\'t had their fair share of court time?',
    'Most coaches juggle this on a clipboard, lose track halfway through the second quarter, and spend the rest of the game with a nagging feeling that someone\'s been short-changed.',
    'Pick your starting five, or let Smart Pick choose them from skill level and recent playing time, then tell Sideline Hero how you want rotations to work. It builds a full substitution plan, balancing playing time across the whole roster. You choose the priority: equal time for everyone, more minutes for developing players, or your strongest lineup when it counts.',
    'The game clock ticks alongside the action. When a substitution window approaches, the app alerts you before the moment, not after. Planned subs are queued and ready in two taps. Need an unplanned change? Manual sub puts the players who need court time most at the top of the bench.',
    'Tap points, fouls and opponent scores as they happen. Court time is logged to the second, so you never have to wonder who played how long.',
    'Every game adds to a running record. Browse your history to see how the season is going, or open any player to track their development over time.',
  ]) assert.ok(html.includes(s), `missing: ${s.slice(0, 50)}…`);
});

test('homepage has the approved new copy, and no em or en dashes', async () => {
  const html = flat(await read('index.html'));
  for (const s of ['Coming soon · iPhone and Android', 'How a game goes', 'Auto-plan · equal minutes',
    'Ready for your next game.', 'Free to download', 'the free version shows ads',
    'Premium, an optional in-app purchase', PREMIUM,
    'Yearly subscription or one-time lifetime purchase.', '5 to 12']) {
    assert.ok(html.includes(s), `missing: ${s}`);
  }
  const src = await readFile('sites/sidelinehero/src/index.html', 'utf8');
  assert.doesNotMatch(src, /[—–]/, 'index.html contains an em or en dash');
});

test('story: four steps, screenshots in order, initial states', async () => {
  const html = await read('index.html');
  const steps = [...html.matchAll(/<li class="step" data-state="(\w+)">([\s\S]*?)<\/li>/g)];
  assert.deepEqual(steps.map((m) => m[1]), ['done', 'open', 'next', 'upcoming']);
  assert.deepEqual(steps.map((m) => m[2].match(/class="phone step-shot" src="\/img\/(shot-\d)\.png"/)?.[1]),
    ['shot-2', 'shot-3', 'shot-5', 'shot-1']);
  assert.deepEqual(steps.map((m) => m[2].match(/class="tag step-tag"[^>]*>([^<]+)</)?.[1]),
    ['Done', 'Window open', 'Next', 'Upcoming']);
  assert.match(html, /id="how-it-works"/);
  assert.match(html, /<img class="phone" data-story-phone src="\/img\/shot-3\.png"/);
  assert.match(html, /data-clock="372">06:12</);
});

test('every image has alt, width and height; below-the-fold images are lazy', async () => {
  const html = await read('index.html');
  const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(imgs.length >= 12, `only ${imgs.length} images`);
  for (const img of imgs) {
    assert.match(img, /\salt="[^"]*"/, img);
    if (!/badge-/.test(img)) assert.match(img, /\swidth="840" height="1818"/, img);
  }
  for (const img of imgs.filter((i) => /step-shot|data-story-phone/.test(i))) {
    assert.match(img, /loading="lazy"/, img);
  }
});

test('store badges are not links', async () => {
  const html = await read('index.html');
  assert.doesNotMatch(html, /<a\b[^>]*>\s*<img[^>]*badge-/);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test scripts/site.test.mjs`
Expected: FAIL on the five new tests.

- [ ] **Step 3: Write `src/index.html`**

Replace the whole file with the following. The alt texts are copied unchanged from the current page.

```html
<section class="hero">
  <div class="hero-arcs" aria-hidden="true"></div>
  <div class="container hero-text">
    <p class="tag tag-ink">Coming soon · iPhone and Android</p>
    <h1>Coach the game,<br>not the subs.</h1>
    <p class="lede">Fair rotations, planned before tip-off. The app guides you
    through every sub during the game.</p>
    <!-- Official, unmodified badge artwork (Apple developer marketing guidelines;
         Google Play badges page), self-hosted. At launch, wrap each in a link to
         its live store listing. -->
    <div class="store-badges">
      <img class="badge-app-store" src="/img/badge-app-store.svg" alt="Download on the App Store">
      <img class="badge-google-play" src="/img/badge-google-play.png" alt="Get it on Google Play">
    </div>
  </div>
  <div class="hero-fan" aria-hidden="true">
    <img class="phone phone-left" src="/img/shot-2.png" alt="" width="840" height="1818">
    <img class="phone phone-centre" src="/img/shot-3.png" alt="" width="840" height="1818">
    <img class="phone phone-right" src="/img/shot-5.png" alt="" width="840" height="1818">
    <div class="score-bug"><span class="tag tag-amber">Window open</span><span class="score-bug-time">00:40</span></div>
  </div>
</section>

<section class="band-dark band-problem">
  <div class="container problem">
    <div class="game-clock" aria-hidden="true">
      <div class="game-clock-head"><span>Game clock</span><span>Q2</span></div>
      <div class="game-clock-time" data-clock="372">06:12</div>
    </div>
    <div class="problem-text">
      <p class="problem-statement">You're on the sideline. The clock is running.
      <em>Someone needs to come off.</em></p>
      <p>Who's been on longest? Who hasn't had their fair share of court time?</p>
      <p>Most coaches juggle this on a clipboard, lose track halfway through the
      second quarter, and spend the rest of the game with a nagging feeling that
      someone's been short-changed.</p>
    </div>
  </div>
</section>

<section class="story" id="how-it-works">
  <div class="container">
    <div class="section-head">
      <h2>How a game goes</h2>
      <p class="kicker">Auto-plan · equal minutes</p>
    </div>
    <div class="story-grid">
      <ol class="story-steps">
        <li class="step" data-state="done">
          <div class="step-time" aria-hidden="true"><span class="kicker">Pre-game</span><span class="step-clock">PRE</span></div>
          <span class="step-node" aria-hidden="true"></span>
          <div class="step-body">
            <span class="tag step-tag" aria-hidden="true">Done</span>
            <h2>Plan before the game starts</h2>
            <p>Pick your starting five, or let Smart Pick choose them from skill level and
            recent playing time, then tell Sideline Hero how you want rotations to work. It
            builds a full substitution plan, balancing playing time across the whole roster.
            You choose the priority: equal time for everyone, more minutes for developing
            players, or your strongest lineup when it counts.</p>
            <img class="phone step-shot" src="/img/shot-2.png" alt="New Game setup: pick a team, with game details and settings summarised as 4 by 8 minutes, auto subs, equal time." width="840" height="1818" loading="lazy">
          </div>
        </li>
        <li class="step" data-state="open">
          <div class="step-time" aria-hidden="true"><span class="kicker">Q1</span><span class="step-clock">04:00</span></div>
          <span class="step-node" aria-hidden="true"></span>
          <div class="step-body">
            <span class="tag step-tag" aria-hidden="true">Window open</span>
            <h2>Follow along live</h2>
            <p>The game clock ticks alongside the action. When a substitution window
            approaches, the app alerts you before the moment, not after. Planned subs are
            queued and ready in two taps. Need an unplanned change? Manual sub puts the
            players who need court time most at the top of the bench.</p>
            <img class="phone step-shot" src="/img/shot-3.png" alt="Live game screen: game clock running in the first quarter, a SUB WINDOW OPEN alert, the five players on court with their minutes, and the bench below." width="840" height="1818" loading="lazy">
          </div>
        </li>
        <li class="step" data-state="next">
          <div class="step-time" aria-hidden="true"><span class="kicker">Full time</span><span class="step-clock">00:00</span></div>
          <span class="step-node" aria-hidden="true"></span>
          <div class="step-body">
            <span class="tag step-tag" aria-hidden="true">Next</span>
            <h2>Track stats without a statistician</h2>
            <p>Tap points, fouls and opponent scores as they happen. Court time is logged to
            the second, so you never have to wonder who played how long.</p>
            <img class="phone step-shot" src="/img/shot-5.png" alt="Full time screen: final score entry above a table of every player's minutes, points and fouls." width="840" height="1818" loading="lazy">
          </div>
        </li>
        <li class="step" data-state="upcoming">
          <div class="step-time" aria-hidden="true"><span class="kicker">Season</span><span class="step-clock">G12</span></div>
          <span class="step-node" aria-hidden="true"></span>
          <div class="step-body">
            <span class="tag step-tag" aria-hidden="true">Upcoming</span>
            <h2>See the season, not just the game</h2>
            <p>Every game adds to a running record. Browse your history to see how the season
            is going, or open any player to track their development over time.</p>
            <img class="phone step-shot" src="/img/shot-1.png" alt="Team screen listing a ten-player roster with jersey numbers, plus a link to season minutes." width="840" height="1818" loading="lazy">
          </div>
        </li>
      </ol>
      <div class="story-phone" aria-hidden="true">
        <img class="phone" data-story-phone src="/img/shot-3.png" alt="" width="840" height="1818" loading="lazy">
      </div>
    </div>
  </div>
</section>

<section class="sheet-section">
  <div class="container">
    <table class="stat-sheet">
      <thead><tr><th colspan="3" scope="colgroup">Built for youth basketball</th></tr></thead>
      <tbody>
        <tr><td><span class="bib" aria-hidden="true">5</span></td><td><span class="sheet-label">Rosters</span> <span class="sheet-note">flexible game formats</span></td><td class="sheet-value"><span class="sheet-number">5 to 12</span></td></tr>
        <tr><td><span class="bib" aria-hidden="true">0</span></td><td><span class="sheet-label">Game day works offline</span> <span class="sheet-note">plan and run a game with no connection</span></td><td class="sheet-value"><span class="tag tag-ink">Offline</span></td></tr>
        <tr><td><span class="bib" aria-hidden="true">0</span></td><td><span class="sheet-label">No account</span> <span class="sheet-note">no login, no password</span></td><td class="sheet-value"><span class="tag tag-ink">None</span></td></tr>
        <tr><td><span class="bib" aria-hidden="true">0</span></td><td><span class="sheet-label">Your team data stays on your device</span> <span class="sheet-note">no analytics, no tracking</span></td><td class="sheet-value"><span class="tag tag-ink">None</span></td></tr>
        <tr><td><span class="bib" aria-hidden="true">$</span></td><td><span class="sheet-label">Free to download</span> <span class="sheet-note">the free version shows ads</span></td><td class="sheet-value"><span class="tag tag-orange">Free</span></td></tr>
        <tr><td><span class="bib" aria-hidden="true">P</span></td><td><span class="sheet-label">Premium, an optional in-app purchase</span> <span class="sheet-note">No ads, plus new premium features as they're released. Yearly subscription or one-time lifetime purchase.</span></td><td class="sheet-value"><span class="tag tag-ink">Optional</span></td></tr>
      </tbody>
    </table>
  </div>
</section>

<section class="band-dark band-fulltime">
  <div class="container fulltime">
    <div>
      <p class="kicker">Full time</p>
      <p class="fulltime-line">Ready for your next game.</p>
    </div>
    <div class="store-badges">
      <img class="badge-app-store" src="/img/badge-app-store.svg" alt="Download on the App Store">
      <img class="badge-google-play" src="/img/badge-google-play.png" alt="Get it on Google Play">
    </div>
  </div>
</section>
```

Note: the test regex for `.step-shot` expects `class="phone step-shot" src=...` in that attribute order, and `.step-tag` expects `class="tag step-tag"`. Keep the attribute order as written.

- [ ] **Step 4: Append the homepage CSS**

Append to `src/css/site.css` (after the FAQ rules, before the kept badge block):

```css
/* ---------- Homepage ---------- */

/* Hero: centred, a fan of three phones on the app's concentric chalk arcs. */
.hero { position: relative; overflow: hidden; text-align: center; padding-top: 48px; }
.hero-text { position: relative; z-index: 1; }
.hero h1 { font-size: clamp(2.75rem, 9vw, 4.75rem); margin: 16px 0; }
.hero .lede { margin: 0 auto 20px; }
.hero .store-badges { justify-content: center; }
.hero-arcs {
  position: absolute; left: 50%; bottom: -40%; width: min(820px, 130vw); aspect-ratio: 1;
  transform: translateX(-50%); border-radius: 50%; border: 2px solid var(--rule); pointer-events: none;
}
.hero-arcs::before, .hero-arcs::after { content: ''; position: absolute; border-radius: 50%; border: 2px solid var(--rule); }
.hero-arcs::before { inset: 14%; }
.hero-arcs::after  { inset: 28%; }
.hero-fan { position: relative; height: clamp(250px, 40vw, 420px); margin-top: 32px; }
.hero-fan .phone { position: absolute; left: 50%; top: 12%; width: clamp(104px, 17vw, 190px); }
.hero-fan .phone-centre { top: 0; width: clamp(120px, 19vw, 215px); transform: translateX(-50%); z-index: 2; }
.hero-fan .phone-left  { transform: translateX(-135%) rotate(-5deg); }
.hero-fan .phone-right { transform: translateX(35%) rotate(5deg); }
@media (min-width: 720px) {
  .hero-fan .phone-left  { transform: translateX(-135%) rotate(-7deg); }
  .hero-fan .phone-right { transform: translateX(35%) rotate(7deg); }
}
/* A TV score bug over the centre phone (motif 1). Decorative. */
.score-bug {
  position: absolute; z-index: 3; top: 6%; left: calc(50% + clamp(20px, 6vw, 70px));
  display: flex; box-shadow: 0 8px 20px rgb(25 20 16 / 0.2);
}
.score-bug .tag { border-radius: 0; display: flex; align-items: center; }
.score-bug-time {
  background: var(--ink); color: var(--canvas); padding: 4px 10px; line-height: 1.1;
  font-family: Anton, Impact, sans-serif; font-size: clamp(18px, 2.4vw, 24px); font-variant-numeric: tabular-nums;
}

/* The problem: a scoreboard band. */
.band-problem { padding: 56px 0; }
.problem { display: grid; gap: 24px; }
@media (min-width: 720px) { .problem { grid-template-columns: 180px 1fr; gap: 40px; align-items: start; } }
.game-clock { justify-self: start; background: var(--dark-surface); border: 1px solid var(--dark-rule); padding: 12px 16px; }
.game-clock-head {
  display: flex; justify-content: space-between; gap: 32px; margin-bottom: 4px;
  font-family: Saira, sans-serif; font-weight: 700; font-size: 11px; letter-spacing: 0.16em;
  text-transform: uppercase; color: var(--dark-kicker);
}
.game-clock-time {
  font-family: Anton, Impact, sans-serif; font-size: 48px; line-height: 1;
  color: var(--dark-ink); font-variant-numeric: tabular-nums;
}
.problem-statement {
  font-family: Anton, Impact, sans-serif; text-transform: uppercase; line-height: 1.02;
  font-size: clamp(1.9rem, 4.5vw, 2.6rem); color: var(--dark-ink); margin: 0 0 16px; max-width: 18em;
}
.problem-statement em { font-style: normal; color: var(--orange); } /* 5.8:1 on --dark */
.problem-text p:not(.problem-statement) { max-width: var(--measure); margin: 0 0 12px; }

/* How it works: the app's Plan-tab timeline. */
.story { padding: 64px 0; }
.section-head {
  display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end;
  gap: 4px 16px; padding-bottom: 8px; border-bottom: 2px solid var(--ink);
}
.section-head h2 { margin: 0; font-size: clamp(2rem, 5vw, 2.75rem); }
.section-head .kicker { margin: 0; color: var(--muted); }
.story-grid { display: grid; gap: 48px; }
.story-steps { list-style: none; margin: 0; padding: 0; }
.step {
  display: grid; grid-template-columns: 56px 14px 1fr; gap: 12px;
  padding: 20px 0 28px; border-bottom: 1px solid var(--rule);
}
.step-time { display: flex; flex-direction: column; }
.step-time .kicker { font-size: 10px; color: var(--muted); margin: 0 0 2px; }
.step-clock { font-family: Anton, Impact, sans-serif; font-size: 22px; line-height: 1; font-variant-numeric: tabular-nums; }
.step-node {
  width: 14px; height: 14px; margin-top: 6px; border-radius: 50%;
  border: 2px solid var(--muted); background: var(--canvas);
}
.step-body h2 { font-size: clamp(1.4rem, 3.4vw, 1.75rem); margin: 10px 0 8px; }
.step-body p { margin: 0 0 16px; color: var(--muted); max-width: var(--measure); }
.step-shot { width: min(260px, 100%); }
/* States mirror the Plan tab. Never opacity: it drops text below AA. */
.step[data-state="done"] .step-tag  { background: var(--rule); color: var(--ink); }
.step[data-state="done"] .step-node { background: var(--muted); }
.step[data-state="done"] h2         { color: var(--muted); }
.step[data-state="open"]            { background: var(--tint); margin-inline: -12px; padding-inline: 12px; }
.step[data-state="open"] .step-tag  { background: var(--orange-cta); color: #fff; }
.step[data-state="open"] .step-node { background: var(--orange); border-color: var(--orange); }
.step[data-state="next"] .step-tag  { box-shadow: inset 0 0 0 1.5px var(--ink); color: var(--ink); }
.step[data-state="next"] .step-node { border-color: var(--ink); }
.step[data-state="upcoming"] .step-tag { box-shadow: inset 0 0 0 1.5px var(--muted); color: var(--muted); }
.story-phone { display: none; }

/* Built for youth basketball: a stat sheet (motif 2), bib chips (motif 3). */
.sheet-section { padding: 0 0 64px; }
.stat-sheet { width: 100%; border-collapse: collapse; }
.stat-sheet thead th {
  text-align: left; padding: 10px 0; border-bottom: 2px solid var(--ink);
  font-family: Saira, sans-serif; font-weight: 700; font-size: 11px;
  letter-spacing: 0.16em; text-transform: uppercase; color: var(--muted);
}
.stat-sheet td { padding: 14px 0; border-bottom: 1px solid var(--rule); vertical-align: middle; }
.stat-sheet td:first-child { width: 44px; }
.sheet-label { font-weight: 700; }
.sheet-note { display: block; color: var(--muted); font-size: 15px; }
@media (min-width: 720px) {
  .sheet-note { display: inline; }
  .sheet-note::before { content: '· '; }
}
.sheet-value { text-align: right; padding-left: 12px; white-space: nowrap; }
.sheet-number { font-family: Anton, Impact, sans-serif; font-size: 22px; }

/* Full time band. */
.band-fulltime { padding: 48px 0; }
.fulltime { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 20px 32px; }
.band-fulltime .kicker { color: var(--dark-kicker); }
.fulltime-line {
  margin: 0; font-family: Anton, Impact, sans-serif; text-transform: uppercase;
  font-size: clamp(2rem, 5vw, 3rem); line-height: 1; color: var(--dark-ink);
}
.band-fulltime .store-badges { margin: 0; }
```

- [ ] **Step 5: Run tests and the gate**

Run: `node --test scripts/ && ./scripts/check-third-party.sh`
Expected: PASS.

- [ ] **Step 6: Look at it**

Run: `npx --yes http-server sites/sidelinehero/dist -p 8080 -c-1` (in the background), then open `http://localhost:8080/` at desktop and 375px widths. Compare against `full-page-v2.html` / `mobile.html`. Without JS (Task 4 not done yet), every step shows its screenshot inline. That's expected.

- [ ] **Step 7: Commit**

```bash
git add sites/sidelinehero/src/index.html sites/sidelinehero/src/css/site.css scripts/site.test.mjs
git commit -m "sidelinehero: new homepage: fan hero, scoreboard band, Plan-tab story, stat sheet

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Story and clock behaviour

**Files:**
- Create: `sites/sidelinehero/src/js/site.js`
- Modify: `sites/sidelinehero/src/layout.html` (`<head>`: js class + module script)
- Modify: `sites/sidelinehero/src/css/site.css` (desktop sticky-phone rules)
- Modify: `docs/superpowers/specs/2026-10-02-sidelinehero-site-redesign-design.md` (two notes, see Step 6)
- Test: `scripts/site.test.mjs`

**Interfaces:**
- Consumes: the Task 3 hooks (`.step[data-state]`, `.step-tag`, `.step-shot`, `[data-story-phone]`, `[data-clock]`).
- Produces: `site.js` exports `STEP_LABELS`, `stepStates(active: number, count: number): string[]`, `formatClock(seconds: number): string`.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/site.test.mjs`:

```js
import { stepStates, formatClock, STEP_LABELS } from '../sites/sidelinehero/src/js/site.js';

test('stepStates matches the Plan tab: done, open, next, upcoming', () => {
  assert.deepEqual(stepStates(0, 4), ['open', 'next', 'upcoming', 'upcoming']);
  assert.deepEqual(stepStates(1, 4), ['done', 'open', 'next', 'upcoming']);
  assert.deepEqual(stepStates(3, 4), ['done', 'done', 'done', 'open']);
  assert.deepEqual(Object.keys(STEP_LABELS).sort(), ['done', 'next', 'open', 'upcoming']);
});

test('the static HTML states equal stepStates(1, 4), so no-JS and JS agree', async () => {
  const html = await read('index.html');
  const states = [...html.matchAll(/<li class="step" data-state="(\w+)">/g)].map((m) => m[1]);
  assert.deepEqual(states, stepStates(1, 4));
});

test('formatClock pads, floors and holds at zero', () => {
  assert.equal(formatClock(372), '06:12');
  assert.equal(formatClock(5.9), '00:05');
  assert.equal(formatClock(0), '00:00');
  assert.equal(formatClock(-3), '00:00');
  assert.equal(formatClock(Number.NaN), '00:00');
});

test('inline step screenshots are only hidden when JS is running', async () => {
  const css = await read('css/site.css');
  for (const m of css.matchAll(/([^{}]+)\{[^}]*display:\s*none[^}]*\}/g)) {
    if (m[1].includes('.step-shot')) assert.match(m[1].trim(), /^\.js\s/, `unscoped: ${m[1].trim()}`);
  }
});

test('layout loads the versioned module and sets the js class', async () => {
  const html = await read('index.html');
  assert.match(html, /<script type="module" src="\/js\/site\.js\?v=[0-9a-f]{8}"><\/script>/);
  assert.match(html, /<script>document\.documentElement\.classList\.add\('js'\)<\/script>/);
  await readFile('sites/sidelinehero/dist/js/site.js', 'utf8');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test scripts/site.test.mjs`
Expected: FAIL. `Cannot find module …/src/js/site.js`.

- [ ] **Step 3: Write `src/js/site.js`**

```js
// Homepage behaviour: the How it works timeline and the scoreboard clock.
// The page is complete without this file. The pure helpers are exported for
// scripts/site.test.mjs; the DOM wiring at the bottom only runs in a browser.

export const STEP_LABELS = { done: 'Done', open: 'Window open', next: 'Next', upcoming: 'Upcoming' };

/** States for `count` steps when step `active` is in view, as on the app's Plan tab. */
export function stepStates(active, count) {
  return Array.from({ length: count }, (_, i) =>
    i < active ? 'done' : i === active ? 'open' : i === active + 1 ? 'next' : 'upcoming');
}

/** 372 → "06:12". Clamped at zero, so the clock never goes negative or NaN. */
export function formatClock(seconds) {
  const s = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function initStory(reduceMotion) {
  const steps = [...document.querySelectorAll('.step')];
  const phone = document.querySelector('[data-story-phone]');
  if (!steps.length || !phone) return;
  let current = -1;
  let swap = 0;

  function show(index) {
    if (index === current) return;
    current = index;
    stepStates(index, steps.length).forEach((state, i) => {
      steps[i].dataset.state = state;
      steps[i].querySelector('.step-tag').textContent = STEP_LABELS[state];
    });
    const src = steps[index].querySelector('.step-shot').getAttribute('src');
    if (phone.getAttribute('src') === src) return;
    clearTimeout(swap);
    if (reduceMotion) { phone.src = src; return; }
    // A timeout, not transitionend: the phone is display:none on mobile, where
    // no transition ever fires.
    phone.classList.add('is-fading');
    swap = setTimeout(() => { phone.src = src; phone.classList.remove('is-fading'); }, 150);
  }

  // A thin band across the middle of the viewport: the step crossing it is "open".
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) show(steps.indexOf(e.target));
  }, { rootMargin: '-45% 0px -45% 0px' });
  steps.forEach((s) => io.observe(s));
}

function initClock(reduceMotion) {
  const el = document.querySelector('[data-clock]');
  if (!el || reduceMotion) return;
  let left = Number(el.dataset.clock);
  let timer = 0;
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !timer && left > 0) {
      timer = setInterval(() => {
        left -= 1;
        el.textContent = formatClock(left);
        if (left <= 0) clearInterval(timer); // holds at 00:00; timer stays set so it never restarts
      }, 1000);
    } else if (!e.isIntersecting && timer && left > 0) {
      clearInterval(timer);
      timer = 0;
    }
  }).observe(el);
}

if (typeof document !== 'undefined' && 'IntersectionObserver' in window) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  initStory(reduceMotion);
  initClock(reduceMotion);
}
```

- [ ] **Step 4: Layout `<head>`**

In `src/layout.html`, after the stylesheet `<link>`, add:

```html
<script>document.documentElement.classList.add('js')</script>
<script type="module" src="/js/site.js?v={{v}}"></script>
```

The inline script sets `.js` before first paint, so desktop never flashes the inline screenshots. If the module then fails, the sticky phone still shows shot-3 and every step stays readable.

- [ ] **Step 5: Desktop sticky-phone CSS**

Append to `src/css/site.css`, after the `.story-phone { display: none; }` line's section (still before the badge block):

```css
@media (min-width: 720px) {
  .js .story-grid { grid-template-columns: 1fr clamp(200px, 24vw, 260px); }
  .js .story-phone { display: block; }
  .js .story-phone .phone { position: sticky; top: calc(var(--header-h) + 32px); transition: opacity 0.15s; }
  .js .story-phone .phone.is-fading { opacity: 0; }
  .js .step-shot { display: none; }
  .js .step { min-height: 50vh; }
}
@media (prefers-reduced-motion: reduce) {
  .story-phone .phone { transition: none; }
}
```

- [ ] **Step 6: Record two decisions in the spec**

In the spec's "Behaviour" section, item 4 "No JavaScript", replace "On desktop the sticky phone shows shot-3, and every step's inline screenshot stays available through the mobile layout." with: "Without JavaScript, desktop shows each step's own screenshot inline (the mobile layout), because the sticky phone and the hiding of inline screenshots are both scoped to a `.js` class that an inline head script sets." In "Responsive behaviour", add under Header: "Below 420px the How it works link is hidden as well, so the header fits at 360px."

- [ ] **Step 7: Run tests and the gate**

Run: `node --test scripts/ && ./scripts/check-third-party.sh`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add sites/sidelinehero/src/js sites/sidelinehero/src/layout.html sites/sidelinehero/src/css/site.css scripts/site.test.mjs docs/superpowers/specs
git commit -m "sidelinehero: Plan-tab story states, sticky phone swap, ticking clock

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Browser verification and Tom's review

**Files:** whatever the checks below expose. Fix in place, rerun `node --test scripts/`, commit each fix.

- [ ] **Step 1: Serve the build**

```bash
node build.mjs sidelinehero
npx --yes http-server sites/sidelinehero/dist -p 8080 -a 0.0.0.0 -c-1
```

Run it in the background. `-c-1` disables caching so every reload is fresh.

- [ ] **Step 2: Check each width in Chrome** (claude-in-chrome; resize the window or use device emulation)

At **360, 375, 768, 1280, 1920** px, on `/`, `/faq`, `/privacy`, `/terms`, `/support`, `/nope` (the 404):
- No horizontal scroll: `document.documentElement.scrollWidth <= innerWidth` via javascript_tool.
- The header is on one line. The tag shows only at ≥720px, "How it works" only at ≥420px.
- At 1920 the content stops at 1120px and the bands run full width.
- Homepage: the fan isn't clipped at the sides, and the score bug doesn't cover the centre phone's clock area badly.
- Desktop: scrolling the story changes the tags in order, and the phone crossfades to each step's screenshot.
- The clock ticks down from 06:12 while visible and pauses when scrolled away.
- Clicking "How it works" lands with the heading below the sticky header. The same for an FAQ contents link.

- [ ] **Step 3: Reduced motion and no JS**

- DevTools → Rendering → emulate `prefers-reduced-motion: reduce`, then reload. The clock stays at 06:12, and the phone swaps with no fade. States still change.
- Disable JavaScript and reload. Every step shows its screenshot inline, there's no sticky phone, and nothing is missing.

- [ ] **Step 4: Keyboard**

Tab from the top of each page through to the footer. Every link shows the orange focus ring, and the order is header → content → footer.

- [ ] **Step 5: Tom reviews on his own devices**

Find the Mac's LAN IP (`ipconfig getifaddr en0`). Send Tom `http://<ip>:8080/` to open on his phone and desktop. **Wait for his explicit approval.** Make any requested changes, commit, and repeat this step.

---

### Task 6: Deploy (only after Tom approves in Task 5)

- [ ] **Step 1: Final local gate**

```bash
git status --short          # clean
node --test scripts/
node build.mjs sidelinehero && ./scripts/check-third-party.sh
```

- [ ] **Step 2: Fast-forward main and push**

`sidelinehero-redesign` descends from `main` (`d2119a1`) through the freemium commits, so this is a fast-forward:

```bash
git fetch origin
git switch main && git merge --ff-only origin/main
git merge --ff-only sidelinehero-redesign
git push origin main
```

If `--ff-only` refuses, stop and report it. Don't create a merge commit without asking.

- [ ] **Step 3: Watch the deploy**

```bash
gh run list --workflow deploy.yml --limit 1
gh run watch <id> --exit-status
```

Expected: Tests, build, third-party check, sync, invalidate and smoke all green.

- [ ] **Step 4: Check the live site**

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://sidelinehero.tommamakesthings.com/terms   # 200
curl -s https://sidelinehero.tommamakesthings.com/ | grep -c 'how-it-works'               # ≥1
```

Open `/`, `/terms` and `/privacy` live on desktop and at 375px.

- [ ] **Step 5: Tidy up**

`sidelinehero-freemium` is now fully contained in `main`. Delete the local branch with `git branch -d sidelinehero-freemium` (`-d` refuses if anything isn't merged). Update the memory file `project_sideline_hero_website.md`: redesign live, freemium site text live, Task 9 done.
