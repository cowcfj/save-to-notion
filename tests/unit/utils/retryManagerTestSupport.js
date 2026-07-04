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

export const REQUIRED_LOGGER_METHODS = [
  'success',
  'start',
  'ready',
  'info',
  'debug',
  'warn',
  'error',
];

export { withGlobalTestDouble } from '../../helpers/globalTestDouble.js';

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
