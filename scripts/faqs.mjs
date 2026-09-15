// FAQ file helpers, shared by build.mjs and sync-faqs.mjs.
//
// The rules mirror sideline-hero's src/features/help/__tests__/faqs.test.ts.
// The app owns faqs.json; this repo only ever holds a copy of it, so the two
// sets of rules must agree or a file valid in the app would break this build.

export const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Markdown and URLs would display literally in the app's <Text> and in the
// escaped HTML here; `<` would be an HTML injection waiting to happen.
const NOT_PLAIN = /\*\*|\]\(|https?:\/\/|</;

export function validateFaqs(data, label) {
  const fail = message => { throw new Error(`${label}: ${message}`); };
  if (!data || !Array.isArray(data.faqs)) fail('expected { "faqs": [...] }');
  if (data.faqs.length === 0) fail('needs at least one topic');

  const seen = new Set();
  data.faqs.forEach((topic, index) => {
    const where = `topic ${index + 1}`;
    if (typeof topic !== 'object' || topic === null) fail(`${where} is not an object`);
    if (typeof topic.id !== 'string' || !ID_PATTERN.test(topic.id)) {
      fail(`${where} has an invalid id ${JSON.stringify(topic.id)} (lowercase words joined by hyphens)`);
    }
    if (seen.has(topic.id)) fail(`repeated id "${topic.id}"`);
    seen.add(topic.id);

    if (typeof topic.title !== 'string' || topic.title.trim() === '') fail(`"${topic.id}" has an empty title`);
    if (!Array.isArray(topic.body) || topic.body.length === 0) fail(`"${topic.id}" has an empty body`);
    for (const text of [topic.title, ...topic.body]) {
      if (typeof text !== 'string') fail(`"${topic.id}" has a title or paragraph that is not a string`);
      if (text === '') fail(`"${topic.id}" has an empty paragraph`);
      if (text !== text.trim()) fail(`"${topic.id}" has leading or trailing whitespace`);
      if (NOT_PLAIN.test(text)) fail(`"${topic.id}" must be plain text (no markdown, URLs or <)`);
    }
  });
  return data.faqs;
}

// Reports which file failed to parse, instead of a bare SyntaxError.
export function parseFaqsJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`${label}: not valid JSON (${err.message})`);
  }
}

export function diffFaqs(before, after) {
  const byId = topics => new Map(topics.map(t => [t.id, JSON.stringify(t)]));
  const a = byId(before);
  const b = byId(after);
  return {
    added: [...b.keys()].filter(id => !a.has(id)),
    removed: [...a.keys()].filter(id => !b.has(id)),
    changed: [...b.keys()].filter(id => a.has(id) && a.get(id) !== b.get(id)),
  };
}

export function formatFaqs(data) {
  return `${JSON.stringify(data, null, 2)}\n`;
}
