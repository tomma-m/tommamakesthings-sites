import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseFrontMatter } from './pages.mjs';

const page = (fm, body = 'Hello.') => `---\n${fm}\n---\n${body}`;

test('parseFrontMatter reads fields and body, defaulting campaign to the file name', () => {
  const { meta, body } = parseFrontMatter(
    page('title: Ten player rotation · Sideline Hero\ndescription: A chart.\npath: /rotation-charts/10-players\nkicker: Rotation charts\nchartPlayers: 10', 'Lede.\n\n{{chart}}\n'),
    'pages/rotation-charts/10-players.md');
  assert.equal(meta.title, 'Ten player rotation · Sideline Hero');
  assert.equal(meta.path, '/rotation-charts/10-players');
  assert.equal(meta.kicker, 'Rotation charts');
  assert.equal(meta.chartPlayers, 10);
  assert.equal(meta.campaign, '10-players');
  assert.equal(body, 'Lede.\n\n{{chart}}\n');
});

test('parseFrontMatter keeps colons inside values', () => {
  const { meta } = parseFrontMatter(page('title: Subs: a guide\ndescription: x\npath: /guides/x'), 'x.md');
  assert.equal(meta.title, 'Subs: a guide');
});

test('parseFrontMatter refuses bad pages, naming the file', () => {
  const bad = (fm) => () => parseFrontMatter(page(fm), 'pages/bad.md');
  assert.throws(() => parseFrontMatter('no front matter', 'pages/bad.md'), /pages\/bad\.md.*front matter/);
  assert.throws(bad('title: t\ndescription: d'), /pages\/bad\.md.*path/);
  assert.throws(bad('title: t\ndescription: d\npath: guides/x'), /path/);
  assert.throws(bad('description: d\npath: /x'), /title/);
  assert.throws(bad('title: t\npath: /x'), /description/);
  assert.throws(bad('title: t\ndescription: d\npath: /x\ncampaign: Bad Campaign!'), /campaign/);
  assert.throws(bad('title: t\ndescription: d\npath: /x\nchartPlayers: 13'), /chartPlayers/);
  assert.throws(bad('title: t\ndescription: d\npath: /x\nchartPlayers: 5'), /chartPlayers/);
  assert.throws(bad('title: t\ndescription: d\npath: /x\nmystery: 1'), /mystery/);
});

// The deploy gate allows tagged store links for any page's campaign, but only
// on the exact store host, path, app id and provider token.
async function gate(href) {
  const dist = await mkdtemp(join(tmpdir(), 'dist-'));
  await writeFile(join(dist, 'index.html'), `<a href="${href}">x</a>`);
  try {
    execFileSync('./scripts/check-third-party.sh', [dist], { stdio: 'pipe' });
    return 'pass';
  } catch {
    return 'fail';
  }
}

test('third-party gate allows tagged store links for any campaign, nothing looser', async () => {
  const apple = (ct, pt = '129245947') => `https://apps.apple.com/app/apple-store/id6796588008?pt=${pt}&amp;ct=site-${ct}&amp;mt=8`;
  const play = (c, id = 'app.sidelinehero.coach') => `https://play.google.com/store/apps/details?id=${id}&amp;utm_source=sidelinehero.app&amp;utm_medium=website&amp;utm_campaign=${c}`;
  assert.equal(await gate(apple('rotation-charts-8-players')), 'pass');
  assert.equal(await gate(play('rotation-charts-8-players')), 'pass');
  assert.equal(await gate(apple('hero', '999')), 'fail');
  assert.equal(await gate(play('hero', 'com.evil.app')), 'fail');
  assert.equal(await gate(apple('Bad_Campaign')), 'fail');
  assert.equal(await gate('https://evil.example/x.js'), 'fail');
});
