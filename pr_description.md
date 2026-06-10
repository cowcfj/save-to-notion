💡 **Hazard**: Crash risk (Unhandled Exceptions)
🔬 **Trigger**: `new URL()` is invoked on potentially malformed string inputs (`sender.url`, `url`, `img.src`, `meta[content]`). If the string is malformed or doesn't construct a valid Absolute URL against the base URL, a `TypeError: Invalid URL` exception is thrown. Unhandled exceptions in these loops or extension message listeners can crash content extraction, skip extension message handling, or disrupt injection checking.
🔧 **Fix**: Added boundary guards via `try/catch` around `new URL()` in `logHandlers.js`, `ImageCollector.js`, and `InjectionService.js`. If parsing fails, the logic falls back safely (e.g. defaulting to `'unknown_external'`, skipping the image, or defaulting to `true` restricted).
✅ **Verification**:
  - `npm run lint`
  - `npm run test:coverage` (100% pass)
  - `npm run build:prod`
  - Added test cases that inject malformed URLs explicitly and assert the code handles them without throwing.
