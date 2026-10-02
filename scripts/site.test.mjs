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
