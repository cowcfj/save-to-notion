# Bolt Learnings

## 2024-05-18 - Avoid array allocation in page complexity detection

**Learning:** Using `String.prototype.split(/\s+/)` to count words on a large string (like a full page body) causes an expensive memory allocation creating massive arrays, blocking the main thread during content extraction.
**Action:** Instead of regex splits, use a fast `charCodeAt` / `codePointAt` ASCII loop to find spaces (`<= 32`) and manually count words, reducing the time from > 2 seconds to < 400ms on large documents.

## 2024-05-18 - Consider Non-Breaking Spaces in word counts

**Learning:** The regex `/\s+/` matches Non-Breaking Spaces (`\u00A0` / 160) which standard ASCII space checks (`<= 32`) miss. When optimizing word-counting loops, it is important to include 160 (`charCodeAt(i) === 160`) to avoid skewing word-count heuristics on heavily formatted text.
**Action:** When manually parsing words and spaces in JS strings, explicitly check for NBSP (`160`) alongside standard control and space characters (`<= 32`).

## 2025-05-14 - Optimized Srcset Fallback Logic

**Learning:** Chained array operations like `.map().filter()` create intermediate arrays, which can be inefficient in performance-critical paths. Iterating backwards with a `for` loop to find the last valid element is significantly faster (over 60% improvement in isolated benchmarks) and avoids unnecessary allocations.
**Action:** Prefer single-pass loops or specialized array methods over chaining when performance is a concern, especially for utility functions used frequently.

## 2025-05-19 - Replace chained array allocation with single-pass iteration

**Learning:** When iterating over user content to find or extract metadata (like URLs), chained array operations like `.filter().map()` allocate unnecessary intermediate arrays. This overhead becomes measurable in critical hot paths like `ImageCollector.js`, where hundreds of image nodes might be processed.
**Action:** Prefer `for...of` loops over `.map().filter()` when gathering data into a `Set` or when avoiding multiple passes in performance-critical code.

## 2025-05-19 - Parallelize independent batch operations (with critical caveats)

**Learning:** A sequential `await` loop (`for...of` with `await` inside) for _truly_ independent I/O or network tasks blocks unnecessarily. In an isolated mock benchmark of 20 tasks at 50ms each (`setTimeout` only — no storage, no CPU work, no shared state), sequential took ~1000ms vs. parallel ~50ms. **Real-world speedups are usually much smaller (often 2~3×, not 20×) once CPU work, IPC serialization, and shared-state contention are factored in.**

**Critical caveats — read before applying:**

1. **"Independent" must be verified, not assumed.** If the parallel tasks read/write a shared resource (same chrome.storage key, same cache entry, same DB row, same external rate-limit pool), naive `Promise.all` introduces **race conditions**. Example from PR #565: multiple input URLs normalized to the same `computeStableUrl()` result caused parallel `migrateBatchUrl` calls to read `null` simultaneously and double-write, losing highlights. Fix: **group by shared key, sequential within group, parallel across groups.**

2. **Bound the concurrency.** `Promise.all(arr.map(...))` with N=1000 will fan out 1000 in-flight tasks, spike service worker memory, saturate IPC queues, and blow past API rate limits. Use a worker-pool / `pLimit` pattern with a sane cap (e.g. 5).

3. **Preserve output order if callers expect it.** `urls.map(async u => { results.push(...) })` pushes in **completion order**, not input order — a silent behavior change vs. `for...of`. Use `const details = await Promise.all(urls.map(processOne))` and assign in one shot, or collect into a `Map<input, result>` and re-order at the end.

4. **Storage-bound and CPU-bound work won't speed up linearly.** chrome.storage IPC is serialized at the browser-process boundary; LevelDB writes serialize internally. JS is single-threaded for any CPU portion (JSON parse, normalization). Amdahl's Law caps the realistic speedup well below the mock-benchmark headline number.

**Action:** When handling a batch of asynchronous operations, **first** verify independence (no shared keys, caches, or rate-limit pools), **then** apply parallelization with: (a) grouping by any shared key for serial execution within groups, (b) bounded concurrency across groups, (c) explicit output-order preservation. **Never** parallelize storage-mutating operations without a grouping or locking strategy. Treat mock-benchmark numbers as an upper bound, not an expectation.
