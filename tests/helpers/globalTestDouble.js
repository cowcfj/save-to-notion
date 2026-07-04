/* eslint-disable unicorn/prefer-await -- Test helper intentionally preserves sync-or-async callback behavior. */

function restoreGlobalProperty(name, originalValue) {
  if (originalValue === undefined) {
    delete globalThis[name];
    return;
  }
  globalThis[name] = originalValue;
}

export function withGlobalTestDouble(name, value, assertionBlock) {
  const originalValue = globalThis[name];
  globalThis[name] = value;
  const restore = () => restoreGlobalProperty(name, originalValue);

  try {
    const result = assertionBlock(value);
    if (result && typeof result.then === 'function') {
      return result.then(
        resolvedValue => {
          restore();
          return resolvedValue;
        },
        error => {
          restore();
          throw error;
        }
      );
    }

    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}
