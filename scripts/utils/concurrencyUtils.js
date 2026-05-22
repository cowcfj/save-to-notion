/**
 * 以受限併發數執行 async 任務,輸出順序與輸入一致。
 *
 * Short-circuit 語義:任一 worker reject 時,回傳的 promise 立即以該錯誤 reject。
 * 已啟動的 worker 會繼續跑完(無法外部中止 in-flight 工作),但尚未派發的 item
 * 不會再被啟動。需要 settle-all 語義的呼叫端應在 worker 內自行 try/catch 並回傳
 * result envelope。
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
  let failed = false;
  const runnerCount = Math.min(concurrency, items.length);
  const runners = Array.from({ length: runnerCount }, async () => {
    while (!failed && cursor < items.length) {
      const i = cursor++;
      try {
        results[i] = await worker(items[i], i);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  });
  await Promise.all(runners);
  return results;
}
