/**
 * Strava interop research — pass 3 (sitemap-driven, fixed URL list)
 * The core mechanics: distance/elevation math, zones, best efforts,
 * segments, fitness, and the upload-rejection articles (our repair domain).
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const OUT_DIR = '/home/z/my-project/research/strava-interop';
const TMP_DIR = join(OUT_DIR, '.raw3');
mkdirSync(TMP_DIR, { recursive: true });

const IDS = [
  '15401893-how-distance-is-calculated',
  '15401823-strava-s-elevation-basemap',
  '15401909-elevation',
  '15401661-how-do-best-efforts-work-for-running-on-strava',
  '15401646-what-are-best-efforts-on-strava',
  '15401569-training-zones-on-strava',
  '15401923-how-do-i-customize-my-heart-rate-zones-on-strava',
  '15402116-how-does-pace-zone-analysis-work-on-strava',
  '15402042-what-s-a-segment',
  '15401945-strava-segments',
  '15401957-segment-matching-issues',
  '15401842-activity-split-tool',
  '15401762-heart-rate',
  '15402161-power',
  '15402032-how-fitness-freshness-is-calculated',
  '15401794-relative-effort',
  '15402041-all-time-prs',
  '15401813-how-does-strava-calculate-activity-time',
  '15401755-how-do-i-resolve-an-activity-flag-on-strava',
  '15402151-why-does-strava-say-my-garmin-file-has-corrupted-time-data',
  '15402153-why-does-strava-say-time-information-is-missing-from-my-file',
  '15402162-why-does-strava-say-my-gps-file-has-improperly-formatted-data',
  '15402183-why-does-strava-say-my-fit-file-is-corrupted',
  '15402177-why-won-t-my-course-file-upload-to-strava',
  '15402160-why-won-t-my-empty-file-upload-to-strava',
  '15402061-how-do-i-create-a-route-from-a-gpx-file',
  '15401846-why-does-my-activity-have-the-wrong-date-or-start-time',
  '15402094-how-do-i-use-effort-comparison-on-strava',
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

const fetched = [];
for (const id of IDS) {
  const url = `https://support.strava.com/en-us/articles/${id}`;
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
    const slug = slugify(d?.title || id);
    const file = join(OUT_DIR, `${slug}.txt`);
    writeFileSync(file, `SOURCE: ${url}\nTITLE: ${d?.title || url}\n---\n${text}\n`);
    fetched.push({ title: d?.title, url, file, chars: text.length });
    console.log(`[fetch] OK ${slug} (${text.length})`);
  } catch (e) {
    console.log(`[fetch-fail] ${url}: ${e.message}`);
    fetched.push({ title: id, url, file: null, error: e.message });
  }
}

writeFileSync(join(OUT_DIR, 'INDEX-pass3.md'),
  `# Pass 3 — ${new Date().toISOString()}\n\n` +
  fetched.map((f) => `- ${f.file ? `${f.title} (${f.chars}) -> ${f.file}` : `${f.title} FAILED: ${f.error}`}\n  ${f.url}`).join('\n') + '\n');
console.log(`\n[done] ${fetched.filter((f) => f.file).length}/${IDS.length} -> INDEX-pass3.md`);
