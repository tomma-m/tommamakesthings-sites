#!/usr/bin/env node
// Copies the app's rotation charts into this repo, or checks the copy is current.
//
//   node scripts/sync-charts.mjs [path-to-sideline-hero] [--check]
//
// The app repo is private and this one is public, so CI can never read the
// app's file, and the engine that makes it never comes here: only its output
// does. The copy is committed; run this by hand after the app regenerates
// docs/rotation-charts.json (`npm run charts`, after an engine change ships).
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCharts, formatCharts, parseChartsJson } from './charts.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

const args = process.argv.slice(2);
const check = args.includes('--check');
const appRepoArg = args.find((arg) => !arg.startsWith('--'));
const appRepo = appRepoArg ? resolve(appRepoArg) : resolve(REPO_ROOT, '..', 'sideline-hero');
const source = `${appRepo}/docs/rotation-charts.json`;
const dest = resolve(REPO_ROOT, 'sites/sidelinehero/src/rotation-charts-app.json');

if (!existsSync(source)) {
  console.error(`No chart file at ${source}. Pass the path to your sideline-hero checkout.`);
  process.exit(1);
}

const appData = validateCharts(parseChartsJson(await readFile(source, 'utf8'), source), source);
const wanted = formatCharts(appData);
const current = existsSync(dest) ? await readFile(dest, 'utf8') : null;

if (check) {
  if (current === wanted) {
    console.log(`ok   ${dest} matches ${source}`);
    process.exit(0);
  }
  console.error(`FAIL ${dest} is out of date with ${source}`);
  console.error('Run: node scripts/sync-charts.mjs');
  process.exit(1);
}

await writeFile(dest, wanted);
console.log(current === wanted ? `ok   ${dest} already current` : `wrote ${dest} (${appData.charts.length} charts)`);
