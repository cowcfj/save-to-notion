import fs from 'node:fs';
import path from 'node:path';
import loggerMock from './loggerMock.cjs';

const { createLoggerMock } = loggerMock;

export const PERFORMANCE_HTML_FIXTURE = fs.readFileSync(
  path.resolve(process.cwd(), 'tests/mocks/performance/performance-html-fixture.html'),
  'utf8'
);

export function createPerformanceLoggerMock(overrides = {}) {
  return createLoggerMock(overrides);
}

export function capturePerformanceGlobals() {
  return {
    document: globalThis.document,
    window: globalThis.window,
    Image: globalThis.Image,
    performance: globalThis.performance,
    requestIdleCallback: globalThis.requestIdleCallback,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelIdleCallback: globalThis.cancelIdleCallback,
    Logger: globalThis.Logger,
    chrome: globalThis.chrome,
  };
}

export function restorePerformanceGlobals(state) {
  const restoreValue = (key, value) => {
    if (value === undefined) {
      delete globalThis[key];
      return;
    }
    globalThis[key] = value;
  };

  restoreValue('document', state.document);
  restoreValue('window', state.window);
  restoreValue('Image', state.Image);
  restoreValue('performance', state.performance);
  restoreValue('requestIdleCallback', state.requestIdleCallback);
  restoreValue('requestAnimationFrame', state.requestAnimationFrame);
  restoreValue('cancelIdleCallback', state.cancelIdleCallback);
  restoreValue('Logger', state.Logger);
  restoreValue('chrome', state.chrome);
}

export function installPerformanceDom(bodyHtml = '') {
  document.body.innerHTML = bodyHtml;
  return document;
}

export function setupPerformanceEnvironment({
  bodyHtml = '',
  useFakeTimers = false,
  performance = undefined,
  requestIdleCallback = undefined,
  requestAnimationFrame = undefined,
  cancelIdleCallback = undefined,
  logger = undefined,
} = {}) {
  const state = capturePerformanceGlobals();
  if (useFakeTimers) {
    jest.useFakeTimers();
  }
  installPerformanceDom(bodyHtml);

  if (performance !== undefined) {
    globalThis.performance = performance;
  }
  if (requestIdleCallback !== undefined) {
    globalThis.requestIdleCallback = requestIdleCallback;
  }
  if (requestAnimationFrame !== undefined) {
    globalThis.requestAnimationFrame = requestAnimationFrame;
  }
  if (cancelIdleCallback !== undefined) {
    globalThis.cancelIdleCallback = cancelIdleCallback;
  }
  if (logger !== undefined) {
    globalThis.Logger = logger;
  }

  return state;
}
