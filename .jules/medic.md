
## 2026-07-15 — Next.js Extractor Fetch Timeout
**Symptom:** The extraction pipeline can hang indefinitely if the Next.js data API fails to respond or hangs mid-stream, leaving the user waiting without error feedback.
**Root cause pattern:** `fetch()` calls missing an `AbortController` and a timeout mechanism in background or extraction flows.
**Prevention:** Always enforce a timeout pattern (e.g., `setTimeout` calling `AbortController.abort()`) when making `fetch()` requests to external or site-specific endpoints.
