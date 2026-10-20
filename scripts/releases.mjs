// Release history helpers, shared by build.mjs and sync-releases.mjs.
//
// The app owns docs/releases.json; this repo only ever holds a copy of it
// (releases-app.json). A release is listed once it reaches a public store,
// and only the stores it actually reached are named.

const VERSION_PATTERN = /^\d+(\.\d+)+$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

// Display order, and the only store keys a release may name.
export const STORES = [
  ['google_play', 'Google Play'],
  ['app_store', 'App Store'],
];

// Same rule as the FAQ text, plus a leading bullet: the notes are bullets
// already, and "• " copied from the store text would show twice.
const NOT_PLAIN = /\*\*|\]\(|https?:\/\/|<|^•/;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function isRealDate(value) {
  const m = typeof value === 'string' && value.match(DATE_PATTERN);
  if (!m) return false;
  const [y, mo, d] = m.slice(1).map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

function compareVersionsDesc(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pb[i] ?? 0) - (pa[i] ?? 0);
    if (diff) return diff;
  }
  return 0;
}

export function validateReleases(data, label) {
  const fail = message => { throw new Error(`${label}: ${message}`); };
  if (!data || !Array.isArray(data.releases)) fail('expected { "releases": [...] }');
  if (data.releases.length === 0) fail('needs at least one release');

  const known = new Set(STORES.map(([key]) => key));
  const seen = new Set();
  data.releases.forEach((release, index) => {
    const where = `release ${index + 1}`;
    if (typeof release !== 'object' || release === null) fail(`${where} is not an object`);
    if (typeof release.version !== 'string' || !VERSION_PATTERN.test(release.version)) {
      fail(`${where} has an invalid version ${JSON.stringify(release.version)} (numbers joined by dots, like 1.1.2)`);
    }
    const v = release.version;
    if (seen.has(v)) fail(`repeated version "${v}"`);
    seen.add(v);

    const stores = release.stores;
    if (typeof stores !== 'object' || stores === null || Object.keys(stores).length === 0) {
      fail(`"${v}" needs at least one store it was released on`);
    }
    for (const [store, date] of Object.entries(stores)) {
      if (!known.has(store)) fail(`"${v}" names unknown store "${store}"`);
      if (!isRealDate(date)) fail(`"${v}" has an invalid ${store} date ${JSON.stringify(date)} (YYYY-MM-DD)`);
    }

    if (!Array.isArray(release.notes) || release.notes.length === 0) fail(`"${v}" has no notes`);
    for (const note of release.notes) {
      if (typeof note !== 'string') fail(`"${v}" has a note that is not a string`);
      if (note === '') fail(`"${v}" has an empty note`);
      if (note !== note.trim()) fail(`"${v}" has a note with leading or trailing whitespace`);
      if (NOT_PLAIN.test(note)) fail(`"${v}" notes must be plain text (no markdown, URLs, < or leading bullets)`);
    }
  });
  return [...data.releases].sort((a, b) => compareVersionsDesc(a.version, b.version));
}

// Reports which file failed to parse, instead of a bare SyntaxError.
export function parseReleasesJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`${label}: not valid JSON (${err.message})`);
  }
}

export function formatReleases(data) {
  return `${JSON.stringify(data, null, 2)}\n`;
}

export function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// One native <details> row per release, styled like the FAQ. Only the newest
// starts open. Expects the order validateReleases returns.
export function renderReleases(releases) {
  return releases.map((r, index) => {
    const id = `v${r.version.replace(/\./g, '-')}`;
    const storeRows = STORES
      .filter(([key]) => r.stores[key])
      .map(([key, name]) => `<tr><th scope="row">${name}</th>\n<td>${formatDate(r.stores[key])}</td></tr>`);
    const notes = r.notes.length === 1
      ? `<p>${escapeHtml(r.notes[0])}</p>`
      : ['<ul>', ...r.notes.map(n => `<li>${escapeHtml(n)}</li>`), '</ul>'].join('\n');
    return [
      `<details class="faq-topic release" id="${id}"${index === 0 ? ' open' : ''}>`,
      `<summary><h3>Version ${escapeHtml(r.version)}</h3></summary>`,
      '<div class="faq-answer">',
      '<table class="release-stores">',
      ...storeRows,
      '</table>',
      notes,
      '</div>',
      '</details>',
    ].join('\n');
  }).join('\n');
}
