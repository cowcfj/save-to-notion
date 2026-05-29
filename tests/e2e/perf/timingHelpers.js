/**
 * E2E Performance Timing Helpers
 *
 * Local-only utilities for collecting timing samples and writing baseline data
 * to `.tmp/perf-baseline.json`. Designed to be called from Playwright spec files
 * under `tests/e2e/perf/`.
 *
 * Contract:
 * - Never throw on baseline read miss; first run simply records.
 * - Never call `expect()` against absolute ms — only print delta vs baseline.
 * - Discard 1 warm-up sample so we measure steady-state cost.
 */

import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const BASELINE_PATH = path.join(REPO_ROOT, '.tmp', 'perf-baseline.json');
const SCHEMA_VERSION = 1;

function median(numbers) {
  if (numbers.length === 0) {
    return 0;
  }
  const sorted = numbers.toSorted((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function percentile(numbers, p) {
  if (numbers.length === 0) {
    return 0;
  }
  const sorted = numbers.toSorted((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, rank))];
}

function getGitSha() {
  try {
    const headPath = path.join(REPO_ROOT, '.git', 'HEAD');
    const headRaw = fs.readFileSync(headPath, 'utf8').trim();
    if (!headRaw.startsWith('ref:')) {
      return headRaw.slice(0, 7);
    }
    const refPath = path.join(REPO_ROOT, '.git', headRaw.slice(5).trim());
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    return fs.readFileSync(refPath, 'utf8').trim().slice(0, 7);
  } catch {
    return 'unknown';
  }
}

/**
 * Run `asyncFn` (n + 1) times, discard the first as warm-up.
 *
 * @param {string} name - sample bucket name (e.g. 'save_round_trip')
 * @param {() => Promise<void>} asyncFn - work to time per iteration
 * @param {number} n - number of recorded samples (default 10)
 * @returns {Promise<{name: string, n: number, median_ms: number, p95_ms: number, samples: number[]}>}
 */
export async function measureN(name, asyncFn, n = 10) {
  // Warm-up: discard timing, but still execute side effects.
  await asyncFn();

  const samples = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    await asyncFn();
    samples.push(performance.now() - t0);
  }

  return summarize(name, samples);
}

/**
 * Build a stats record from raw ms samples (e.g. samples collected page-side
 * via chrome.scripting.executeScript). Caller is responsible for warm-up.
 *
 * @param {string} name
 * @param {number[]} samples - array of millisecond durations
 * @returns {{name: string, n: number, median_ms: number, p95_ms: number, samples: number[]}}
 */
export function summarize(name, samples) {
  return {
    name,
    n: samples.length,
    median_ms: Math.round(median(samples) * 100) / 100,
    p95_ms: Math.round(percentile(samples, 95) * 100) / 100,
    samples: samples.map(s => Math.round(s * 100) / 100),
  };
}

function readBaseline() {
  try {
    const raw = fs.readFileSync(BASELINE_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Merge `stats` into `.tmp/perf-baseline.json` under `samples[name]`.
 * Re-records `recorded_at` and `git_sha` per write.
 */
export function writeBaseline(stats) {
  fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
  const existing = readBaseline() ?? {
    schema_version: SCHEMA_VERSION,
    recorded_at: '',
    git_sha: '',
    samples: {},
  };

  existing.schema_version = SCHEMA_VERSION;
  existing.recorded_at = new Date().toISOString();
  existing.git_sha = getGitSha();
  existing.samples[stats.name] = {
    n: stats.n,
    median_ms: stats.median_ms,
    p95_ms: stats.p95_ms,
  };

  fs.writeFileSync(BASELINE_PATH, JSON.stringify(existing, null, 2));
}

/**
 * Print current run vs baseline median to console (no expect / no fail).
 */
export function printDelta(stats) {
  const baseline = readBaseline();
  const prev = baseline?.samples?.[stats.name];

  const header = `[perf] ${stats.name}`;
  const current = `median=${stats.median_ms}ms  p95=${stats.p95_ms}ms  n=${stats.n}`;

  if (!prev) {
    console.log(`${header}  ${current}  (no baseline yet)`);
    return;
  }

  const deltaMs = stats.median_ms - prev.median_ms;
  const deltaPct = prev.median_ms > 0 ? (deltaMs / prev.median_ms) * 100 : 0;
  const sign = deltaMs >= 0 ? '+' : '';
  const baseLine = `baseline=${prev.median_ms}ms`;
  const diff = `Δ=${sign}${deltaMs.toFixed(2)}ms (${sign}${deltaPct.toFixed(1)}%)`;
  console.log(`${header}  ${current}  ${baseLine}  ${diff}`);
}
