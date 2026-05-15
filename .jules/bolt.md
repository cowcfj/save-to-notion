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
