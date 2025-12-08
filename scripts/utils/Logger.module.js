import './Logger.js';

// Retrieve global Logger (set by side effect)
const Logger =
  (typeof self !== 'undefined' ? self.Logger : null) ||
  (typeof window !== 'undefined' ? window.Logger : null) ||
  globalThis.Logger;

export default Logger;
