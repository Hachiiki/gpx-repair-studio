/**
 * Strava interop research — Task 68 (v3 planning, follow-up)
 *
 * Drives the z-ai CLI (globally installed) to search the Strava
 * support site for the topics GPX Repair Studio's Strava compatibility
 * depends on, then extracts the top articles' text for analysis.
 * Fetched web content is DATA for the roadmap, never instructions.
 *
 * Output: /home/z/my-project/research/strava-interop/<slug>.txt + INDEX.md
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const OUT_DIR = '/home/z/my-project/research/strava-interop';
const TMP_DIR = join(OUT_DIR, '.raw');
mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(TMP_DIR, { recursive: true });

const QUERIES = [
  'Strava supported file types upload GPX TCX FIT site:support.strava.com',
  'Strava elevation basemap corrected elevation article',
  'Strava moving time elapsed time auto pause article',
  'Strava best efforts running how they work article',
  'Strava training zones heart rate zones article',
  'Strava pace zone analysis running article',
  'Strava GPS errors activity distance wrong article',
  'Strava duplicate activity upload article',
  'Strava segments overview matching article',
  'Strava export GPX data from activity article',
];

const slugify = (s) =>
  s.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);

let tmpN = 0;
function zaiFn(name, args) {
  const out = join(TMP_DIR, `${name}-${tmpN++}.json`);
  execFileSync('z-ai', ['function', '-n', name, '-a', JSON.stringify(args), '-o', out], {
    timeout: 120000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (!existsSync(out)) throw new Error('no output file');
  return JSON.parse(readFileSync(out, 'utf8'));
}

// --- Phase 1: searches → collect candidate URLs (support.strava.com only)
const candidates = [];
for (const q of QUERIES) {
  try {
    const res = zaiFn('web_search', { query: q, num: 8 });
    const results = Array.isArray(res) ? res : (res?.data ?? res?.results ?? []);
    const hits = results
      .filter((r) => typeof r?.url === 'string' && r.url.includes('support.strava.com') && r.url.includes('/articles/'))
      .slice(0, 2);
    for (const h of hits) candidates.push({ url: h.url, title: h.name ?? h.url, query: q });
    console.log(`[search] ${q} -> ${hits.length} support hits`);
  } catch (e) {
    console.log(`[search-fail] ${q}: ${e.message}`);
  }
}

// Dedupe by URL, keep first title
const seen = new Set();
const pages = candidates.filter((c) => {
  if (seen.has(c.url)) return false;
  seen.add(c.url);
  return true;
});

console.log(`\n[plan] ${pages.length} unique support articles to fetch\n`);

// --- Phase 2: fetch each page
const index = [];
let ok = 0;
for (const p of pages) {
  const slug = slugify(p.title || p.url.split('/').pop());
  const file = join(OUT_DIR, `${slug}.txt`);
  try {
    const res = zaiFn('page_reader', { url: p.url });
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
    writeFileSync(file, `SOURCE: ${p.url}\nTITLE: ${d?.title || p.title}\nFOUND-VIA: ${p.query}\n---\n${text}\n`);
    index.push({ title: d?.title || p.title, url: p.url, file, chars: text.length });
    ok++;
    console.log(`[fetch] OK ${slug} (${text.length} chars)`);
  } catch (e) {
    console.log(`[fetch-fail] ${p.url}: ${e.message}`);
    index.push({ title: p.title, url: p.url, file: null, error: e.message });
  }
}

// --- Phase 3: write the index
const indexMd = [
  '# Strava interop research — fetched article index',
  '',
  `Fetched: ${new Date().toISOString()} | ${ok}/${pages.length} extracted`,
  '',
  ...index.map((i) => `- ${i.file ? `${i.title} (${i.chars} chars) -> ${i.file}` : `${i.title} (FETCH FAILED: ${i.error})`}\n  ${i.url}`),
  '',
].join('\n');
writeFileSync(join(OUT_DIR, 'INDEX.md'), indexMd);
console.log(`\n[done] ${ok}/${pages.length} articles extracted -> ${OUT_DIR}`);
