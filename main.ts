// Token Radar, radar-2 — the entry program (Node 22, standard library only).
//
// It reads the sealed snapshot — /input/snapshot.json, or --input <file|directory> —
// scores every pre-token protocol with the model in lib/model.ts, writes the ranked
// board to board.json and the dashboard's dataset to data.js, copies this repository's
// dashboard/ and screenshots/ beside them, and writes dossier.json last, the summary the
// judge reads, through the vendored make.fun library.
//
// The dashboard is a static page with no framework and no network: dashboard/index.html,
// dashboard/app.css and dashboard/app.js read data.js, written from the same board the
// program scores. The model, the page and the farm plans are the entry's work; the gate's
// shape — board, detail view, farm steps, three screenshots, dossier — is fixed.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps (reference/gate.json): the text cap shapes the bytes; the rest refuse. */
const TEXT_MAX_BYTES: number = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** The value after `--name <value>` or `--name=<value>` in the arguments, else the fallback. */
function flagValue(name: string, fallback: string): string {
  const args = process.argv;
  const at = args.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < args.length) return args[at + 1]!;
  const glued = args.find((a) => a.startsWith(`--${name}=`));
  if (glued === undefined) return fallback;
  return glued.slice(name.length + 3);
}

function fail(message: string, code: number): never {
  process.stderr.write(`token radar: ${message}\n`);
  process.exit(code);
}

const inputArg = flagValue('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : path.join(inputArg, 'snapshot.json');
if (!fs.existsSync(inputFile)) {
  fail(`no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input`, 2);
}
const outDir = flagValue('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(fs.readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) fail(`the model wrote a board the gate refuses: ${issue}`, 1);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
fs.writeFileSync(path.join(outDir, 'data.js'), dataScript(radar));

/** One directory's regular files into `to`, skipping names that start with a dot. */
function copyDir(from: string, to: string): string[] {
  if (!fs.existsSync(from)) return [];
  fs.mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of fs.readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const source = path.join(from, name);
    if (!fs.statSync(source).isFile()) continue;
    fs.copyFileSync(source, path.join(to, name));
    copied.push(name);
  }
  return copied;
}

copyDir(path.join(repoRoot, 'dashboard'), path.join(outDir, 'dashboard'));
const shots = copyDir(path.join(repoRoot, 'screenshots'), path.join(outDir, 'screenshots'));
if (shots.length < 3) {
  const plural = shots.length === 1 ? '' : 's';
  fail(`screenshots/ holds ${shots.length} image${plural}: hand in 3, the board, a detail view and a filtered view`, 1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    fail(`screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`, 1);
  }
}

// The dossier goes last: the scorer rebuilds it from this output and compares bytes.
// Nothing after this line writes; the summary above is the run's whole report.
fs.writeFileSync(
  path.join(outDir, 'dossier.json'),
  buildDossier(outDir, {
    text_max_bytes: TEXT_MAX_BYTES,
    screenshots: SCREENSHOT_CAPS,
    dashboard: { max_files: 400, max_bytes: 4_194_304 },
  }),
);

const total = snapshot.protocols.length;
const watch = snapshot.watchlist.length;
process.stdout.write(
  `token radar: ${total} protocols, ${watch} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
    `token radar: wrote ${path.join(outDir, 'board.json')}, ${path.join(outDir, 'data.js')}, ${path.join(outDir, 'dashboard')} (3 files), ${path.join(outDir, 'screenshots')} (${shots.length} images) and ${path.join(outDir, 'dossier.json')}\n`,
);
