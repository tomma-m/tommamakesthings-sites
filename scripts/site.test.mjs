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
// The stylesheet's name carries the asset hash, so look it up.
const readCss = async () => read(`css/${(await readdir(join(DIST, 'css'))).find((n) => n.startsWith('site.'))}`);

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

test('CSS and JS ship under hashed file names (the CDN ignores query strings)', async () => {
  const html = await read('index.html');
  const v = html.match(/href="\/css\/site\.([0-9a-f]{8})\.css"/)?.[1];
  assert.ok(v, 'index.html links /css/site.<8 hex>.css');
  assert.match(html, new RegExp(`src="/js/site\\.${v}\\.js"`));
  assert.match(await read(`css/site.${v}.css`), new RegExp(`@import url\\('tokens\\.${v}\\.css'\\)`));
  await read(`css/tokens.${v}.css`);
  await read(`js/site.${v}.js`);
  for (const [dir, names] of [['css', await readdir(join(DIST, 'css'))], ['js', await readdir(join(DIST, 'js'))]]) {
    for (const n of names) assert.match(n, new RegExp(`\\.${v}\\.(css|js)$`), `${dir}/${n} is not hashed`);
  }
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

const PAGES = ['index.html', 'faq/index.html', 'releases/index.html', 'privacy/index.html', 'terms/index.html', 'support/index.html', '404.html'];

test('every page has the new header and footer', async () => {
  for (const p of PAGES) {
    const html = await read(p);
    assert.match(html, /<header class="site-header">/, p);
    assert.match(html, /<main id="main">/, p);
    for (const href of ['/privacy', '/terms', '/faq', '/releases', '/support']) {
      assert.match(html, new RegExp(`<footer class="site-footer">[\\s\\S]*href="${href}"`), `${p} footer → ${href}`);
    }
    assert.match(html, /<footer class="site-footer">[\s\S]*href="https:\/\/www\.instagram\.com\/sidelinehero\/"[^>]*>Instagram<\/a>/, `${p} footer → Instagram`);
    assert.match(html, /href="\/#how-it-works"/, `${p} header links How it works`);
    assert.match(html, /<nav class="site-nav"[^>]*>[\s\S]*?href="\/rotation-charts">Rotation charts<\/a>[\s\S]*?<\/nav>/, `${p} header links Rotation charts`);
    assert.match(html, /<footer class="site-footer">[\s\S]*href="\/rotation-charts"/, `${p} footer → /rotation-charts`);
    assert.match(html, /<footer class="site-footer">[\s\S]*href="\/guides"/, `${p} footer → /guides`);
    assert.match(html, /<nav class="site-nav"[^>]*>[\s\S]*?href="\/releases">What’s new<\/a>[\s\S]*?<\/nav>/, `${p} header links What’s new`);
    assert.ok(!/class="(wrap|card)"/.test(html), `${p} still uses .wrap or .card`);
  }
});

test('inner pages sit in the container column, the homepage does not', async () => {
  for (const p of PAGES.filter((p) => p !== 'index.html')) {
    assert.match(await read(p), /<main id="main"><div class="container page">/, p);
  }
  assert.doesNotMatch(await read('index.html'), /<div class="container page">/);
});

test('FAQ answers are closed accordions inside their two sections, no contents list', async () => {
  const html = await read('faq/index.html');
  assert.doesNotMatch(html, /faq-contents/);
  const groups = html.split(/<h2>/).slice(1);
  assert.deepEqual(groups.map((g) => g.slice(0, g.indexOf('</h2>'))), ['Using the app', 'Before you download']);
  for (const g of groups) {
    const rows = [...g.matchAll(/<details class="faq-topic" id="([a-z0-9-]+)">\s*<summary><h3>[^<]+<\/h3><\/summary>/g)];
    assert.ok(rows.length > 0, 'section has accordion rows');
    assert.equal(rows.length, (g.match(/<details/g) || []).length, 'every topic is a details row');
  }
  assert.doesNotMatch(html, /<details[^>]*\sopen/, 'all start closed');
  for (const id of ['getting-started', 'is-it-free']) assert.match(html, new RegExp(`<details class="faq-topic" id="${id}">`));
});

test('What’s new lists each release from releases-app.json, newest open, rest closed', async () => {
  const html = await read('releases/index.html');
  const { releases } = JSON.parse(await readFile('sites/sidelinehero/src/releases-app.json', 'utf8'));
  assert.match(html, /<h1>What’s new<\/h1>/);
  assert.match(html, /<title>What’s new · Sideline Hero<\/title>/);
  const rows = [...html.matchAll(/<details class="faq-topic release" id="v[0-9-]+"( open)?>/g)];
  assert.equal(rows.length, releases.length, 'one row per release');
  assert.deepEqual(rows.map((r) => Boolean(r[1])), releases.map((_, i) => i === 0), 'only the first starts open');
  for (const r of releases) assert.match(html, new RegExp(`<h3>Version ${r.version.replace(/\./g, '\\.')}</h3>`));
});

test('anchors land below the sticky header', async () => {
  const css = await readCss();
  assert.match(css, /html\s*\{[^}]*scroll-padding-top:\s*calc\(var\(--header-h\)/);
});

test('the How it works header link hides below 420px', async () => {
  const css = await readCss();
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
  const tokens = await read(`css/${(await readdir(join(DIST, 'css'))).find((n) => n.startsWith('tokens.'))}`);
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

const PREMIUM = "No ads, plus new premium features as they're released.";

test('homepage keeps the existing copy word for word', async () => {
  const html = flat(await read('index.html'));
  for (const s of [
    'Coach the game,<br>not the subs.',
    'Fair rotations, planned before tip-off. The app guides you through every sub during the game.',
    'Who\'s been on longest? Who hasn\'t had their fair share of court time?',
    'Most coaches juggle this on a clipboard, lose track halfway through the second quarter, and spend the rest of the game with a nagging feeling that someone\'s been short-changed.',
    'Pick your starting five, or let Smart Pick choose them from skill level and recent playing time, then tell Sideline Hero how you want rotations to work. It builds a full substitution plan, balancing playing time across the whole roster. You choose the priority: equal time for everyone, more minutes for developing players, or your strongest lineup when it counts.',
    'The game clock ticks alongside the action. When a substitution window approaches, the app alerts you before the moment, not after. Planned subs are queued and ready in two taps, and the sub strip can show who\'s coming off and who\'s going on. Need an unplanned change? Manual sub puts the players who need court time most at the top of the bench. The screen stays on while the game is open, so your phone won\'t sleep mid-quarter.',
    'Tap points, fouls and opponent scores as they happen. Court time is logged to the second, so you never have to wonder who played how long.',
    'Every game adds to a running record. Browse your history to see how the season is going, or open any player to track their development over time.',
  ]) assert.ok(html.includes(s), `missing: ${s.slice(0, 50)}…`);
});

test('homepage has the approved new copy, and no em or en dashes', async () => {
  const html = flat(await read('index.html'));
  for (const s of ['Out now on iPhone and Android', 'How a game goes', 'Auto-plan · equal minutes',
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
  assert.deepEqual(steps.map((m) => m[2].match(/class="phone step-shot" src="\/img\/(shot-[a-z]+)(?:\.[0-9a-f]{8})?\.png"/)?.[1]),
    ['shot-plan', 'shot-live', 'shot-score', 'shot-player']);
  assert.deepEqual(steps.map((m) => m[2].match(/class="tag step-tag"[^>]*>([^<]+)</)?.[1]),
    ['Done', 'Window open', 'Next', 'Upcoming']);
  assert.match(html, /id="how-it-works"/);
  assert.match(html, /<img class="phone" data-story-phone src="\/img\/shot-live(?:\.[0-9a-f]{8})?\.png"/);
  assert.match(html, /data-clock="372">06:12</);
});

test('every image has alt, width and height; below-the-fold images are lazy', async () => {
  const html = await read('index.html');
  const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(imgs.length >= 12, `only ${imgs.length} images`);
  for (const img of imgs) {
    assert.match(img, /\salt="[^"]*"/, img);
    if (/duo-unfolded/.test(img)) assert.match(img, /\swidth="1400" height="985"/, img);
    else if (/duo-folded/.test(img)) assert.match(img, /\swidth="560" height="815"/, img);
    else if (!/badge-|brand-icon/.test(img)) assert.match(img, /\swidth="840" height="1818"/, img);
  }
  for (const img of imgs.filter((i) => /step-shot|data-story-phone|duo-device/.test(i))) {
    assert.match(img, /loading="lazy"/, img);
  }
});

test('the iPhone Duo section sits between How a game goes and the stat sheet, with both screens', async () => {
  const html = await read('index.html');
  const story = html.indexOf('id="how-it-works"');
  const duo = html.indexOf('<section class="duo" id="duo">');
  const sheet = html.indexOf('class="sheet-section"');
  assert.ok(story > -1 && duo > story && sheet > duo, 'order: story, duo, sheet');
  const section = html.slice(duo, sheet);
  assert.match(section, /<h2>Made for iPhone Duo<\/h2>/);
  assert.match(section, /src="\/img\/duo-unfolded\.[0-9a-f]{8}\.png"/);
  assert.match(section, /src="\/img\/duo-folded\.[0-9a-f]{8}\.png"/);
  assert.equal([...section.matchAll(/<dt>/g)].length, 4);
  // Voice rule: no em dashes in visitor copy.
  assert.doesNotMatch(section, /\u2014/);
});

test('both stores link to the live listings, tagged per spot; no Coming soon left', async () => {
  const html = await read('index.html');
  const badges = [...html.matchAll(/<img[^>]*class="badge-[^"]*"[^>]*>/g)];
  assert.equal(badges.length, 4);
  // One tag per spot, so the store dashboards say which badge was tapped.
  for (const spot of ['hero', 'fulltime']) {
    const apple = `https://apps.apple.com/app/apple-store/id6796588008?pt=129245947&amp;ct=site-${spot}&amp;mt=8`;
    const play = `https://play.google.com/store/apps/details?id=app.sidelinehero.coach&amp;utm_source=sidelinehero.app&amp;utm_medium=website&amp;utm_campaign=${spot}`;
    assert.ok(html.includes(`<a class="badge-link" href="${apple}" target="_blank" rel="noopener"><img class="badge-app-store"`), `App Store badge, ${spot}`);
    assert.ok(html.includes(`<a class="badge-link" href="${play}" target="_blank" rel="noopener"><img class="badge-google-play"`), `Google Play badge, ${spot}`);
  }
  // No untagged badge left behind.
  assert.doesNotMatch(html, /class="badge-link" href="https:\/\/apps\.apple\.com\/app\/id/);
  assert.doesNotMatch(html, /class="badge-link" href="[^"]*details\?id=app\.sidelinehero\.coach"/);
  assert.doesNotMatch(html, /badge-tip|coming soon/i);
});

test('every page uses the app icon as favicon and in the header', async () => {
  for (const p of PAGES) {
    const html = await read(p);
    assert.match(html, /<link rel="icon" type="image\/png" sizes="32x32" href="\/img\/favicon-32\.png">/, p);
    assert.match(html, /<link rel="apple-touch-icon" href="\/img\/icon-180\.png">/, p);
    assert.match(html, /<a class="brand" href="\/" aria-label="Sideline Hero home">\s*<img class="brand-icon" src="\/img\/icon-64\.png"/, p);
  }
});

import { stepStates, formatClock, STEP_LABELS, phoneSwapper, openLinkedAnswer, triggerMargin } from '../sites/sidelinehero/src/js/site.js';

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
  const css = await readCss();
  for (const m of css.matchAll(/([^{}]+)\{[^}]*display:\s*none[^}]*\}/g)) {
    if (m[1].includes('.step-shot')) assert.match(m[1].trim(), /^\.js\s/, `unscoped: ${m[1].trim()}`);
  }
});

test('layout loads the hashed module, sets the js class only if modules can run, and clears it if the load fails', async () => {
  const html = await read('index.html');
  assert.match(html, /<script>if\('noModule' in HTMLScriptElement\.prototype&&'IntersectionObserver' in window\)document\.documentElement\.classList\.add\('js'\)<\/script>/);
  assert.match(html, /<script type="module" src="\/js\/site\.[0-9a-f]{8}\.js" onerror="document\.documentElement\.classList\.remove\('js'\)"><\/script>/);
});

test('long URLs and email addresses in page text can wrap (no sideways scroll at 360px)', async () => {
  const css = await readCss();
  assert.match(css, /\.page a\s*\{[^}]*overflow-wrap:\s*anywhere/);
});

// A fake <img> and fake timers, so the swap can be driven step by step.
function fakePhone(src) {
  const classes = new Set();
  return {
    src, getAttribute: function () { return this.src; },
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), has: (c) => classes.has(c) },
  };
}
function fakeTimers() {
  const q = new Map(); let n = 0;
  return {
    setTimeout: (fn) => { q.set(++n, fn); return n; },
    clearTimeout: (id) => q.delete(id),
    flush: () => { for (const [id, fn] of q) { q.delete(id); fn(); } },
  };
}

test('phone swap: two quick step changes end on the second screenshot', () => {
  const phone = fakePhone('/img/shot-3.png');
  const t = fakeTimers();
  const swap = phoneSwapper(phone, false, t);
  swap('/img/shot-2.png');   // step 0 crosses the middle
  swap('/img/shot-3.png');   // step 1 crosses before the 150ms fade ends
  t.flush();
  assert.equal(phone.src, '/img/shot-3.png');
  assert.equal(phone.classList.has('is-fading'), false);
});

test('phone swap: reduced motion swaps at once, no fade', () => {
  const phone = fakePhone('/img/shot-3.png');
  const swap = phoneSwapper(phone, true, fakeTimers());
  swap('/img/shot-5.png');
  assert.equal(phone.src, '/img/shot-5.png');
  assert.equal(phone.classList.has('is-fading'), false);
});

test('a link to one FAQ answer opens it', () => {
  const answer = { tagName: 'DETAILS', open: false, scrolled: false, scrollIntoView() { this.scrolled = true; } };
  const doc = { getElementById: (id) => (id === 'is-it-free' ? answer : null) };
  openLinkedAnswer(doc, '#is-it-free');
  assert.equal(answer.open, true);
  assert.equal(answer.scrolled, true);
});

test('openLinkedAnswer ignores empty hashes, unknown ids and non-accordion targets', () => {
  const section = { tagName: 'SECTION', open: false, scrollIntoView() { throw new Error('should not scroll'); } };
  const doc = { getElementById: (id) => (id === 'how-it-works' ? section : null) };
  for (const h of ['', '#', '#nope', '#how-it-works']) openLinkedAnswer(doc, h);
  assert.equal(section.open, false);
});

test('the step trigger is a 1px line just under the sticky heading', () => {
  assert.equal(triggerMargin(130, 900), '-130px 0px -769px 0px');
  assert.equal(triggerMargin(58, 812), '-58px 0px -753px 0px');
  assert.equal(triggerMargin(900, 800), '-900px 0px 0px 0px', 'never a negative bottom inset');
});

test('desktop: the How a game goes heading sticks under the site header, the phone below it', async () => {
  const css = await readCss();
  const desktop = css.slice(css.indexOf('.js .story-grid'));
  assert.match(desktop, /\.js \.story \.section-head\s*\{[^}]*position:\s*sticky;[^}]*top:\s*var\(--header-h\)/);
  assert.match(desktop, /\.js \.story-phone \.phone\s*\{[^}]*top:\s*calc\(var\(--header-h\) \+ var\(--story-head-h\)/);
});

test('desktop: the last step is as tall as the pinned phone, so it reaches the top before the section leaves', async () => {
  const css = await readCss();
  assert.match(css, /\.js \.story-grid\s*\{[^}]*grid-template-columns:\s*1fr var\(--phone-w\)/);
  assert.match(css, /\.js \.step:last-child\s*\{[^}]*min-height:\s*calc\(var\(--phone-w\) \* 2\.164 \+ 24px\)/);
  assert.doesNotMatch(css, /\.js \.story-steps\s*\{[^}]*padding-bottom/, 'fixed padding after step 4 is gone');
});

// AdMob's app-ads.txt: authorises our publisher to sell ads in the app. It
// must sit at the site root, exactly one record, Google's fixed TAG-ID.
test('app-ads.txt is published at the site root for our AdMob publisher', async () => {
  const txt = await read('app-ads.txt');
  assert.equal(txt.trim(), 'google.com, pub-2727987591732368, DIRECT, f08c47fec0942fa0');
});

// Four header links (How it works, What's new, FAQ, Support) overflow a
// 320px phone. How it works already drops below 420px; below 360px the
// wordmark goes too and the icon alone links home.
test('very narrow phones: the header wordmark hides below 360px so the menu fits', async () => {
  const css = await readCss();
  assert.match(css, /@media \(max-width: 359px\) \{\s*\.brand-name \{ display: none; \}\s*\}/);
  assert.match(await read('index.html'), /<a class="brand" href="\/" aria-label="Sideline Hero home">/);
});

// Search and sharing (phase 1 SEO, 2026-11-17).
const ORIGIN = 'https://sidelinehero.app';
const INDEXABLE = {
  'index.html': '/', 'faq/index.html': '/faq', 'releases/index.html': '/releases',
  'privacy/index.html': '/privacy', 'terms/index.html': '/terms', 'support/index.html': '/support',
};

test('every indexable page names its own canonical URL and share card', async () => {
  const card = (await readdir(join(DIST, 'img'))).filter((n) => /^og-card\.[0-9a-f]{8}\.png$/.test(n));
  assert.equal(card.length, 1, 'exactly one hashed share card ships');
  for (const [file, path] of Object.entries(INDEXABLE)) {
    const html = await read(file);
    assert.match(html, new RegExp(`<link rel="canonical" href="${ORIGIN}${path}">`), file);
    assert.match(html, new RegExp(`<meta property="og:url" content="${ORIGIN}${path}">`), file);
    assert.match(html, new RegExp(`<meta property="og:image" content="${ORIGIN}/img/${card[0]}">`), file);
    assert.match(html, /<meta name="twitter:card" content="summary_large_image">/, file);
    const title = html.match(/<title>([^<]*)<\/title>/)[1];
    assert.match(html, new RegExp(`<meta property="og:title" content="${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">`), `${file} og:title matches <title>`);
    assert.doesNotMatch(html, /name="robots"/, `${file} must not be noindex`);
  }
});

test('the 404 page is noindex, has no canonical, and is not in the sitemap', async () => {
  const html = await read('404.html');
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.doesNotMatch(html, /rel="canonical"/);
  assert.doesNotMatch(await read('sitemap.xml'), /404/);
});

test('sitemap.xml lists exactly the indexable pages; robots.txt points at it', async () => {
  const locs = [...(await read('sitemap.xml')).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  for (const p of Object.values(INDEXABLE)) assert.ok(locs.includes(`${ORIGIN}${p}`), `${p} in sitemap`);
  assert.equal(new Set(locs).size, locs.length, 'no duplicates');
  assert.ok(locs.every((l) => l.startsWith(`${ORIGIN}/`)), 'every URL on the canonical host');
  const robots = await read('robots.txt');
  assert.match(robots, /^User-agent: \*$/m);
  assert.doesNotMatch(robots, /Disallow: \/$/m, 'robots.txt must not block the site');
  assert.match(robots, new RegExp(`^Sitemap: ${ORIGIN}/sitemap.xml$`, 'm'));
});

test('structured data: home only, valid JSON, both store links, no rating', async () => {
  const html = await read('index.html');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.equal(blocks.length, 1);
  const data = JSON.parse(blocks[0][1]);
  const app = data['@graph'].find((n) => n['@type'] === 'MobileApplication');
  const site = data['@graph'].find((n) => n['@type'] === 'WebSite');
  assert.equal(site.name, 'Sideline Hero');
  assert.deepEqual(app.sameAs.sort(), [
    'https://apps.apple.com/app/id6796588008',
    'https://play.google.com/store/apps/details?id=app.sidelinehero.coach',
  ]);
  assert.equal(app.aggregateRating, undefined, 'never claim a rating the app does not have');
  for (const file of Object.keys(INDEXABLE).filter((f) => f !== 'index.html')) {
    assert.doesNotMatch(await read(file), /application\/ld\+json/, file);
  }
});

// Rotation chart pages (SEO phase 2, Task 4).
const ROSTERS = [6, 7, 8, 9, 10, 11, 12];
const OTHER_FORMATS = ['h16', 'h20', 'q6', 'q10', 'q12'];
const tagged = (campaign) => [
  `https://apps.apple.com/app/apple-store/id6796588008?pt=129245947&amp;ct=site-${campaign}&amp;mt=8`,
  `https://play.google.com/store/apps/details?id=app.sidelinehero.coach&amp;utm_source=sidelinehero.app&amp;utm_medium=website&amp;utm_campaign=${campaign}`,
];

test('each roster page has its 8-minute-quarter chart, the other formats and its own app block', async () => {
  for (const n of ROSTERS) {
    const file = `rotation-charts/${n}-players/index.html`;
    const html = await read(file);
    assert.equal((html.match(/<table class="rotation-chart">/g) || []).length, 1, file);
    assert.equal((html.match(/<tr class="player">/g) || []).length, n, `${file} has ${n} player rows`);
    assert.match(html, new RegExp(`<caption>${n} players · 4 × 8-min quarters</caption>`), file);
    for (const f of OTHER_FORMATS) {
      assert.ok(html.includes(`href="/rotation-chart-maker?players=${n}&amp;format=${f}"`), `${file} links ${f}`);
    }
    for (const href of tagged(`rotation-charts-${n}-players`)) assert.ok(html.includes(`href="${href}"`), `${file} app block tag`);
    assert.match(html, new RegExp(`<title>${n} player basketball rotation · Sideline Hero</title>`), file);
    assert.match(html, /<h1>/, `${file} has an H1`);
    assert.doesNotMatch(html, /—/, `${file} has no em dash`);
  }
});

test('the rotation chart hub links every roster page and the chart maker', async () => {
  const html = await read('rotation-charts/index.html');
  for (const n of ROSTERS) assert.ok(html.includes(`href="/rotation-charts/${n}-players"`), `hub → ${n}`);
  assert.ok(html.includes('href="/rotation-chart-maker"'), 'hub → maker');
  for (const href of tagged('rotation-charts')) assert.ok(html.includes(`href="${href}"`), 'hub app block tag');
  assert.doesNotMatch(html, /—/);
});

test('the hub and every roster page are in the sitemap', async () => {
  const sitemap = await read('sitemap.xml');
  assert.ok(sitemap.includes(`<loc>${ORIGIN}/rotation-charts</loc>`));
  for (const n of ROSTERS) assert.ok(sitemap.includes(`<loc>${ORIGIN}/rotation-charts/${n}-players</loc>`), `${n} in sitemap`);
});

// Rotation chart maker (SEO phase 2, Task 5).
test('the chart maker embeds valid chart data and works without JavaScript', async () => {
  const html = await read('rotation-chart-maker/index.html');
  const data = html.match(/<script type="application\/json" id="chart-data">([\s\S]*?)<\/script>/);
  assert.ok(data, 'chart data embedded');
  const { validateCharts } = await import('./charts.mjs');
  assert.equal(validateCharts(JSON.parse(data[1]), 'embedded').charts.length, 42);
  assert.match(html, /<caption>10 players · 4 × 8-min quarters<\/caption>/, 'default chart rendered for no-JS');
  assert.equal((html.match(/<tr class="player">/g) || []).length, 10);
  assert.match(html, /<form[^>]*id="chart-maker"[^>]*hidden/, 'form hidden until the script runs');
  assert.match(html, new RegExp(`<link rel="canonical" href="${ORIGIN}/rotation-chart-maker">`));
  assert.ok((await read('sitemap.xml')).includes(`<loc>${ORIGIN}/rotation-chart-maker</loc>`));
  for (const href of tagged('rotation-chart-maker')) assert.ok(html.includes(`href="${href}"`), 'app block tag');
  const v = html.match(/src="\/js\/chart-maker\.([0-9a-f]{8})\.js"/)?.[1];
  assert.ok(v, 'loads the hashed chart-maker module');
  assert.doesNotMatch(html, /—/);
});

test('the chart maker script keeps nothing and sends nothing', async () => {
  const js = (await readdir(join(DIST, 'js'))).filter((n) => /^chart-(maker|render)\./.test(n));
  assert.equal(js.length, 2);
  for (const n of js) {
    const src = await read(`js/${n}`);
    for (const banned of ['localStorage', 'sessionStorage', 'indexedDB', 'fetch(', 'XMLHttpRequest', 'document.cookie', 'sendBeacon', 'WebSocket']) {
      assert.ok(!src.includes(banned), `${n} uses ${banned}`);
    }
  }
  const maker = await read(`js/${js.find((n) => n.startsWith('chart-maker.'))}`);
  assert.match(maker, /from '\.\/chart-render\.[0-9a-f]{8}\.js'/, 'imports the hashed renderer');
});

test('the chart scroll box contains its hidden labels (else wide charts push phone pages sideways)', async () => {
  assert.match(await readCss(), /\.chart-scroll \{[^}]*position: relative/);
});

// Guides (SEO phase 2, Task 6).
const GUIDES = {
  'fair-subs-youth-basketball': 'How to sub fairly in youth basketball',
  'equal-playing-time': 'Equal playing time in rec league basketball',
  'big-roster-rotation': 'Running a rotation with 10 or more players',
};

test('the guides hub lists exactly the three guides', async () => {
  const html = await read('guides/index.html');
  const links = [...html.matchAll(/href="\/guides\/([a-z0-9-]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(links)].sort(), Object.keys(GUIDES).sort());
  for (const href of tagged('guides')) assert.ok(html.includes(`href="${href}"`), 'hub app block');
  assert.doesNotMatch(html, /—/);
});

test('each guide is canonical, tagged, in the sitemap and links the charts', async () => {
  const sitemap = await read('sitemap.xml');
  for (const [slug, title] of Object.entries(GUIDES)) {
    const file = `guides/${slug}/index.html`;
    const html = await read(file);
    assert.match(html, new RegExp(`<link rel="canonical" href="${ORIGIN}/guides/${slug}">`), file);
    assert.ok(html.includes(`<title>${title} · Sideline Hero</title>`), `${file} title`);
    for (const href of tagged(slug)) assert.ok(html.includes(`href="${href}"`), `${file} app block`);
    assert.ok(html.includes('href="/rotation-chart-maker'), `${file} links the maker`);
    assert.match(html, /href="\/rotation-charts\//, `${file} links a roster page`);
    assert.doesNotMatch(html, /—/, `${file} has no em dash`);
    assert.ok(sitemap.includes(`<loc>${ORIGIN}/guides/${slug}</loc>`), `${slug} in sitemap`);
  }
});
