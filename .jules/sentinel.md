## 2024-05-17 - [Static innerHTML false positives]
**Vulnerability:** Found assignments to `.innerHTML` in `ToolbarContainer.js` that looked like potential XSS vulnerabilities.
**Learning:** The strings assigned were entirely static HTML and configuration constants. Without unsanitized user input, this is not a true vulnerability.
**Prevention:** Avoid refactoring `.innerHTML` assignments unless they include dynamic, unverified user data to prevent adding "security theater" without real benefit.
