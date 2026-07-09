## 26-07-07 — [I18n Drift Fix] Align HTML fallbacks and add missing keys in options page

**Drift:** Pattern B (missing keys: `FALLBACK_LABEL`, `IMPORT_FILE_LABEL`) and Pattern C (HTML fallback mismatch for options-page `data-ui-*` bindings) in `pages/options/options.html` / `scripts/config/shared/messages.js`.
**Root cause:** Some options-page UI sections added `data-ui-message` bindings without matching dictionary keys, and some existing HTML fallback copy drifted from the canonical dictionary text.
**Prevention:** Keep the options-page static-message regression test strict: every `data-ui-*` path must resolve to a non-empty string, and any non-empty HTML fallback must match the dictionary text.
