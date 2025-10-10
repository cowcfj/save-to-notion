// Global Logger shim - safe to include in both content and background contexts
// If a local Logger is already defined in a file, that local Logger will take precedence.
(function () {
  if (typeof globalThis.Logger !== 'undefined') return;

  // Determine debug mode safely (works in extension and test environments)
  let DEBUG_MODE = false;
  try {
    if (typeof chrome !== 'undefined' && chrome?.runtime?.getManifest) {
      DEBUG_MODE = !!(chrome.runtime.getManifest()?.version || '').includes('dev');
    } else if (typeof process !== 'undefined') {
      DEBUG_MODE = process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development';
    }
  } catch (e) {
    DEBUG_MODE = false;
  }

  const makeLogger = (debugMode) => ({
    debug: (...args) => debugMode && console.debug && console.debug(...args),
    log: (...args) => debugMode && console.log && console.log(...args),
    info: (...args) => debugMode && console.info && console.info(...args),
    warn: (...args) => console.warn && console.warn(...args),
    error: (...args) => console.error && console.error(...args)
  });

  try {
    Object.defineProperty(globalThis, 'Logger', {
      configurable: false,
      enumerable: true,
      writable: false,
      value: makeLogger(DEBUG_MODE)
    });
  } catch (e) {
    // Fallback assignment for older environments
    globalThis.Logger = makeLogger(DEBUG_MODE);
  }
})();
