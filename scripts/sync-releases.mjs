#!/usr/bin/env node
// Copies the app's release history into this repo, or checks the copy is current.
//
//   node scripts/sync-releases.mjs [path-to-sideline-hero] [--check]
//
// The app repo is private and this one is public, so CI can never read the
// app's file. The copy is committed; this script is run by hand after the app
// changes docs/releases.json (when a store approves a release). Run it from
// the repo root.
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateReleases, formatReleases, parseReleasesJson } from './releases.mjs';

// Resolved from the script's own location, not the process's current
// directory, so this works the same whether it's run from the repo root or
// anywhere else.
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

const args = process.argv.slice(2);
const check = args.includes('--check');
const appRepoArg = args.find(arg => !arg.startsWith('--'));
// An explicit first argument is still resolved against the current
// directory, so a relative path the user types works as they expect.
const appRepo = appRepoArg ? resolve(appRepoArg) : resolve(REPO_ROOT, '..', 'sideline-hero');
const source = `${appRepo}/docs/releases.json`;
const dest = resolve(REPO_ROOT, 'sites/sidelinehero/src/releases-app.json');

if (!existsSync(source)) {
  console.error(`No release file at ${source}. Pass the path to your sideline-hero checkout.`);
  process.exit(1);
}

const appData = parseReleasesJson(await readFile(source, 'utf8'), source);
validateReleases(appData, source);
const wanted = formatReleases(appData);
const current = existsSync(dest) ? await readFile(dest, 'utf8') : null;

if (check) {
  if (current === wanted) {
    console.log(`ok   ${dest} matches ${source}`);
    process.exit(0);
  }
  console.error(`FAIL ${dest} is out of date with ${source}`);
  console.error('Run: node scripts/sync-releases.mjs');
  process.exit(1);
}

await writeFile(dest, wanted);
console.log(current === wanted ? `ok   ${dest} already current` : `wrote ${dest} (${appData.releases.length} release${appData.releases.length === 1 ? '' : 's'})`);
