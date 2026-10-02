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
