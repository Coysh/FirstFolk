/** Fails the build if anything resembling an API key (or the OpenAI env var name) ships to the client. */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const bad = [/OPENAI_API_KEY/, /\bsk-[A-Za-z0-9_-]{16,}/];
const hits = [];
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|html|css|json|map|txt)$/.test(f)) {
      const text = readFileSync(p, 'utf8');
      for (const re of bad) if (re.test(text)) hits.push(`${p}: ${re}`);
    }
  }
};
walk('dist');
if (hits.length) {
  console.error('Secret check FAILED:\n' + hits.join('\n'));
  process.exit(1);
}
console.log('Secret check passed: no key material in dist/');
