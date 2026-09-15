#!/usr/bin/env node
// Copies the app's FAQ file into this repo, or checks the copy is current.
//
//   node scripts/sync-faqs.mjs [path-to-sideline-hero] [--check]
//
// The app repo is private and this one is public, so CI can never read the
// app's file. The copy is committed; this script is run by hand after the app
// changes faqs.json. Run it from the repo root.
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateFaqs, diffFaqs, formatFaqs, parseFaqsJson } from './faqs.mjs';

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
const source = `${appRepo}/src/features/help/faqs.json`;
const dest = resolve(REPO_ROOT, 'sites/sidelinehero/src/faqs-app.json');

if (!existsSync(source)) {
  console.error(`No FAQ file at ${source}. Pass the path to your sideline-hero checkout.`);
  process.exit(1);
}

const appData = parseFaqsJson(await readFile(source, 'utf8'), source);
validateFaqs(appData, source);
const wanted = formatFaqs(appData);
const current = existsSync(dest) ? await readFile(dest, 'utf8') : null;

if (check) {
  if (current === wanted) {
    console.log(`ok   ${dest} matches ${source}`);
    process.exit(0);
  }
  const { added, removed, changed } = diffFaqs(current ? parseFaqsJson(current, dest).faqs : [], appData.faqs);
  console.error(`FAIL ${dest} is out of date with ${source}`);
  if (added.length) console.error(`     added:   ${added.join(', ')}`);
  if (removed.length) console.error(`     removed: ${removed.join(', ')}`);
  if (changed.length) console.error(`     changed: ${changed.join(', ')}`);
  if (!added.length && !removed.length && !changed.length) console.error('     (formatting only)');
  console.error('Run: node scripts/sync-faqs.mjs');
  process.exit(1);
}

await writeFile(dest, wanted);
console.log(current === wanted ? `ok   ${dest} already current` : `wrote ${dest} (${appData.faqs.length} topics)`);
