import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateFaqs, diffFaqs, formatFaqs } from './faqs.mjs';

const topic = (id, overrides = {}) => ({ id, title: `Title ${id}`, body: ['A paragraph.'], ...overrides });

test('validateFaqs returns the topics of a valid file', () => {
  const data = { faqs: [topic('one'), topic('two-words')] };
  assert.deepEqual(validateFaqs(data, 'x.json'), data.faqs);
});

test('validateFaqs rejects a file with no faqs array', () => {
  assert.throws(() => validateFaqs({}, 'x.json'), /^Error: x\.json: /);
  assert.throws(() => validateFaqs({ faqs: [] }, 'x.json'), /at least one topic/);
});

test('validateFaqs rejects ids that are not URL-safe', () => {
  for (const id of ['Upper', 'two  spaces', 'trailing-', '-leading', 'under_score', '']) {
    assert.throws(() => validateFaqs({ faqs: [topic(id)] }, 'x.json'), /id/, `accepted "${id}"`);
  }
});

test('validateFaqs rejects a repeated id', () => {
  assert.throws(() => validateFaqs({ faqs: [topic('same'), topic('same')] }, 'x.json'), /repeated id "same"/);
});

test('validateFaqs rejects empty titles and bad paragraphs', () => {
  assert.throws(() => validateFaqs({ faqs: [topic('a', { title: ' ' })] }, 'x.json'), /title/);
  assert.throws(() => validateFaqs({ faqs: [topic('a', { body: [] })] }, 'x.json'), /body/);
  assert.throws(() => validateFaqs({ faqs: [topic('a', { body: [''] })] }, 'x.json'), /paragraph/);
  assert.throws(() => validateFaqs({ faqs: [topic('a', { body: [' padded '] })] }, 'x.json'), /whitespace/);
});

test('validateFaqs rejects markdown, URLs and angle brackets', () => {
  for (const text of ['**bold**', '[link](x)', 'see https://example.com', 'a <b> tag']) {
    assert.throws(() => validateFaqs({ faqs: [topic('a', { body: [text] })] }, 'x.json'), /plain text/, `accepted "${text}"`);
  }
});

test('diffFaqs reports added, removed and changed ids', () => {
  const before = [topic('kept'), topic('edited'), topic('gone')];
  const after = [topic('kept'), topic('edited', { body: ['New words.'] }), topic('new')];
  assert.deepEqual(diffFaqs(before, after), { added: ['new'], removed: ['gone'], changed: ['edited'] });
});

test('formatFaqs is stable two-space JSON with a trailing newline', () => {
  const data = { faqs: [topic('a')] };
  assert.equal(formatFaqs(data), `${JSON.stringify(data, null, 2)}\n`);
});
