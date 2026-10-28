/**
 * Offline asset generation with the OpenAI Images API. Node only — never bundled.
 * The key is read from process.env.OPENAI_API_KEY and is never logged or written anywhere.
 *
 *   npx tsx tools/assets/generate.ts            # generate missing assets
 *   npx tsx tools/assets/generate.ts --force logo icon-hut   # regenerate specific ids
 *
 * Consistency: every prompt gets the shared style bible; icons are generated with the
 * anchor icon passed as a style reference via the edits endpoint.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

interface Asset {
  id: string;
  kind: 'icon' | 'logo' | 'art' | 'texture';
  out: string;
  prompt: string;
  size?: number;
  width?: number;
  gen?: string;
  anchor?: boolean;
}
interface Manifest {
  model: string;
  /** Model used when a transparent background is needed (not every model supports it). */
  transparentModel: string;
  styleIcon: string;
  styleArt: string;
  assets: Asset[];
}

const ROOT = join(import.meta.dirname, '..', '..');
const RAW = join(ROOT, 'tools/assets/raw');
const PUBLIC = join(ROOT, 'public/assets');
const manifest: Manifest = JSON.parse(readFileSync(join(import.meta.dirname, 'manifest.json'), 'utf8'));

const key = process.env.OPENAI_API_KEY;
if (!key) {
  console.error('OPENAI_API_KEY is not set');
  process.exit(1);
}

const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.filter((a) => !a.startsWith('--'));

function fullPrompt(a: Asset): string {
  if (a.kind === 'icon') return `${manifest.styleIcon}\n\nSubject: ${a.prompt}`;
  if (a.kind === 'logo') return `${a.prompt}\nStyle: ${manifest.styleIcon.replace('A single object, centred, filling about 80% of the frame, ', '')}`.replace('No text, no letters, ', '');
  return `${manifest.styleArt}\n\nScene: ${a.prompt}`;
}

async function call(a: Asset, reference?: Buffer): Promise<Buffer> {
  const transparent = a.kind === 'icon' || a.kind === 'logo';
  const size = a.gen ?? '1024x1024';
  const quality = a.kind === 'icon' ? 'medium' : 'high';
  const model = transparent ? manifest.transparentModel : manifest.model;
  let res: Response;
  if (reference) {
    const form = new FormData();
    form.append('model', model);
    form.append('prompt', `${fullPrompt(a)}\n\nMatch the exact illustration style, outline weight, palette and lighting of the reference image, but draw only the new subject.`);
    form.append('image[]', new Blob([new Uint8Array(reference)], { type: 'image/png' }), 'reference.png');
    form.append('size', size);
    form.append('quality', quality);
    if (transparent) form.append('background', 'transparent');
    res = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form });
  } else {
    res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: fullPrompt(a), size, quality, ...(transparent ? { background: 'transparent' } : {}), output_format: 'png' }),
    });
  }
  const body = (await res.json()) as { data?: { b64_json: string }[]; error?: { message: string } };
  if (!res.ok || !body.data) throw new Error(`${a.id}: ${res.status} ${body.error?.message ?? 'unknown error'}`);
  return Buffer.from(body.data[0].b64_json, 'base64');
}

async function processAsset(a: Asset, raw: Buffer): Promise<void> {
  const out = join(PUBLIC, a.out);
  mkdirSync(dirname(out), { recursive: true });
  if (a.kind === 'icon') {
    await sharp(raw).trim({ threshold: 1 }).resize(a.size ?? 128, a.size ?? 128, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png({ compressionLevel: 9 }).toFile(out);
  } else if (a.kind === 'logo') {
    // Palette PNG keeps the logo crisp at a fraction of the size.
    await sharp(raw).trim({ threshold: 1 }).resize({ width: a.width ?? 900, withoutEnlargement: true }).png({ palette: true, quality: 90, compressionLevel: 9, effort: 10 }).toFile(out);
  } else {
    await sharp(raw).resize({ width: a.width ?? 1024 }).jpeg({ quality: 82, mozjpeg: true }).toFile(out);
  }
}

async function main() {
  mkdirSync(RAW, { recursive: true });
  const todo = manifest.assets.filter((a) => (only.length ? only.includes(a.id) : true) && (force || !existsSync(join(PUBLIC, a.out))));
  const anchor = manifest.assets.find((a) => a.anchor)!;
  const anchorRaw = join(RAW, `${anchor.id}.png`);

  // The anchor icon defines the style for the rest, so make sure it exists first.
  if (todo.includes(anchor) || !existsSync(anchorRaw)) {
    console.log(`generating ${anchor.id} (style anchor)…`);
    const buf = await call(anchor);
    writeFileSync(anchorRaw, buf);
    await processAsset(anchor, buf);
  }
  const reference = readFileSync(anchorRaw);

  const rest = todo.filter((a) => a !== anchor);
  // Small concurrency keeps us well within rate limits.
  const queue = [...rest];
  const worker = async () => {
    for (let a = queue.shift(); a; a = queue.shift()) {
      try {
        console.log(`generating ${a.id}…`);
        const buf = await call(a, a.kind === 'icon' ? reference : undefined);
        writeFileSync(join(RAW, `${a.id}.png`), buf);
        await processAsset(a, buf);
        console.log(`  ✓ ${a.out}`);
      } catch (e) {
        console.error(`  ✗ ${(e as Error).message}`);
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
}

main();
