import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

// CSS and JS are served with a 7-day browser cache. Every URL to them carries
// ?v=<this hash>, so a changed file is a new URL and no visitor mixes old
// styles with new markup. Hash covers paths AND contents, sorted, so it is
// stable across machines.
export async function assetVersion(dirs) {
  const hash = createHash('sha256');
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    const names = (await readdir(dir, { recursive: true })).sort();
    for (const name of names) {
      const p = join(dir, name);
      try { hash.update(name).update(await readFile(p)); } catch { /* directory entry */ }
    }
  }
  return hash.digest('hex').slice(0, 8);
}
