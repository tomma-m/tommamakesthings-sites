import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateReleases, parseReleasesJson, formatReleases, formatDate, renderReleases } from './releases.mjs';

const release = (version, overrides = {}) => ({
  version,
  stores: { google_play: '2026-10-20' },
  notes: ['A change.'],
  ...overrides,
});

test('validateReleases returns the releases newest version first', () => {
  const data = { releases: [release('1.1.2'), release('1.1.10'), release('1.0')] };
  assert.deepEqual(validateReleases(data, 'x.json').map(r => r.version), ['1.1.10', '1.1.2', '1.0']);
});

test('validateReleases rejects a file with no releases array', () => {
  assert.throws(() => validateReleases({}, 'x.json'), /^Error: x\.json: /);
  assert.throws(() => validateReleases({ releases: [] }, 'x.json'), /at least one release/);
});

test('validateReleases rejects versions that are not numbers joined by dots', () => {
  for (const version of ['v1.1.2', '1.1.', '1', 'one', '', 1.2]) {
    assert.throws(() => validateReleases({ releases: [release(version)] }, 'x.json'), /version/, `accepted ${JSON.stringify(version)}`);
  }
});

test('validateReleases rejects a repeated version', () => {
  assert.throws(() => validateReleases({ releases: [release('1.1.2'), release('1.1.2')] }, 'x.json'), /repeated version "1\.1\.2"/);
});

test('validateReleases needs at least one known store with a real date', () => {
  assert.throws(() => validateReleases({ releases: [release('1.1.2', { stores: {} })] }, 'x.json'), /store/);
  assert.throws(() => validateReleases({ releases: [release('1.1.2', { stores: { steam: '2026-10-20' } })] }, 'x.json'), /unknown store "steam"/);
  for (const date of ['20 Oct 2026', '2026-13-01', '2026-02-30', '', null]) {
    assert.throws(
      () => validateReleases({ releases: [release('1.1.2', { stores: { app_store: date } })] }, 'x.json'),
      /date/,
      `accepted ${JSON.stringify(date)}`,
    );
  }
});

test('validateReleases rejects empty or non-plain notes', () => {
  assert.throws(() => validateReleases({ releases: [release('1.1.2', { notes: [] })] }, 'x.json'), /notes/);
  assert.throws(() => validateReleases({ releases: [release('1.1.2', { notes: [''] })] }, 'x.json'), /note/);
  assert.throws(() => validateReleases({ releases: [release('1.1.2', { notes: [' padded '] })] }, 'x.json'), /whitespace/);
  for (const text of ['**bold**', 'see https://example.com', 'a <b> tag', '• bullet']) {
    assert.throws(() => validateReleases({ releases: [release('1.1.2', { notes: [text] })] }, 'x.json'), /plain text/, `accepted "${text}"`);
  }
});

test('parseReleasesJson names the file that failed to parse', () => {
  assert.throws(() => parseReleasesJson('{', 'x.json'), /^Error: x\.json: not valid JSON/);
});

test('formatReleases is stable JSON with a trailing newline', () => {
  assert.equal(formatReleases({ releases: [] }), '{\n  "releases": []\n}\n');
});

test('formatDate writes a day, short month and year', () => {
  assert.equal(formatDate('2026-10-20'), '20 Oct 2026');
  assert.equal(formatDate('2027-01-05'), '5 Jan 2027');
});

test('renderReleases opens only the newest release, as native details rows', () => {
  const html = renderReleases([release('1.1.4'), release('1.1.2')]);
  assert.equal((html.match(/<details /g) || []).length, 2);
  assert.match(html, /<details class="faq-topic release" id="v1-1-4" open>/);
  assert.match(html, /<details class="faq-topic release" id="v1-1-2">/);
});

test('renderReleases lists only the stores a release reached', () => {
  const html = renderReleases([release('1.1.2', { stores: { google_play: '2026-10-20' } })]);
  assert.match(html, /Google Play<\/th>\s*<td>20 Oct 2026<\/td>/);
  assert.doesNotMatch(html, /App Store/);
});

test('renderReleases lists Google Play before the App Store', () => {
  const html = renderReleases([release('1.1.4', { stores: { app_store: '2026-10-24', google_play: '2026-10-21' } })]);
  assert.ok(html.indexOf('Google Play') < html.indexOf('App Store'));
});

test('renderReleases shows several notes as a list and a single note as a paragraph', () => {
  const many = renderReleases([release('1.1.2', { notes: ['One.', 'Two.'] })]);
  assert.match(many, /<ul>\s*<li>One\.<\/li>\s*<li>Two\.<\/li>\s*<\/ul>/);
  const one = renderReleases([release('1.0', { notes: ['The first release.'] })]);
  assert.match(one, /<p>The first release\.<\/p>/);
  assert.doesNotMatch(one, /<ul>/);
});

test('renderReleases escapes note text', () => {
  const html = renderReleases([release('1.1.2', { notes: ['Fouls & points'] })]);
  assert.match(html, /Fouls &amp; points/);
});
