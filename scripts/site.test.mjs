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
