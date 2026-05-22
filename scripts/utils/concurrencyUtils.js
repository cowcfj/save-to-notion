/**
 * Run async tasks with bounded concurrency, preserving input order in output.
 *
 * Short-circuit semantics: if any worker rejects, the returned promise rejects with
 * that error. Already-started workers continue to run in background; not-yet-dispatched
 * items are not started. Callers needing settle-all semantics should wrap the worker
 * with try/catch and return a result envelope.
 *
 * @template TIn, TOut
 * @param {TIn[]} items
 * @param {(item: TIn, index: number) => Promise<TOut>} worker
 * @param {{ concurrency: number }} options
 * @returns {Promise<TOut[]>}
 */
export async function pMap(items, worker, { concurrency }) {
  if (!Array.isArray(items)) {
    throw new TypeError('pMap: items must be an array');
  }
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError('pMap: concurrency must be a positive integer');
  }
  const results = Array.from({ length: items.length });
  let cursor = 0;
  const runnerCount = Math.min(concurrency, items.length);
  const runners = Array.from({ length: runnerCount }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}
