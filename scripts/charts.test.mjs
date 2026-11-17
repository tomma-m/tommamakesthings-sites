import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseChartsJson, validateCharts, formatCharts } from './charts.mjs';
import {
  FORMATS, findChart, playerLabels, periodClock, renderChartTable,
} from '../sites/sidelinehero/src/js/chart-render.js';

const SYNCED = 'sites/sidelinehero/src/rotation-charts-app.json';
const load = async () => parseChartsJson(await readFile(SYNCED, 'utf8'), SYNCED);
const clone = (x) => JSON.parse(JSON.stringify(x));

test('validateCharts accepts the synced file (42 charts)', async () => {
  const file = await load();
  assert.equal(validateCharts(file, 'synced').charts.length, 42);
});

test('validateCharts rejects broken charts, naming the chart', async () => {
  const file = await load();
  const bad = (mutate) => { const f = clone(file); mutate(f); return () => validateCharts(f, 'x'); };
  assert.throws(bad((f) => { f.charts[0].stretches[0].on.pop(); }), /6 players, h16.*five/);
  assert.throws(bad((f) => { f.charts[0].stretches[1].start += 1; }), /6 players, h16.*gap/);
  assert.throws(bad((f) => { f.charts[0].seconds[0] += 1; }), /6 players, h16.*seconds/);
  assert.throws(bad((f) => { f.charts[0].format = 'q7'; }), /unknown format/);
  assert.throws(bad((f) => { f.charts[1].format = f.charts[0].format; }), /twice/);
});

test('formatCharts is stable JSON with a trailing newline', async () => {
  const file = await load();
  assert.equal(formatCharts(file), `${JSON.stringify(file, null, 2)}\n`);
});

test('FORMATS lists the six formats in order with labels', () => {
  assert.deepEqual(FORMATS.map((f) => f.key), ['h16', 'h20', 'q6', 'q8', 'q10', 'q12']);
  assert.equal(FORMATS.find((f) => f.key === 'q8').label, '4 × 8-min quarters');
  assert.equal(FORMATS.find((f) => f.key === 'h20').label, '2 × 20-min halves');
});

test('findChart finds by roster and format, undefined otherwise', async () => {
  const file = await load();
  assert.equal(findChart(file, 10, 'q8').players, 10);
  assert.equal(findChart(file, 10, 'q8').format, 'q8');
  assert.equal(findChart(file, 20, 'q8'), undefined);
  assert.equal(findChart(file, 10, 'q7'), undefined);
});

test('playerLabels trims names, falls back to Player n, ignores extras', () => {
  assert.deepEqual(playerLabels(3, ['Ava', '  ', undefined, 'Extra']), ['Ava', 'Player 2', 'Player 3']);
  assert.deepEqual(playerLabels(2), ['Player 1', 'Player 2']);
  assert.deepEqual(playerLabels(2, ['  Sam  ']), ['Sam', 'Player 2']);
});

test('periodClock shows the scoreboard countdown within the period', async () => {
  const q8 = findChart(await load(), 10, 'q8');
  assert.equal(periodClock(0, q8), '8:00');
  assert.equal(periodClock(480 + 90, q8), '6:30');
  assert.equal(periodClock(480, q8), '8:00');
});

test('renderChartTable escapes names and fills five cells per stretch', async () => {
  const chart = findChart(await load(), 8, 'q8');
  const labels = playerLabels(8, ['<b>x</b> & "y"']);
  const html = renderChartTable(chart, labels);
  assert.match(html, /^<table class="rotation-chart">/);
  assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt; &amp; &quot;y&quot;'));
  assert.ok(!html.includes('<b>'));
  assert.match(html, /<caption>[^<]*8 players[^<]*4 × 8-min quarters[^<]*<\/caption>/);
  assert.equal((html.match(/<tr class="player">/g) || []).length, 8);
  assert.equal((html.match(/class="on"/g) || []).length, 5 * chart.stretches.length);
  assert.ok(html.includes('20:00'), 'minutes column shows m:ss totals');
});

test('sync-charts --check passes when the copy matches and fails when it does not', async () => {
  const app = await mkdtemp(join(tmpdir(), 'app-'));
  await mkdir(join(app, 'docs'));
  const current = await readFile(SYNCED, 'utf8');
  await writeFile(join(app, 'docs/rotation-charts.json'), current);
  execFileSync('node', ['scripts/sync-charts.mjs', app, '--check'], { stdio: 'pipe' });
  const changed = clone(JSON.parse(current));
  changed.charts[0].subs += 0; changed.version = 1; changed.charts.reverse();
  await writeFile(join(app, 'docs/rotation-charts.json'), JSON.stringify(changed));
  assert.throws(() => execFileSync('node', ['scripts/sync-charts.mjs', app, '--check'], { stdio: 'pipe' }));
});
