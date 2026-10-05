#!/usr/bin/env python3
"""
Task 79 — reorganize docs/MASTER_PLAN.md into a per-phase plan library.

Reads the ORIGINAL 4169-line docs/MASTER_PLAN.md and writes:
  docs/plans/README.md                       hub: full hyperlinked index + archive map
  docs/plans/v1/overview.md                  §0 + §P conventions + deferred backlog + closing note
  docs/plans/v1/phase-00..11-*.md            §P phase blocks (+ §Y/§Z/§BB/§CC delivery records)
  docs/plans/v1/additions/*.md               §O(2nd), §R..§X, §AA, §DD
  docs/plans/v2/overview.md                  §EE intro + v2 release
  docs/plans/v2/phase-12..22-*.md            §EE phase blocks + §FF..§PP delivery records
  docs/plans/v3/overview.md                  §QQ intro + release + candidates + non-goals
  docs/plans/v3/phase-23..33-*.md            §QQ phase blocks (PROPOSED)
  docs/plans/v3/strava-interop-research.md   §RR
  docs/MASTER_PLAN.md                        rewritten: title + core spec A–O + Plan Library + Document Map
  README.md                                  pointer patched

Conversions applied to moved bodies (single-pass, code-fence/inline-code/heading safe):
  §X / Section X references -> real markdown links
  Phase N mentions          -> links to the phase files

A guard aborts if the source is not the expected original (protects against double runs).
"""
import re
import sys
from pathlib import Path

ROOT = Path('/home/z/my-project')
SRC = ROOT / 'docs/MASTER_PLAN.md'

# ---------------------------------------------------------------- source load
text = SRC.read_text()
lines = text.split('\n')

def die(msg):
    print('FATAL:', msg)
    sys.exit(1)

if len(lines) < 4100 or not lines[0].startswith('# GPX Repair Studio'):
    die('source does not look like the original master plan (already reorganized?)')
for sentinel, ln in (('## P. Development Phases', 624), ('## QQ. v3 Roadmap', 3622), ('## RR. Strava', 4016)):
    if sentinel not in lines[ln - 1]:
        die(f'sentinel {sentinel!r} not at line {ln} — line-map drifted, aborting')

def S(a, b):
    """1-indexed inclusive slice of source lines."""
    return lines[a - 1:b]

def trim(block):
    """Drop leading/trailing blank and '---' separator lines."""
    i, j = 0, len(block)
    while i < j and block[i].strip() in ('', '---'):
        i += 1
    while j > i and block[j - 1].strip() in ('', '---'):
        j -= 1
    return block[i:j]

# ---------------------------------------------------------------- coverage
used = [False] * (len(lines) + 2)

def take(a, b, name):
    for i in range(a, b + 1):
        if used[i]:
            die(f'line {i} sliced twice (in {name})')
        used[i] = True

DROPPED = set(range(1, 8))  # original title block

def drop_heading(block, prefix, name, start_line):
    if not block or not block[0].startswith(prefix):
        die(f'{name}: first line is not a {prefix!r} heading: {block[0][:70]!r}')
    DROPPED.add(start_line)
    return block[1:]

# ---------------------------------------------------------------- anchors
def gh_anchor(h):
    s = re.sub(r'^#+\s*', '', h.strip())  # strip the ## / ### marker first
    s = s.lower()
    s = re.sub(r'[`*_]', '', s)
    out = []
    for ch in s:
        if ch.isspace():
            out.append('-')
        elif ch.isalnum() or ch in '-_':
            out.append(ch)
    return ''.join(out)

CORE_ANCHORS = {}
for h in S(26, 622):
    if h.startswith('#'):
        CORE_ANCHORS.setdefault(h, gh_anchor(h))

def ca(prefix):
    for h, a in CORE_ANCHORS.items():
        if h.startswith(prefix):
            return a
    die(f'no core heading starts with {prefix!r}')

A = {
    'K': ca('## K.'), 'K1': ca('### K-1'), 'K2': ca('### K-2'),
    'D3': ca('### D-3'), 'D4': ca('### D-4'),
    'L1': ca('### L-1'), 'L2': ca('### L-2'),
    'H': ca('## H.'), 'J1': ca('### J-1'),
    'M': ca('## M.'), 'M2': ca('### M-2'), 'M3': ca('### M-3'),
    'C2': ca('### C-2'), 'C5': ca('### C-5'),
    'G': ca('## G.'), 'F': ca('## F.'), 'I': ca('## I.'), 'N1': ca('### N-1'), 'E': ca('## E.'),
}

# ---------------------------------------------------------------- phase meta
SLUGS = {
    0: 'phase-00-foundation-tooling', 1: 'phase-01-gpx-domain-core', 2: 'phase-02-upload-inspection',
    3: 'phase-03-map-display', 4: 'phase-04-reconstruction-drawing', 5: 'phase-05-time-pace-reconstruction',
    6: 'phase-06-elevation', 7: 'phase-07-merge-export', 8: 'phase-08-mobile-accessibility',
    9: 'phase-09-performance-large-files', 10: 'phase-10-session-recovery', 11: 'phase-11-polish-docs-release',
    12: 'phase-12-quick-wins-theming', 13: 'phase-13-deep-validation-presets', 14: 'phase-14-formats-in-out',
    15: 'phase-15-stats-dashboard', 16: 'phase-16-track-surgery', 17: 'phase-17-road-snapping',
    18: 'phase-18-batch-portable-sessions', 19: 'phase-19-compare-summaries', 20: 'phase-20-command-palette',
    21: 'phase-21-internationalization', 22: 'phase-22-offline-pwa',
    23: 'phase-23-fitness-zones-metrics', 24: 'phase-24-activity-library-records', 25: 'phase-25-heatmap-personal-segments',
    26: 'phase-26-photo-geotagging', 27: 'phase-27-cue-sheets', 28: 'phase-28-waypoints-routes-authoring',
    29: 'phase-29-resample-simplify', 30: 'phase-30-tcx-fit-export', 31: 'phase-31-locales-rtl',
    32: 'phase-32-repair-forensics', 33: 'phase-33-strava-preview-upload-guard',
}
TITLES = {
    0: 'Foundation & Tooling Baseline', 1: 'GPX Domain Core (no UI)', 2: 'Upload & Inspection UI',
    3: 'Map Display', 4: 'Reconstruction Editor: Drawing', 5: 'Time & Pace Reconstruction',
    6: 'Elevation', 7: 'Merge & Export', 8: 'Mobile & Accessibility Hardening',
    9: 'Performance & Large Files', 10: 'Session Recovery (gated: build only if justified)',
    11: 'Polish, Docs & Release Prep', 12: 'Quick Wins & Theming', 13: 'Deep Validation & Repair Presets',
    14: 'Formats: In & Out', 15: 'Stats Dashboard', 16: 'Track Surgery & Input Freedom',
    17: 'Road Snapping, Opt-In', 18: 'Batch & Portable Sessions', 19: 'Compare, Summaries & Guided Flows',
    20: 'Command Palette & Shortcuts', 21: 'Internationalization', 22: 'Offline PWA & Persistent Caches',
    23: 'Fitness Zones & Metrics', 24: 'Activity Library, Records & Trends', 25: 'Heatmap & Personal Segments',
    26: 'Photo Geotagging', 27: 'Cue Sheets & Turn-by-Turn', 28: 'Waypoints & Routes Authoring',
    29: 'True Resample & Simplify', 30: 'TCX & FIT Export', 31: 'Locales & RTL',
    32: 'Repair Forensics', 33: 'Strava Preview & Upload Guard',
}
TABLE_TITLES = {n: t.replace(' (gated: build only if justified)', '') for n, t in TITLES.items()}
TABLE_TITLES[10] = 'Session Recovery (gated)'

def version_of(n):
    return 'v1' if n <= 11 else ('v2' if n <= 22 else 'v3')

MP_PREFIX = {
    'v1_phase': '../../', 'v1_add': '../../../', 'v1_ov': '../../',
    'v2_phase': '../../', 'v2_ov': '../../',
    'v3_phase': '../../', 'v3_ov': '../../', 'rr': '../../',
    'mp_core': '',
}

def mp_link(kind, anchor):
    if kind == 'mp_core':
        return f'#{anchor}'  # same-file anchor inside the master plan itself
    return f'{MP_PREFIX[kind]}MASTER_PLAN.md#{anchor}'

def phase_href(n, kind):
    f = SLUGS[n] + '.md'
    v = version_of(n)
    if kind == 'mp_core':
        return f'plans/{v}/{f}'
    if kind in ('v1_phase', 'v1_ov'):
        return f if v == 'v1' else f'../{v}/{f}'
    if kind in ('v2_phase', 'v2_ov'):
        return f if v == 'v2' else f'../{v}/{f}'
    if kind in ('v3_phase', 'v3_ov', 'rr'):
        return f if v == 'v3' else f'../{v}/{f}'
    if kind == 'v1_add':
        return f'../{f}' if v == 'v1' else f'../../{v}/{f}'
    die(f'bad kind {kind}')

# ---------------------------------------------------------------- conversion
SEC_RULES = [
    (r'Section D-6', lambda m, k: 'Section [D-3.6](#%s)' % A['D3'] if k == 'mp_core' else None),
    (r'Section N-1', lambda m, k: f'[Section N-1]({mp_link(k, A["N1"])})'),
    (r'Section K-2', lambda m, k: f'[Section K-2]({mp_link(k, A["K2"])})'),
    (r'Section K\b', lambda m, k: f'[Section K]({mp_link(k, A["K"])})'),
    (r'Section G\b', lambda m, k: f'[Section G]({mp_link(k, A["G"])})'),
    (r'Section F\b', lambda m, k: f'[Section F]({mp_link(k, A["F"])})'),
    (r'Section M\b', lambda m, k: f'[Section M]({mp_link(k, A["M"])})'),
    (r'Section I\b', lambda m, k: f'[Section I]({mp_link(k, A["I"])})'),
    (r'Section E\b', lambda m, k: f'[Section E]({mp_link(k, A["E"])})'),
    (r'§D-3\.5\b', lambda m, k: f'[§D-3.5]({mp_link(k, A["D3"])})'),
    (r'§D-4\b', lambda m, k: f'[§D-4]({mp_link(k, A["D4"])})'),
    (r'§K-1\b', lambda m, k: f'[§K-1]({mp_link(k, A["K1"])})'),
    (r'§K-2\b', lambda m, k: f'[§K-2]({mp_link(k, A["K2"])})'),
    (r'§L-1\b', lambda m, k: f'[§L-1]({mp_link(k, A["L1"])})'),
    (r'§L-2\b', lambda m, k: f'[§L-2]({mp_link(k, A["L2"])})'),
    (r'§M-2\b', lambda m, k: f'[§M-2]({mp_link(k, A["M2"])})'),
    (r'§M-3\b', lambda m, k: f'[§M-3]({mp_link(k, A["M3"])})'),
    (r'§C-2\b', lambda m, k: f'[§C-2]({mp_link(k, A["C2"])})'),
    (r'§C-5\b', lambda m, k: f'[§C-5]({mp_link(k, A["C5"])})'),
    (r'§H-7\b', lambda m, k: f'[§H-7]({mp_link(k, A["H"])})'),
    (r'§J-1\b', lambda m, k: f'[§J-1]({mp_link(k, A["J1"])})'),
    (r'§F-clean\b', lambda m, k: f'[§F-clean]({mp_link(k, A["F"])})'),
    (r'§EE \d+\.\d+(?:–\d+\.\d+)?', lambda m, k: f'[{m.group(0)}](#plan-v2-roadmap)' if k == 'v2_phase' else (f'[{m.group(0)}](../v2/overview.md)' if k in ('v3_ov', 'v3_phase') else None)),
    (r'§EE\b', lambda m, k: f'[§EE](#plan-v2-roadmap)' if k == 'v2_phase' else (f'[§EE](../v2/overview.md)' if k in ('v3_ov', 'v3_phase') else None)),
    (r'§HH\b', lambda m, k: f'[§HH](#delivery-record-task-59)' if k == 'v2_phase' else None),
    (r'§GG\b', lambda m, k: f'[§GG](phase-13-deep-validation-presets.md)' if k == 'v2_phase' else None),
    (r'§RR\b', lambda m, k: f'[§RR](strava-interop-research.md)' if k in ('v3_ov', 'v3_phase') else None),
    (r'§U\b', lambda m, k: f'[§U](pointer-modes-path-styles.md)' if k == 'v1_add' else None),
    (r'§P\b', lambda m, k: f'[§P](overview.md)' if k == 'v1_phase' else None),
    (r'§[GHK]\b', lambda m, k: f'[{m.group(0)}]({mp_link(k, A[m.group(0)[1]])})'),
]
SEC_RE = re.compile('|'.join(f'({p})' for p, _ in SEC_RULES))

PHASE_RE = re.compile(r'Phases (\d+)–(\d+)|Phase (\d+(?:/\d+)+)|Phase-(\d+)\b|Phase (\d+)(\.\d+)?(?!\d)')

def sub_sections(seg, kind):
    def repl(m):
        for i, (pat, handler) in enumerate(SEC_RULES):
            if m.group(i + 1) is not None:
                out = handler(m, kind)
                return out if out is not None else m.group(0)
        return m.group(0)
    return SEC_RE.sub(repl, seg)

def sub_phases(seg, kind, self_phase):
    def link(n, label):
        return f'[{label}]({phase_href(n, kind)})'
    def repl(m):
        if m.group(1) is not None:
            a, b = int(m.group(1)), int(m.group(2))
            return f'Phases {link(a, str(a))}–{link(b, str(b))}'
        if m.group(3) is not None:
            nums = [int(x) for x in m.group(3).split('/')]
            return 'Phase ' + '/'.join(link(n, str(n)) if n != self_phase else str(n) for n in nums)
        if m.group(4) is not None:
            n = int(m.group(4))
            if n == self_phase or not 0 <= n <= 33:
                return m.group(0)
            return link(n, f'Phase-{n}')
        n = int(m.group(5))
        sub = m.group(6) or ''
        if n == self_phase or not 0 <= n <= 33:
            return m.group(0)
        return link(n, f'Phase {n}{sub}')
    return PHASE_RE.sub(repl, seg)

def convert_body(block, kind, self_phase=None):
    out = []
    fence = False
    for line in block:
        if line.lstrip().startswith('```'):
            fence = not fence
            out.append(line)
            continue
        if fence or line.lstrip().startswith('#'):
            out.append(line)
            continue
        parts = line.split('`')
        for i in range(0, len(parts), 2):
            parts[i] = sub_phases(sub_sections(parts[i], kind), kind, self_phase)
        out.append('`'.join(parts))
    return '\n'.join(out)

# ---------------------------------------------------------------- writers
WRITTEN = {}

def write(rel, content):
    p = ROOT / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content.rstrip('\n') + '\n')
    WRITTEN[rel] = p

def nav_v1(n):
    if n == 0:
        return '[← v1 overview](overview.md) · [Phase 1 →](phase-01-gpx-domain-core.md)'
    prev = f'[← Phase {n - 1}](phase-{n - 1:02d}-{slug_tail(n - 1)}.md)'
    if n == 11:
        nxt = '[Phase 12 →](../v2/phase-12-quick-wins-theming.md)'
    else:
        nxt = f'[Phase {n + 1} →](phase-{n + 1:02d}-{slug_tail(n + 1)}.md)'
    return f'{prev} · {nxt}'

def slug_tail(n):
    return SLUGS[n].split('-', 2)[2]

# ---------------------------------------------------------------- v1 phases
V1_DETAILS = {8: ('Y', 'Task 51 backfill', 1659, 1726), 9: ('Z', 'Task 51', 1727, 1805),
              10: ('BB', 'Task 53', 1865, 1948), 11: ('CC', 'Task 54', 1949, 2017)}
V1_TASKS = {8: 'Task 51 backfill', 9: 'Task 51', 10: 'Task 53', 11: 'Task 54'}

for n in range(0, 12):
    a = 630 + 14 * n  # 630, 644, 658, ... 784
    b = a + 13
    take(a, b, f'P{n}')
    plan = trim(drop_heading(S(a, b), '###', f'P{n}', a))
    body = convert_body(plan, 'v1_phase', self_phase=n)
    title_task = f' ({V1_TASKS[n]})' if n in V1_TASKS else ''
    head = (f'# Phase {n} — {TITLES[n]}{title_task}\n\n'
            f'> **Status: DONE** — shipped in v1 (tag `v1`) · '
            f'[v1 overview](overview.md) · [plan library](../README.md) · [master plan](../../MASTER_PLAN.md)\n\n'
            f'{nav_v1(n)}\n\n## Plan\n\n')
    if n in V1_DETAILS:
        _, label, da, db = V1_DETAILS[n]
        take(da, db, f'detail-P{n}')
        detail = trim(drop_heading(S(da, db), '##', f'detail-P{n}', da))
        dbody = convert_body(detail, 'v1_phase', self_phase=n)
        content = head + body + f'\n\n## Delivery record ({label})\n\n' + dbody + '\n'
    else:
        content = head + body + '\n'
    write(f'docs/plans/v1/{SLUGS[n]}.md', content)

# ---------------------------------------------------------------- v1 additions
ADDITIONS = [
    ('The Share Card', 'Task 20 — user-requested addition', 'share-card', 820, 938, 'Share card'),
    ('The Gap Recovery Section', 'Task 26 — user-requested addition', 'gap-recovery', 939, 1120, 'Gap recovery'),
    ('The Landing Tool Cards', 'Task 42 — user-requested addition', 'landing-tool-cards', 1121, 1197, 'Landing cards'),
    ('The Merge Section', 'Task 43 — user-requested addition', 'merge-section', 1198, 1301, 'Merge section'),
    ('Pointer Modes & Path Styles', 'Tasks 44–47 — user-requested additions', 'pointer-modes-path-styles', 1302, 1388, 'Pointer modes'),
    ('The Pen System — Curve Is a Pen', 'Task 48 — user pass 48', 'pen-system', 1389, 1473, 'Pen system'),
    ('The Editor Reveal', 'Task 49 — user pass 49', 'editor-reveal', 1474, 1539, 'Editor reveal'),
    ('The Plan-a-Route Section', 'Task 50 — user-requested addition', 'plan-a-route', 1540, 1658, 'Plan-a-Route'),
    ('The Mode-Honest Editor', 'Task 52 — user pass 52', 'mode-honest-editor', 1806, 1864, 'Mode-honest editor'),
    ('Home Redesign — Compact Tiles', 'Tasks 55–56 — user-requested', 'home-redesign', 2018, 2062, 'Home redesign'),
]

for i, (title, sub, slug, a, b, short) in enumerate(ADDITIONS):
    take(a, b, slug)
    body = convert_body(trim(drop_heading(S(a, b), '##', slug, a)), 'v1_add')
    if slug == 'home-redesign':
        status = '> **Status: DONE** — user-requested addition landed just after the `v1` tag (Tasks 55–56); it set up the v2 landing work'
    else:
        status = '> **Status: DONE** — v1-era user-requested addition, shipped with v1 (tag `v1`)'
    if i == 0:
        prev = '[← v1 additions](../overview.md#user-requested-additions-v1-era)'
    else:
        prev = f'[← {ADDITIONS[i - 1][5]}]({ADDITIONS[i - 1][2]}.md)'
    if i == len(ADDITIONS) - 1:
        nxt = '[v2 overview →](../../v2/overview.md)'
    else:
        nxt = f'[{ADDITIONS[i + 1][5]} →]({ADDITIONS[i + 1][2]}.md)'
    content = (f'# {title} ({sub})\n\n{status} · '
               f'[v1 overview](../overview.md#user-requested-additions-v1-era) · [plan library](../../README.md) · '
               f'[master plan](../../../MASTER_PLAN.md)\n\n{prev} · {nxt}\n\n{body}\n')
    write(f'docs/plans/v1/additions/{slug}.md', content)

# ---------------------------------------------------------------- v2 phases
V2_BLOCKS = [(12, 2108, 2137, 'FF', 2376, 2459, 'Task 57'),
             (13, 2138, 2168, 'GG', 2460, 2556, 'Task 58'),
             (14, 2169, 2191, 'HH', 2557, 2659, 'Task 59'),
             (15, 2192, 2213, 'II', 2660, 2756, 'Task 60'),
             (16, 2214, 2234, 'JJ', 2757, 2889, 'Task 61'),
             (17, 2235, 2262, 'KK', 2890, 3017, 'Task 62'),
             (18, 2263, 2287, 'LL', 3018, 3119, 'Task 63'),
             (19, 2288, 2309, 'MM', 3120, 3262, 'Task 64'),
             (20, 2310, 2327, 'NN', 3263, 3346, 'Task 65'),
             (21, 2328, 2347, 'OO', 3347, 3468, 'Task 66'),
             (22, 2348, 2369, 'PP', 3469, 3621, 'Task 67')]

for n, pa, pb, dname, da, db, task in V2_BLOCKS:
    take(pa, pb, f'EE{n}')
    take(da, db, dname)
    plan = convert_body(trim(drop_heading(S(pa, pb), '###', f'EE{n}', pa)), 'v2_phase', self_phase=n)
    detail = convert_body(trim(drop_heading(S(da, db), '##', dname, da)), 'v2_phase', self_phase=n)
    if n == 12:
        prev = '[← Phase 11](../v1/phase-11-polish-docs-release.md)'
    else:
        prev = f'[← Phase {n - 1}](phase-{n - 1:02d}-{slug_tail(n - 1)}.md)'
    if n == 22:
        nxt = '[Phase 23 →](../v3/phase-23-fitness-zones-metrics.md)'
    else:
        nxt = f'[Phase {n + 1} →](phase-{n + 1:02d}-{slug_tail(n + 1)}.md)'
    content = (f'# Phase {n} — {TITLES[n]} ({task})\n\n'
               f'> **Status: DONE** — shipped in v2 (tag `v2`) · [v2 overview](overview.md) · '
               f'[plan library](../README.md) · [master plan](../../MASTER_PLAN.md)\n\n'
               f'{prev} · {nxt}\n\n## Plan (v2 roadmap)\n\n{plan}\n\n'
               f'## Delivery record ({task})\n\n{detail}\n')
    write(f'docs/plans/v2/{SLUGS[n]}.md', content)

# ---------------------------------------------------------------- v3 phases
V3_BLOCKS = [(23, 3650, 3695, 'Task 68'), (24, 3696, 3734, 'Task 69'), (25, 3735, 3763, 'Task 70'),
             (26, 3764, 3786, 'Task 71'), (27, 3787, 3809, 'Task 72'), (28, 3810, 3829, 'Task 73'),
             (29, 3830, 3855, 'Task 74'), (30, 3856, 3884, 'Task 75'), (31, 3885, 3905, 'Task 76'),
             (32, 3906, 3936, 'Task 77'), (33, 3937, 3985, 'Task 78')]

for n, a, b, task in V3_BLOCKS:
    take(a, b, f'QQ{n}')
    plan = convert_body(trim(drop_heading(S(a, b), '###', f'QQ{n}', a)), 'v3_phase', self_phase=n)
    if n == 23:
        prev = '[← Phase 22](../v2/phase-22-offline-pwa.md)'
    else:
        prev = f'[← Phase {n - 1}](phase-{n - 1}-{slug_tail(n - 1)}.md)'
    nxt = '[v3 overview ↑](overview.md)' if n == 33 else f'[Phase {n + 1} →](phase-{n + 1}-{slug_tail(n + 1)}.md)'
    content = (f'# Phase {n} — {TITLES[n]} ({task})\n\n'
               f'> **Status: PROPOSED — not started.** Implementation begins only on explicit user instruction, '
               f'phase by phase · [v3 overview](overview.md) · [plan library](../README.md) · [master plan](../../MASTER_PLAN.md)\n\n'
               f'{prev} · {nxt}\n\n## Proposal (v3 roadmap)\n\n{plan}\n')
    write(f'docs/plans/v3/{SLUGS[n]}.md', content)

# ---------------------------------------------------------------- strava research (§RR)
take(4016, 4169, 'RR')
rr_body = convert_body(trim(drop_heading(S(4016, 4169), '##', 'RR', 4016)), 'rr')
content = ('# Strava Interop Research — How Strava Processes Our Files (Task 68 follow-up)\n\n'
           '> **Status: research record** — grounds the v3 amendments and the Phase 33 upload guard; no implementation · '
           '[v3 overview](overview.md) · [plan library](../README.md) · [master plan](../../MASTER_PLAN.md)\n\n'
           + rr_body + '\n')
write('docs/plans/v3/strava-interop-research.md', content)

# ---------------------------------------------------------------- v1 overview
take(8, 24, 'sec0')
sec0 = convert_body(trim(drop_heading(S(8, 24), '##', 'sec0', 8)), 'v1_ov')
take(626, 628, 'P-conventions')
conventions = convert_body(trim(S(626, 628)), 'v1_ov')
take(798, 808, 'deferred')
deferred = convert_body(trim(drop_heading(S(798, 808), '###', 'deferred', 798)), 'v1_ov')
take(809, 818, 'closing')
closing = convert_body(trim(drop_heading(S(809, 818), '##', 'closing', 809)), 'v1_ov')

rows = '\n'.join(f'| {n} | [{TABLE_TITLES[n]}]({SLUGS[n]}.md) | DONE |' for n in range(0, 12))
add_rows = '\n'.join(
    f'| {sub.split(" — ")[0].replace("Tasks ", "").replace("Task ", "")} | [{title}](additions/{slug}.md) | DONE |'
    for title, sub, slug, a, b, short in ADDITIONS)

v1_overview = f"""# v1 — The Repair Workbench (Phases 0–11)

> **Status: SHIPPED** — tag `v1` · [plan library](../README.md) · [master plan](../../MASTER_PLAN.md)

v1 took the repository from a greenfield scaffold to the complete repair tool: upload and inspect, draw the missing route, estimate time, pace, and elevation, merge, and export — hardened for touch, screen readers, 100k-point files, and crashes. Ten user-requested additions landed along the way (below).

## Repository inspection findings (pre-planning)

{sec0}

## Phase conventions

{conventions}

## Phases

| # | Phase | Status |
|---|---|---|
{rows}

## User-requested additions (v1 era)

| Task(s) | Addition | Status |
|---|---|---|
{add_rows}

## Deferred backlog (explicit v1 non-goals — each requires a new requirement + plan revision)

{deferred}

Most of this backlog was later consumed by v2: formats, batch, i18n, and the offline PWA shipped as [Phase 14](../v2/phase-14-formats-in-out.md), [Phase 18](../v2/phase-18-batch-portable-sessions.md), [Phase 21](../v2/phase-21-internationalization.md), and [Phase 22](../v2/phase-22-offline-pwa.md); road-following landed as [Phase 17](../v2/phase-17-road-snapping.md); the numeric coordinate entry as [Phase 16](../v2/phase-16-track-surgery.md). The rest stays unscheduled — see the [v3 candidates](../v3/overview.md#candidates-deliberately-unscheduled).

## v1 closing note (historical)

{closing}
"""
write('docs/plans/v1/overview.md', v1_overview)

# ---------------------------------------------------------------- v2 overview
take(2063, 2107, 'EE-intro')
ee_intro = convert_body(trim(drop_heading(S(2063, 2107), '##', 'EE-intro', 2063)), 'v2_ov')
take(2370, 2375, 'v2-release')
v2_release = convert_body(trim(drop_heading(S(2370, 2375), '###', 'v2-release', 2370)), 'v2_ov')

rows2 = '\n'.join(f'| {n} | [{TABLE_TITLES[n]}]({SLUGS[n]}.md) | DONE |' for n in range(12, 23))

v2_overview = f"""# v2 — The Workbench Expansion (Phases 12–22)

> **Status: SHIPPED** — tag `v2` · [plan library](../README.md) · [master plan](../../MASTER_PLAN.md)

{ee_intro}

## Phases

| # | Phase | Status |
|---|---|---|
{rows2}

## v2 release

{v2_release}
"""
write('docs/plans/v2/overview.md', v2_overview)

# ---------------------------------------------------------------- v3 overview
take(3622, 3649, 'QQ-intro')
qq_intro = convert_body(trim(drop_heading(S(3622, 3649), '##', 'QQ-intro', 3622)), 'v3_ov')
take(3986, 3992, 'v3-release')
v3_release = convert_body(trim(drop_heading(S(3986, 3992), '###', 'v3-release', 3986)), 'v3_ov')
take(3993, 4003, 'QQ-candidates')
qq_cand = convert_body(trim(drop_heading(S(3993, 4003), '###', 'QQ-candidates', 3993)), 'v3_ov')
take(4004, 4015, 'QQ-nongoals')
qq_ng = convert_body(trim(drop_heading(S(4004, 4015), '###', 'QQ-nongoals', 4004)), 'v3_ov')

rows3 = '\n'.join(f'| {n} | [{TABLE_TITLES[n]}]({SLUGS[n]}.md) | PROPOSED |' for n in range(23, 34))

v3_overview = f"""# v3 — The Library That Means Something (Phases 23–33)

> **Status: PROPOSED — not started.** Implementation begins only on explicit user instruction, phase by phase · [plan library](../README.md) · [master plan](../../MASTER_PLAN.md)

{qq_intro}

## Phases

| # | Phase | Status |
|---|---|---|
{rows3}

## Research grounding

The [Strava interop research](strava-interop-research.md) (Task 68 follow-up) is the source behind the v3 amendments: Strava's documented zone defaults and guardrails ([Phase 23](phase-23-fitness-zones-metrics.md)), best-efforts semantics ([Phase 24](phase-24-activity-library-records.md)), segment matching and the thinning trade-off ([Phase 25](phase-25-heatmap-personal-segments.md), [Phase 29](phase-29-resample-simplify.md)), FIT device-info preservation ([Phase 30](phase-30-tcx-fit-export.md)), the rejection vocabulary ([Phase 32](phase-32-repair-forensics.md)), and the [Phase 33](phase-33-strava-preview-upload-guard.md) upload guard.

## v3 release

{v3_release}

## Candidates, deliberately unscheduled

{qq_cand}

## Standing non-goals (permanent)

{qq_ng}
"""
write('docs/plans/v3/overview.md', v3_overview)

# ---------------------------------------------------------------- hub
def vrow(n):
    return f'| {n} | [{TABLE_TITLES[n]}](v{version_of(n)[1]}/{SLUGS[n]}.md) | {"DONE" if n <= 22 else "PROPOSED"} |'

hub_rows1 = '\n'.join(vrow(n) for n in range(0, 12))
hub_rows2 = '\n'.join(vrow(n) for n in range(12, 23))
hub_rows3 = '\n'.join(vrow(n) for n in range(23, 34))
hub_adds = '\n'.join(
    f'| {sub.split(" — ")[0].replace("Tasks ", "").replace("Task ", "")} | [{title}](v1/additions/{slug}.md) | DONE |'
    for title, sub, slug, a, b, short in ADDITIONS)

hub = f"""# Plan Library

Every phase of GPX Repair Studio — planned, delivered, or proposed — lives in this folder as its own markdown file: the plan, the delivery record, and the verification story. The product's constitution (overview, requirements, architecture, strategies) stays in the [master plan](../MASTER_PLAN.md).

Each file carries breadcrumbs (its version overview · this library · the master plan); phase files chain prev/next across version boundaries, so the whole history reads cover to cover.

## Status at a glance

| Version | Phases | Status | Entry point |
|---|---|---|---|
| v1 — the repair workbench | 0–11 + ten additions | **SHIPPED** — tag `v1` | [v1 overview](v1/overview.md) |
| v2 — the workbench expansion | 12–22 | **SHIPPED** — tag `v2` | [v2 overview](v2/overview.md) |
| v3 — the library that means something | 23–33 | **PROPOSED** — not started | [v3 overview](v3/overview.md) |
| Strava interop research | — | research record grounding v3 | [strava-interop-research.md](v3/strava-interop-research.md) |

## v1 — phases

| # | Phase | Status |
|---|---|---|
{hub_rows1}

## v1 — user-requested additions

| Task(s) | Addition | Status |
|---|---|---|
{hub_adds}

## v2 — phases

| # | Phase | Status |
|---|---|---|
{hub_rows2}

## v3 — phases (proposed)

| # | Phase | Status |
|---|---|---|
{hub_rows3}

## Where the old MASTER_PLAN sections went

Historical worklog entries and source-code comments cite the master plan by section letter; this map resolves every citation:

| Old section | New home |
|---|---|
| §0 Repository inspection findings | [v1/overview.md](v1/overview.md) |
| §P Development phases (incl. conventions, deferred backlog, closing note) | [v1/overview.md](v1/overview.md) + the twelve [v1 phase files](v1/overview.md#phases) |
| §O (the second §O — share card), §R, §S, §T, §U, §V, §W, §X | [plans/v1/additions/](v1/overview.md#user-requested-additions-v1-era) |
| §Y, §Z, §BB, §CC — phase 8–11 delivery records | merged into [phase-08](v1/phase-08-mobile-accessibility.md), [phase-09](v1/phase-09-performance-large-files.md), [phase-10](v1/phase-10-session-recovery.md), [phase-11](v1/phase-11-polish-docs-release.md) |
| §AA Mode-honest editor, §DD Home redesign | [plans/v1/additions/](v1/overview.md#user-requested-additions-v1-era) |
| §EE V2 roadmap (incl. per-phase blocks + v2 release) | [v2/overview.md](v2/overview.md) + the eleven [v2 phase files](v2/overview.md#phases) |
| §FF–§PP — v2 phase delivery records | the [v2 phase files](v2/overview.md#phases) |
| §QQ V3 roadmap (incl. release, candidates, non-goals) | [v3/overview.md](v3/overview.md) + the eleven [v3 phase files](v3/overview.md#phases) |
| §RR Strava interop research | [v3/strava-interop-research.md](v3/strava-interop-research.md) |

The first §O — Technical Risks — stays in the master plan as [Section O](../MASTER_PLAN.md#o-technical-risks). (`download/MASTER_PLAN.md` is a frozen copy of the original v1-era planning snapshot, kept as a historical deliverable.)
"""
write('docs/plans/README.md', hub)

# ---------------------------------------------------------------- MASTER_PLAN rewrite
take(26, 622, 'mp-core')
DROPPED.add(624)  # the '## P. Development Phases' heading — its content moved to v1
mp_core = convert_body(trim(S(26, 622)), 'mp_core')

mp_header = """# GPX Repair Studio — Master Plan

**Working title:** GPX Repair Studio (placeholder — user may rename)
**Status:** the living core spec (Sections A–O below) plus the index into the plan library. v1 **shipped** — tag `v1`. v2 **shipped** — tag `v2`. v3 **proposed, not started**.

This file is the product's constitution: overview, functional and non-functional requirements, architecture, technology decisions, data model, and the processing, timestamp, elevation, statistics, privacy, and testing strategies. Every phase — its plan, its delivery record, its verification story — lives in the **[plan library](plans/README.md)** (`docs/plans/`), one markdown file per phase, hyperlinked throughout:

- [v1 — the repair workbench](plans/v1/overview.md): phases 0–11 plus ten user-requested additions — shipped, tag `v1`
- [v2 — the workbench expansion](plans/v2/overview.md): phases 12–22 — shipped, tag `v2`
- [v3 — the library that means something](plans/v3/overview.md): phases 23–33 — proposed, not started
- [Strava interop research](plans/v3/strava-interop-research.md): how Strava processes our files — grounds the v3 metrics

---

"""

mp_tail = """

---

## Plan Library — Where the Phases Live

| Version | Phases | Status | Entry point |
|---|---|---|---|
| v1 — the repair workbench | 0–11, plus ten user-requested additions | **SHIPPED** — tag `v1` | [v1 overview](plans/v1/overview.md) |
| v2 — the workbench expansion | 12–22 | **SHIPPED** — tag `v2` | [v2 overview](plans/v2/overview.md) |
| v3 — the library that means something | 23–33 | **PROPOSED** — not started | [v3 overview](plans/v3/overview.md) |

The full index — every phase file, every addition, the research record — lives in the [plan library hub](plans/README.md). Each file carries breadcrumbs back to its overview and to this plan; phase files chain previous/next across version boundaries.

## Document Map — Old Section Letters → New Homes

The master plan grew by lettered sections through v1 and v2. Those sections now live in the plan library; this map keeps every historical citation resolvable (the worklog and many source-file comments cite these letters):

| Old section | New home |
|---|---|
| §0 Repository inspection findings | [v1 overview](plans/v1/overview.md) |
| §P Development phases (incl. conventions, deferred backlog, closing note) | [v1 overview](plans/v1/overview.md) + the twelve `plans/v1/phase-*.md` files |
| §O (the second §O — share card), §R, §S, §T, §U, §V, §W, §X | [`plans/v1/additions/`](plans/v1/overview.md#user-requested-additions-v1-era) |
| §Y, §Z, §BB, §CC — phase 8–11 delivery records | merged into [phase-08](plans/v1/phase-08-mobile-accessibility.md), [phase-09](plans/v1/phase-09-performance-large-files.md), [phase-10](plans/v1/phase-10-session-recovery.md), [phase-11](plans/v1/phase-11-polish-docs-release.md) |
| §AA Mode-honest editor, §DD Home redesign | [`plans/v1/additions/`](plans/v1/overview.md#user-requested-additions-v1-era) |
| §EE V2 roadmap (incl. per-phase blocks + v2 release) | [v2 overview](plans/v2/overview.md) + the eleven `plans/v2/phase-*.md` files |
| §FF–§PP — v2 phase delivery records | the `plans/v2/phase-12…22-*.md` files |
| §QQ V3 roadmap (incl. release, candidates, non-goals) | [v3 overview](plans/v3/overview.md) + the eleven `plans/v3/phase-*.md` files |
| §RR Strava interop research | [plans/v3/strava-interop-research.md](plans/v3/strava-interop-research.md) |

The first §O — Technical Risks — stays in this file as [Section O](#o-technical-risks). (`download/MASTER_PLAN.md` remains a frozen copy of the original v1-era planning snapshot, kept as a historical deliverable.)

## Closing Note

This file is the constitution and evolves with the product; the phases live and evolve in the [plan library](plans/README.md). The discipline is unchanged since day one: nothing is built except on explicit user instruction, phase by phase, each phase ending committed and green.
"""

write('docs/MASTER_PLAN.md', mp_header + mp_core + mp_tail)

# ---------------------------------------------------------------- README patch
readme_p = ROOT / 'README.md'
readme = readme_p.read_text()
old_line = '`docs/MASTER_PLAN.md` is the full planning document — every phase\'s scope, contracts, and shipped-behavior addenda (sections A–BC).'
new_line = ('`docs/MASTER_PLAN.md` is the living core spec — overview, requirements, architecture, strategies (sections A–O). '
            'Every phase, planned and delivered, has its own file in the **plan library**, [`docs/plans/`](docs/plans/README.md), '
            'hyperlinked from each version\'s overview ([v1](docs/plans/v1/overview.md) · [v2](docs/plans/v2/overview.md) · '
            '[v3 proposed](docs/plans/v3/overview.md)).')
if old_line not in readme:
    die('README pointer line not found — patch aborted')
readme_p.write_text(readme.replace(old_line, new_line))
print('README.md patched')

# ---------------------------------------------------------------- coverage check
missing = []
for i in range(1, len(lines) + 1):
    if used[i] or i in DROPPED:
        continue
    if lines[i - 1].strip() in ('', '---'):
        continue
    missing.append((i, lines[i - 1][:60]))
if missing:
    print('COVERAGE FAIL — uncovered non-blank lines:')
    for i, l in missing[:40]:
        print(f'  {i}: {l}')
    sys.exit(1)
print(f'coverage OK — every non-blank line of the original is placed or deliberately dropped '
      f'({len(DROPPED)} dropped heading/title lines)')

# ---------------------------------------------------------------- link validation
def anchors_of(path):
    res = set()
    fence = False
    for h in path.read_text().split('\n'):
        if h.lstrip().startswith('```'):
            fence = not fence
            continue
        if fence or not h.startswith('#'):
            continue
        res.add(gh_anchor(h))
    return res

ANCHOR_CACHE = {}

def check_links(rel, p):
    errors = []
    fence = False
    for ln_no, ln in enumerate(p.read_text().split('\n'), 1):
        if ln.lstrip().startswith('```'):
            fence = not fence
            continue
        if fence:
            continue
        for m in re.finditer(r'\]\(([^)#\s]+)?(#[^)\s]+)?\)', ln):
            tgt, anchor = m.group(1), m.group(2)
            if tgt and (tgt.startswith('http://') or tgt.startswith('https://')):
                continue
            if tgt is None and anchor is None:
                continue
            if tgt is None:
                target_p = p
            else:
                target_p = (p.parent / tgt).resolve()
                if not target_p.exists():
                    errors.append(f'{rel}:{ln_no}: missing file {tgt}')
                    continue
            if anchor:
                if target_p not in ANCHOR_CACHE:
                    ANCHOR_CACHE[target_p] = anchors_of(target_p)
                if anchor[1:] not in ANCHOR_CACHE[target_p]:
                    errors.append(f'{rel}:{ln_no}: anchor {anchor} not in {tgt or rel}')
    return errors

all_errors = []
for rel, p in sorted(WRITTEN.items()):
    all_errors += check_links(rel, p)
all_errors += check_links('README.md', ROOT / 'README.md')
if all_errors:
    print('LINK CHECK FAIL:')
    for e in all_errors[:60]:
        print(' ', e)
    sys.exit(1)
print('link check OK — every relative link and anchor resolves')

# ---------------------------------------------------------------- leftover refs
print('\nleftover §/Section references (review — plain-text mentions are fine):')
n_left = 0
for rel, p in sorted(WRITTEN.items()):
    fence = False
    for ln_no, ln in enumerate(p.read_text().split('\n'), 1):
        if ln.lstrip().startswith('```'):
            fence = not fence
            continue
        if fence:
            continue
        for m in re.finditer(r'§[A-Z]|Section [A-Z]', ln):
            if f'[{m.group(0)}' in ln or f']({m.group(0)}' in ln:
                continue  # already part of a link label
            n_left += 1
            print(f'  {rel}:{ln_no}: ...{ln[max(0, m.start()-30):m.end()+30]}...')
print(f'  ({n_left} leftover mentions)')

print(f'\nDONE — {len(WRITTEN)} files written:')
for rel, p in sorted(WRITTEN.items()):
    n = len(p.read_text().split('\n'))
    print(f'  {rel} ({n} lines)')
