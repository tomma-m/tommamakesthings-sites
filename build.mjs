import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { marked } from 'marked';

const site = process.argv[2];
if (!site) { console.error('usage: node build.mjs <site>'); process.exit(1); }

const SRC = `sites/${site}/src`;
const DIST = `sites/${site}/dist`;

const layout = await readFile(`${SRC}/layout.html`, 'utf8');

function render(body, { title, description }) {
  return layout
    .replaceAll('{{body}}', body)
    .replaceAll('{{title}}', title)
    .replaceAll('{{description}}', description);
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
