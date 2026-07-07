## 26-07-07 — [I18n Drift Fix] Align HTML fallbacks and add missing keys in options page

**Drift:** Pattern B (Missing keys: `FALLBACK_LABEL`, `IMPORT_FILE_LABEL`) and Pattern C (HTML mismatch: `OPTIONS.ABOUT.SUPPORT_DESC` using `擴展` instead of `擴充功能`) in `options.html` / `messages.js`.
**Root cause:** New UI sections were added without strictly defining all keys in the dictionary object, and some copy changes in the dictionary were not fully back-propagated to the HTML fallback text. Some surfaces like `popup` and `sidepanel` are completely missing the `resolveUiMessage` pipeline.
**Prevention:** During PR reviews involving `data-ui-message` in wired surfaces, always ensure keys are defined in the source config (`messages.js`), and their inner HTML strictly matches the text definition.
