/**
 * Strava interop research — pass 2 (targeted fetches + refined searches)
 * Known-good URLs from pass-1 link mining, plus simpler search phrasings
 * for the metric articles that pass 1 missed.
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const OUT_DIR = '/home/z/my-project/research/strava-interop';
const TMP_DIR = join(OUT_DIR, '.raw2');
mkdirSync(TMP_DIR, { recursive: true });

const KNOWN = [
  'https://support.strava.com/en-us/articles/15401839-how-do-i-merge-or-combine-activities-on-strava',
  'https://support.strava.com/en-us/articles/15402173-how-do-i-bulk-upload-activities-to-strava',
  'https://support.strava.com/en-us/articles/15402129-how-do-i-download-a-gpx-route-from-other-athletes-activities-on-strava',
];

const QUERIES = [
  '"How Distance is Calculated" Strava support',
  'Strava "Elevation for Your Activities" support article',
  'Strava "Best Efforts" running support article',
  'Strava "Training Zones" heart rate support article',
  'Strava "Pace Zone Analysis" support article',
  'Strava GPS errors fix activity support article',
  'Strava "What is a Segment" support article',
  'Strava heart rate data file support article sensors',
  'Strava "Elevation Basemap" support',
];

const slugify = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80);

let tmpN = 0;
function zaiFn(name, args) {
  const out = join(TMP_DIR, `${name}-${tmpN++}.json`);
  execFileSync('z-ai', ['function', '-n', name, '-a', JSON.stringify(args), '-o', out], {
    timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (!existsSync(out)) throw new Error('no output file');
  return JSON.parse(readFileSync(out, 'utf8'));
}

const found = new Set(KNOWN);
const candidates = [...KNOWN];
for (const q of QUERIES) {
  try {
    const res = zaiFn('web_search', { query: q, num: 10 });
    const results = Array.isArray(res) ? res : (res?.data ?? res?.results ?? []);
    const hits = results
      .filter((r) => typeof r?.url === 'string' && r.url.includes('support.strava.com') && r.url.includes('/articles/'))
      .filter((r) => /\/(en-us|en)\//.test(r.url))
      .slice(0, 2);
    for (const h of hits)
      if (!found.has(h.url)) { found.add(h.url); candidates.push(h.url); }
    console.log(`[search] ${q} -> ${hits.length} hits`);
  } catch (e) {
    console.log(`[search-fail] ${q}: ${e.message}`);
  }
}

console.log(`\n[plan] ${candidates.length} URLs to fetch\n`);

const fetched = [];
for (const url of candidates) {
  try {
    const res = zaiFn('page_reader', { url });
    const d = res?.data ?? res ?? {};
    let text = typeof d?.text === 'string' ? d.text : '';
    if (!text && typeof d?.html === 'string') {
      text = d.html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ');
    }
    text = (text || '').trim();
    if (!text || text.length < 200) throw new Error('extraction too thin');
    const slug = slugify(d?.title || url.split('/').pop());
    const file = join(OUT_DIR, `${slug}.txt`);
    writeFileSync(file, `SOURCE: ${url}\nTITLE: ${d?.title || url}\n---\n${text}\n`);
    fetched.push({ title: d?.title, url, file, chars: text.length });
    console.log(`[fetch] OK ${slug} (${text.length})`);
  } catch (e) {
    console.log(`[fetch-fail] ${url}: ${e.message}`);
  }
}

writeFileSync(join(OUT_DIR, 'INDEX-pass2.md'),
  `# Pass 2 — ${new Date().toISOString()}\n\n` +
  fetched.map((f) => `- ${f.title} (${f.chars}) -> ${f.file}\n  ${f.url}`).join('\n') + '\n');
console.log(`\n[done] ${fetched.length} fetched -> INDEX-pass2.md`);
