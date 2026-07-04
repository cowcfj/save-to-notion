/* eslint-disable unicorn/prefer-await -- Test helpers intentionally preserve sync-or-async helper behavior. */

export class MockHeaders {
  constructor(map = {}) {
    this.map = Object.fromEntries(
      Object.entries(map).map(([key, value]) => [String(key).toLowerCase(), value])
    );
  }

  get(key) {
    return this.map[String(key).toLowerCase()] ?? null;
  }
}

export function createAbortController() {
  if (typeof AbortController !== 'undefined') {
    return new AbortController();
  }
  let isAborted = false;
  const listeners = new Set();
  return {
    get signal() {
      return {
        get aborted() {
          return isAborted;
        },
        addEventListener: (event, callback) => {
          if (event === 'abort') {
            listeners.add(callback);
          }
        },
        removeEventListener: (event, callback) => {
          if (event === 'abort') {
            listeners.delete(callback);
          }
        },
      };
    },
    abort() {
      if (isAborted) {
        return;
      }
      isAborted = true;
      for (const callback of listeners) {
        try {
          callback();
        } catch {
          /* empty */
        }
      }
      listeners.clear();
    },
  };
}

export async function advance(ms) {
  jest.advanceTimersByTime(ms);
  await Promise.resolve();
  await Promise.resolve();
}

function restoreGlobalProperty(name, originalValue) {
  if (originalValue === undefined) {
    delete globalThis[name];
    return;
  }
  globalThis[name] = originalValue;
}

export const REQUIRED_LOGGER_METHODS = [
  'success',
  'start',
  'ready',
  'info',
  'debug',
  'warn',
  'error',
];

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

export function createLoggerWithMethods(methodNames) {
  return Object.fromEntries(
    [...new Set([...REQUIRED_LOGGER_METHODS, ...methodNames])].map(methodName => [
      methodName,
      jest.fn(),
    ])
  );
}

export function expectStructuredRetryLog(logMethod, messageFragment, metadata) {
  expect(logMethod).toHaveBeenCalledWith(
    expect.stringContaining(messageFragment),
    expect.objectContaining(metadata)
  );
}
