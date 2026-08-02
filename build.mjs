import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { marked } from 'marked';

const site = process.argv[2];
if (!site) { console.error('usage: node build.mjs <site>'); process.exit(1); }

const SRC = `sites/${site}/src`;
const DIST = `sites/${site}/dist`;

const layout = await readFile(`${SRC}/layout.html`, 'utf8');

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// Function replacements throughout: a string replacement would interpret `$&`,
// "$`", `$'` and `$1` in the *content* as substitution patterns. This is legal
// text — it has to come out byte-for-byte.
function render(body, { title, description }) {
  return layout
    .replaceAll('{{title}}', () => escapeHtml(title))
    .replaceAll('{{description}}', () => escapeHtml(description))
    .replaceAll('{{body}}', () => body);
}

async function page(outPath, body, meta) {
  const full = `${DIST}/${outPath}`;
  await mkdir(full.replace(/\/[^/]+$/, ''), { recursive: true });
  await writeFile(full, render(body, meta));
  console.log('  ->', outPath);
}

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });

for (const dir of ['css', 'fonts', 'img']) {
  if (existsSync(`${SRC}/${dir}`)) await cp(`${SRC}/${dir}`, `${DIST}/${dir}`, { recursive: true });
}

await page('index.html', await readFile(`${SRC}/index.html`, 'utf8'), {
  title: 'Sideline Hero — basketball substitution planner for coaches',
  description: 'Fair rotations, planned before tip-off. Works offline, no account, free.',
});

await page('404.html', await readFile(`${SRC}/404.html`, 'utf8'), {
  title: 'Not found — Sideline Hero',
  description: 'That page does not exist.',
});

await page('support/index.html', await readFile(`${SRC}/support.html`, 'utf8'), {
  title: 'Support — Sideline Hero',
  description: 'Get help with Sideline Hero, report a bug, or ask a question.',
});

// Two policies, two audiences, two very different factual claims. They are
// wrapped in their own <section>s and given distinct styling so nobody can read
// the website's email collection as something the app does, or vice versa.
const appPolicy = await readFile(`${SRC}/privacy-app.md`, 'utf8');
const sitePolicy = await readFile(`${SRC}/privacy-site.md`, 'utf8');
// The app policy owns the page's <h1>. Lift it out of the section so the scoping
// lede sits under the page title rather than above it. Fail loudly if the
// heading ever goes missing, rather than slicing the document at random.
const appHtml = marked.parse(appPolicy);
const h1End = appHtml.indexOf('</h1>');
if (h1End === -1) throw new Error('privacy-app.md must open with an H1');
const pageTitle = appHtml.slice(0, h1End + '</h1>'.length);
const appRest = appHtml.slice(h1End + '</h1>'.length);

const privacyBody = [
  pageTitle,
  '<p class="lede">This page has two separate parts: the Sideline Hero app,',
  'which transmits nothing, and this website, which collects an email address',
  'only if you ask for beta access.</p>',
  '<section class="policy policy-app" aria-label="Sideline Hero app privacy policy">',
  appRest,
  '</section>',
  '<section class="policy policy-site" aria-label="This website’s privacy policy">',
  marked.parse(sitePolicy),
  '</section>',
].join('\n');
await page('privacy/index.html', privacyBody,
  { title: 'Privacy — Sideline Hero',
    description: 'How Sideline Hero and this website handle your information.' });
