export function createOnWarn({ circular = 'pass' } = {}) {
  return (warning, warn) => {
    if (warning.code === 'THIS_IS_UNDEFINED') return;
    if (warning.code === 'CIRCULAR_DEPENDENCY') {
      if (circular === 'silent') return;
      if (circular === 'log') {
        console.warn(`[WARN] Circular dependency detected: ${warning.message}`);
        return;
      }
    }
    warn(warning);
  };
}
