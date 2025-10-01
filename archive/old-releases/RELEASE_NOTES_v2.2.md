# Release Notes — v2.2

Date: 2025-09-20

Highlights
- URL normalization for all storage keys: strips fragments, removes common tracking params (utm_*, gclid, fbclid), trims non-root trailing slash.
- Dynamic highlight restore injection: removed global content_script; background injects `scripts/highlight-restore.js` only when highlights exist for the page.
- Automatic migration: legacy `localStorage` highlights are migrated to `chrome.storage.local` on page load if needed, then restored.
- Permissions tightened: removed unused `identity` from `manifest.json`.

Developer Notes
- Keys now use `saved_<normalizedUrl>` and `highlights_<normalizedUrl>`.
- Background listens to `tabs.onUpdated` and performs detection/migration then injection.
- highlight persistence prioritizes `chrome.storage.local` with legacy fallback.

Verification Checklist
- Update from v2.1: open a page with old highlights → auto-migrated and restored.
- Create/edit/delete highlights → persist via `chrome.storage.local` across reloads.
- Delete associated Notion page → local saved state and highlights cleared.
