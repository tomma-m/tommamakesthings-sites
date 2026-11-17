// Markdown content pages (sites/sidelinehero/src/pages/**/*.md): front matter
// parsing, shared by build.mjs and its tests. No YAML library: front matter is
// a fenced block of `key: value` lines, and only the keys below are allowed,
// so a typo fails the build instead of being silently ignored.

const KEYS = new Set(['title', 'description', 'path', 'kicker', 'campaign', 'chartPlayers']);
const CAMPAIGN = /^[a-z0-9-]{1,30}$/;

export function parseFrontMatter(text, file) {
  const fail = (message) => { throw new Error(`${file}: ${message}`); };
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) fail('must start with a --- front matter block');

  const meta = {};
  for (const line of m[1].split('\n')) {
    if (!line.trim()) continue;
    const colon = line.indexOf(':');
    if (colon < 1) fail(`front matter line "${line}" is not key: value`);
    const key = line.slice(0, colon).trim();
    if (!KEYS.has(key)) fail(`unknown front matter key "${key}"`);
    meta[key] = line.slice(colon + 1).trim();
  }

  for (const key of ['title', 'description', 'path']) if (!meta[key]) fail(`needs a ${key}`);
  if (!meta.path.startsWith('/')) fail(`path "${meta.path}" must start with /`);
  meta.campaign ??= file.split('/').pop().replace(/\.md$/, '');
  if (!CAMPAIGN.test(meta.campaign)) fail(`campaign "${meta.campaign}" must be 1 to 30 of a-z, 0-9 and -`);
  if (meta.chartPlayers !== undefined) {
    const n = Number(meta.chartPlayers);
    if (!Number.isInteger(n) || n < 6 || n > 12) fail(`chartPlayers must be 6 to 12, got "${meta.chartPlayers}"`);
    meta.chartPlayers = n;
  }
  return { meta, body: m[2] };
}
