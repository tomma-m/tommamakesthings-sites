import { readFile, writeFile, mkdir, cp, rm, readdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { marked } from 'marked';
import { validateFaqs, parseFaqsJson } from './scripts/faqs.mjs';
import { assetVersion } from './scripts/asset-version.mjs';

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
    .replaceAll('{{body}}', () => body)
    .replaceAll('{{v}}', () => V);
}

async function page(outPath, body, meta) {
  const full = `${DIST}/${outPath}`;
  await mkdir(full.replace(/\/[^/]+$/, ''), { recursive: true });
  const content = meta.fullBleed ? body : `<div class="container page">\n${body}\n</div>`;
  await writeFile(full, render(content, meta));
  console.log('  ->', outPath);
}

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });

for (const dir of ['css', 'fonts', 'img', 'js']) {
  if (existsSync(`${SRC}/${dir}`)) await cp(`${SRC}/${dir}`, `${DIST}/${dir}`, { recursive: true });
}

// See scripts/asset-version.mjs. The hash goes in the FILE NAME
// (site.css → site.<v>.css): CloudFront ignores query strings in its cache
// key, so a ?v= alone could hand a mid-deploy visitor the old file under the
// new URL, which the browser then keeps for 7 days. References use {{v}},
// stamped into CSS/JS here and into HTML in render().
const V = await assetVersion([`${SRC}/css`, `${SRC}/js`]);
for (const dir of ['css', 'js']) {
  if (!existsSync(`${DIST}/${dir}`)) continue;
  for (const name of await readdir(`${DIST}/${dir}`)) {
    const p = `${DIST}/${dir}/${name}`;
    await writeFile(p, (await readFile(p, 'utf8')).replaceAll('{{v}}', V));
    await rename(p, `${DIST}/${dir}/${name.replace(/\.(css|js)$/, `.${V}.$1`)}`);
  }
}

await page('index.html', await readFile(`${SRC}/index.html`, 'utf8'), {
  title: 'Sideline Hero · basketball substitution planner for coaches',
  description: 'Fair rotations, planned before tip-off. Game day works offline, no account needed.',
  fullBleed: true,
});

await page('404.html', await readFile(`${SRC}/404.html`, 'utf8'), {
  title: 'Not found · Sideline Hero',
  description: 'That page does not exist.',
});

await page('support/index.html', await readFile(`${SRC}/support.html`, 'utf8'), {
  title: 'Support · Sideline Hero',
  description: 'Get help with Sideline Hero, report a bug, or ask a question.',
});

// Two policies, two audiences. They are wrapped in their own <section>s and
// given distinct styling so every claim is visibly scoped to the thing it
// describes — the app or this website — and neither can be read as the other.
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
  'which keeps your team data on your device and uses Google AdMob and',
  'RevenueCat for ads and purchases, and this website, which collects nothing',
  'about you.</p>',
  '<section class="policy policy-app" aria-label="Sideline Hero app privacy policy">',
  appRest,
  '</section>',
  '<section class="policy policy-site" aria-label="This website’s privacy policy">',
  marked.parse(sitePolicy),
  '</section>',
].join('\n');
await page('privacy/index.html', privacyBody,
  { title: 'Privacy · Sideline Hero',
    description: 'How Sideline Hero and this website handle your information.' });

await page('terms/index.html', marked.parse(await readFile(`${SRC}/terms-app.md`, 'utf8')), {
  title: 'Terms · Sideline Hero',
  description: 'Terms of use for the Sideline Hero app, including Premium purchases.',
});

// FAQ. faqs-app.json is a copy of sideline-hero's src/features/help/faqs.json,
// refreshed by scripts/sync-faqs.mjs — never edit it here. faqs-site.json holds
// the questions only a website visitor asks.
async function loadFaqs(file) {
  const path = `${SRC}/${file}`;
  if (!existsSync(path)) throw new Error(`${file} is missing — see README "FAQ"`);
  return validateFaqs(parseFaqsJson(await readFile(path, 'utf8'), file), file);
}
const appFaqs = await loadFaqs('faqs-app.json');
const siteFaqs = await loadFaqs('faqs-site.json');
const sharedIds = appFaqs.map(t => t.id).filter(id => siteFaqs.some(t => t.id === id));
if (sharedIds.length) throw new Error(`FAQ ids used in both files: ${sharedIds.join(', ')}`);

// Each section keeps its heading; every topic in it is a native <details>
// accordion, closed by default. Native, so it works without JavaScript and with
// a keyboard. site.js opens one when a link points at its #id.
const faqGroup = (heading, topics) => [
  `<h2>${escapeHtml(heading)}</h2>`,
  ...topics.map(t => [
    `<details class="faq-topic" id="${t.id}">`,
    `<summary><h3>${escapeHtml(t.title)}</h3></summary>`,
    '<div class="faq-answer">',
    ...t.body.map(p => `<p>${escapeHtml(p)}</p>`),
    '</div>',
    '</details>',
  ].join('\n')),
].join('\n');

const faqBody = [
  '<p class="kicker">Help</p>',
  '<h1>FAQ</h1>',
  '<p class="lede">How Sideline Hero works. The answers under Using the app are',
  'the same ones you’ll find in the app, under Settings → FAQs.</p>',
  faqGroup('Using the app', appFaqs),
  faqGroup('Before you download', siteFaqs),
].join('\n');
await page('faq/index.html', faqBody, {
  title: 'FAQ · Sideline Hero',
  description: 'How Sideline Hero works, what it costs, and what happens to your data.',
});
