import { readFile, writeFile, mkdir, cp, rm, readdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { marked } from 'marked';
import { validateFaqs, parseFaqsJson } from './scripts/faqs.mjs';
import { validateReleases, parseReleasesJson, renderReleases } from './scripts/releases.mjs';
import { assetVersion } from './scripts/asset-version.mjs';
import { parseFrontMatter } from './scripts/pages.mjs';
import { validateCharts, parseChartsJson } from './scripts/charts.mjs';
import { FORMATS, findChart, playerLabels, renderChartTable } from './sites/sidelinehero/src/js/chart-render.js';

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

// Search and sharing. ORIGIN is the one canonical host: the old subdomain and
// www 301 here (CloudFront Function sidelinehero-rewrite), so every canonical
// URL, the sitemap and the share tags name this host only.
const ORIGIN = 'https://sidelinehero.app';
const SITE_NAME = 'Sideline Hero';
const APP_STORE_URL = 'https://apps.apple.com/app/id6796588008';
const PLAY_URL = 'https://play.google.com/store/apps/details?id=app.sidelinehero.coach';

// The share card is rendered from sites/sidelinehero/og-card/ (render.sh), with
// its hash in the file name like every other cached asset. Exactly one may exist.
const ogCards = existsSync(`${SRC}/img`)
  ? (await readdir(`${SRC}/img`)).filter((n) => /^og-card\.[0-9a-f]{8}\.png$/.test(n))
  : [];
if (ogCards.length !== 1) throw new Error(`expected one img/og-card.<hash>.png, found ${ogCards.length} — run og-card/render.sh`);
const OG_IMAGE = `${ORIGIN}/img/${ogCards[0]}`;

// Every indexable page, in build order. robots.txt and sitemap.xml are written
// from this list at the end, so a new page can't be left out of the sitemap.
const indexable = [];

// JSON-LD sits inside a <script>; escaping `<` keeps a `</script>` in any
// string from closing it early.
const jsonLd = (data) =>
  `<script type="application/ld+json">${JSON.stringify(data).replaceAll('<', '\\u003c')}</script>`;

function seoTags({ title, description, path, noindex, structuredData }) {
  if (noindex) return '<meta name="robots" content="noindex">';
  const url = `${ORIGIN}${path}`;
  const tags = [
    `<link rel="canonical" href="${url}">`,
    '<meta property="og:type" content="website">',
    `<meta property="og:site_name" content="${SITE_NAME}">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${OG_IMAGE}">`,
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    '<meta property="og:image:alt" content="Sideline Hero: coach the game, not the subs. The live game screen on a phone.">',
    '<meta name="twitter:card" content="summary_large_image">',
  ];
  if (structuredData) tags.push(jsonLd(structuredData));
  return tags.join('\n');
}

// Function replacements throughout: a string replacement would interpret `$&`,
// "$`", `$'` and `$1` in the *content* as substitution patterns. This is legal
// text — it has to come out byte-for-byte.
function render(body, meta) {
  return layout
    .replaceAll('{{title}}', () => escapeHtml(meta.title))
    .replaceAll('{{description}}', () => escapeHtml(meta.description))
    .replaceAll('{{seo}}', () => seoTags(meta))
    .replaceAll('{{body}}', () => body)
    .replaceAll('{{v}}', () => V);
}

// meta.path is the page's public, clean URL path ('/faq'), which is what the
// header and footer link to. Required unless the page is noindex.
async function page(outPath, body, meta) {
  if (!meta.noindex) {
    if (!meta.path?.startsWith('/')) throw new Error(`${outPath} needs a path`);
    indexable.push(meta.path);
  }
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

// Files that must sit at the site root under a fixed name. app-ads.txt is
// AdMob's authorised-seller record for the app (IAB app-ads.txt spec).
for (const file of ['app-ads.txt']) {
  if (existsSync(`${SRC}/${file}`)) await cp(`${SRC}/${file}`, `${DIST}/${file}`);
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
  path: '/',
  // WebSite gives Google the site's name for search results; MobileApplication
  // ties the site to both store listings. No rating: the app has no reviews to
  // quote yet, and an invented one is against Google's rules.
  structuredData: {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', name: SITE_NAME, url: `${ORIGIN}/` },
      {
        '@type': 'MobileApplication',
        name: SITE_NAME,
        url: `${ORIGIN}/`,
        description: 'Basketball substitution planner and sub timer for youth and community coaches. Plans fair rotations before tip-off and guides every sub during the game.',
        applicationCategory: 'SportsApplication',
        operatingSystem: 'iOS, Android',
        image: `${ORIGIN}/img/icon-180.png`,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'AUD' },
        sameAs: [APP_STORE_URL, PLAY_URL],
      },
    ],
  },
});

await page('404.html', await readFile(`${SRC}/404.html`, 'utf8'), {
  title: 'Not found · Sideline Hero',
  description: 'That page does not exist.',
  noindex: true,
});

await page('support/index.html', await readFile(`${SRC}/support.html`, 'utf8'), {
  title: 'Support · Sideline Hero',
  description: 'Get help with Sideline Hero, report a bug, or ask a question.',
  path: '/support',
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
    description: 'How Sideline Hero and this website handle your information.',
    path: '/privacy' });

await page('terms/index.html', marked.parse(await readFile(`${SRC}/terms-app.md`, 'utf8')), {
  title: 'Terms · Sideline Hero',
  description: 'Terms of use for the Sideline Hero app, including Premium purchases.',
  path: '/terms',
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
  path: '/faq',
});

// What's new. releases-app.json is a copy of sideline-hero's docs/releases.json,
// refreshed by scripts/sync-releases.mjs — never edit it here. Only releases
// that reached a public store are in it, and only the stores each one reached.
const releasesPath = `${SRC}/releases-app.json`;
if (!existsSync(releasesPath)) throw new Error('releases-app.json is missing — see README "What’s new"');
const releases = validateReleases(parseReleasesJson(await readFile(releasesPath, 'utf8'), 'releases-app.json'), 'releases-app.json');
const releasesBody = [
  '<p class="kicker">Updates</p>',
  '<h1>What’s new</h1>',
  '<p class="lede">Every Sideline Hero update on Google Play and the App Store,',
  'newest first, with the date it reached each store.</p>',
  renderReleases(releases),
].join('\n');
await page('releases/index.html', releasesBody, {
  title: 'What’s new · Sideline Hero',
  description: 'Every Sideline Hero update, what changed, and when it reached Google Play and the App Store.',
  path: '/releases',
});

// Rotation charts: a copy of the app engine's output (README "Rotation
// charts"). Validated here so a broken copy fails the build, not the page.
const chartsPath = `${SRC}/rotation-charts-app.json`;
if (!existsSync(chartsPath)) throw new Error('rotation-charts-app.json is missing — see README "Rotation charts"');
const charts = validateCharts(parseChartsJson(await readFile(chartsPath, 'utf8'), 'rotation-charts-app.json'), 'rotation-charts-app.json');

// The "get the app" block every content page ends with. Its store badges carry
// the page's own campaign tag, so the store dashboards show which page a
// download came from (README "Search and sharing").
const appBlockTemplate = await readFile(`${SRC}/partials/app-block.html`, 'utf8');
const appBlock = (campaign) => appBlockTemplate.replaceAll('{{campaign}}', () => campaign);

// A roster page's chart: the 8-minute-quarter chart (the most common US youth
// format), then links to the same roster in every other format in the maker.
function chartBlock(players) {
  const chart = findChart(charts, players, 'q8');
  const others = FORMATS.filter((f) => f.key !== 'q8').map((f) =>
    `<li><a href="/rotation-chart-maker?players=${players}&amp;format=${f.key}">${escapeHtml(f.label)}</a></li>`).join('\n');
  return [
    `<div class="chart-scroll">${renderChartTable(chart, playerLabels(players))}</div>`,
    `<p class="chart-other-formats-lede">The same ${players} players in another format:</p>`,
    `<ul class="chart-other-formats">\n${others}\n</ul>`,
  ].join('\n');
}

async function markdownFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...await markdownFiles(p));
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out.sort();
}

// Content pages: Markdown with front matter (scripts/pages.mjs). Each page's
// file path under src/pages doesn't decide its URL; its front matter path does.
for (const file of await markdownFiles(`${SRC}/pages`)) {
  const rel = file.slice(`${SRC}/`.length);
  const { meta, body } = parseFrontMatter(await readFile(file, 'utf8'), rel);
  let html = marked.parse(body);
  if (html.includes('{{chart}}')) {
    if (!meta.chartPlayers) throw new Error(`${rel}: {{chart}} needs chartPlayers in the front matter`);
    html = html.replace(/<p>\{\{chart\}\}<\/p>|\{\{chart\}\}/, () => chartBlock(meta.chartPlayers));
  }
  const content = [
    meta.kicker ? `<p class="kicker">${escapeHtml(meta.kicker)}</p>` : '',
    html,
    appBlock(meta.campaign),
  ].join('\n');
  const out = meta.path === '/' ? 'index.html' : `${meta.path.slice(1)}/index.html`;
  await page(out, content, { title: meta.title, description: meta.description, path: meta.path });
}

// The chart maker: the charts embedded as JSON (no fetch), the default chart
// pre-rendered so the page works without JavaScript, the app block last.
const makerBody = (await readFile(`${SRC}/rotation-chart-maker.html`, 'utf8'))
  .replaceAll('{{format-options}}', () => FORMATS.map((f) => `<option value="${f.key}">${escapeHtml(f.label)}</option>`).join(''))
  .replaceAll('{{default-chart}}', () => renderChartTable(findChart(charts, 10, 'q8'), playerLabels(10)))
  .replaceAll('{{chart-data}}', () => JSON.stringify(charts).replaceAll('<', '\\u003c'));
await page('rotation-chart-maker/index.html', `${makerBody}\n${appBlock('rotation-chart-maker')}`, {
  title: 'Basketball rotation chart maker · Sideline Hero',
  description: 'Free basketball rotation chart maker. Pick 6 to 12 players, halves or quarters, add names and print a fair, equal playing time chart.',
  path: '/rotation-chart-maker',
});

// Written last, from every page() above that isn't noindex.
await writeFile(`${DIST}/robots.txt`, `User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n`);
await writeFile(`${DIST}/sitemap.xml`, [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...indexable.map((p) => `  <url><loc>${ORIGIN}${p}</loc></url>`),
  '</urlset>',
  '',
].join('\n'));
console.log('  -> robots.txt, sitemap.xml');
