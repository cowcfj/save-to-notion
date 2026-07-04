/**
 * @jest-environment node
 */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

const originalChromeDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'chrome');
const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalLocationDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'location');
const EXTENSION_ID = 'extension-id';

function restoreGlobalProperty(name, descriptor) {
  if (descriptor) {
    Object.defineProperty(globalThis, name, descriptor);
    return;
  }

  delete globalThis[name];
}

function setGlobalProperty(name, value) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  });
}

async function importRuntime() {
  jest.resetModules();
  return import('../../../scripts/config/env/runtime.js');
}

function setWindow(value) {
  if (value === undefined) {
    setGlobalProperty('window', undefined);
    return;
  }

  setGlobalProperty('window', value);
}

function setLocation(value) {
  setGlobalProperty('location', value);
}

function installChromeRuntime(runtime = {}) {
  const chromeRuntime = {
    id: EXTENSION_ID,
    ...runtime,
  };
  setGlobalProperty('chrome', { runtime: chromeRuntime });
  return chromeRuntime;
}

function installChromeManifest(manifest, runtime = {}) {
  return installChromeRuntime({
    ...runtime,
    getManifest: jest.fn(() => manifest),
  });
}

function installContentLikeContext({ runtime = {}, location } = {}) {
  installChromeRuntime(runtime);
  setWindow({});
  setLocation(location ?? { protocol: 'https:', origin: 'https://example.com' });
}

describe('runtime environment native ESM coverage', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    restoreGlobalProperty('chrome', originalChromeDescriptor);
    restoreGlobalProperty('window', originalWindowDescriptor);
    restoreGlobalProperty('location', originalLocationDescriptor);
  });

  test('detects extension, background, and non-extension contexts', async () => {
    let runtime = await importRuntime();
    setGlobalProperty('chrome', undefined);
    setWindow(undefined);

    expect(runtime.isExtensionContext()).toBe(false);
    expect(runtime.isBackgroundContext()).toBe(false);
    expect(runtime.isContentContext()).toBe(false);

    installChromeRuntime();
    runtime = await importRuntime();

    expect(runtime.isExtensionContext()).toBe(true);
    expect(runtime.isBackgroundContext()).toBe(true);
    expect(runtime.isContentContext()).toBe(false);
  });

  test.each([
    {
      name: 'chrome-extension page is not content context',
      runtime: { getURL: () => 'chrome-extension://extension-id/' },
      location: { protocol: 'chrome-extension:', origin: 'chrome-extension://extension-id' },
      expected: false,
    },
    {
      name: 'missing extension base URL falls back to content context',
      runtime: { getURL: () => '' },
      location: { protocol: 'https:', origin: 'https://example.com' },
      expected: true,
    },
    {
      name: 'matching extension origin is not content context',
      runtime: { getURL: () => 'https://extension-id/' },
      location: { protocol: 'https:', origin: 'https://extension-id' },
      expected: false,
    },
    {
      name: 'different origin is content context',
      runtime: { getURL: () => 'chrome-extension://extension-id/' },
      location: { protocol: 'https:', origin: 'https://example.com' },
      expected: true,
    },
    {
      name: 'malformed extension base URL falls back to content context',
      runtime: { getURL: () => 'not a url' },
      location: { protocol: 'https:', origin: 'https://example.com' },
      expected: true,
    },
    {
      name: 'empty current origin falls back to content context',
      runtime: { getURL: () => 'chrome-extension://extension-id/' },
      location: { protocol: 'https:', origin: '' },
      expected: true,
    },
  ])('$name', async ({ runtime, location, expected }) => {
    installContentLikeContext({ runtime, location });
    const envRuntime = await importRuntime();

    expect(envRuntime.isBackgroundContext()).toBe(false);
    expect(envRuntime.isContentContext()).toBe(expected);
  });

  test('detects development and production from manifest versions with cache isolation', async () => {
    const runtime = installChromeManifest({ version_name: '2.0.0-dev' });
    const envRuntime = await importRuntime();

    expect(envRuntime.isDevelopment()).toBe(true);
    expect(envRuntime.isProduction()).toBe(false);
    expect(envRuntime.selectByEnvironment('development', 'production')).toBe('development');
    expect(runtime.getManifest).toHaveBeenCalledTimes(1);

    runtime.getManifest = jest.fn(() => ({ version: '2.0.0' }));

    expect(envRuntime.isDevelopment()).toBe(false);
    expect(envRuntime.isProduction()).toBe(true);
    expect(envRuntime.selectByEnvironment('development', 'production')).toBe('production');
  });

  test('treats missing extension context and manifest failures as production-safe', async () => {
    setGlobalProperty('chrome', undefined);
    let envRuntime = await importRuntime();

    expect(envRuntime.isDevelopment()).toBe(false);
    expect(envRuntime.isProduction()).toBe(true);

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    installChromeRuntime({
      id: 'extension-id-error-test',
      getManifest: jest.fn(() => {
        throw new Error('manifest unavailable');
      }),
    });
    envRuntime = await importRuntime();

    expect(envRuntime.isDevelopment()).toBe(false);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[環境檢測] 無法讀取 manifest:',
      expect.any(Error)
    );
  });

  test('aggregates environment flags and exposes frozen ENV getters', async () => {
    installChromeManifest({ version_name: '2.0.0-dev' });
    setWindow({});
    setLocation({ protocol: 'https:', origin: 'https://example.com' });
    const envRuntime = await importRuntime();

    expect(envRuntime.getEnvironment()).toEqual({
      isExtension: true,
      isBackground: false,
      isContent: true,
      isNode: false,
      isDevelopment: true,
      isProduction: false,
    });
    expect(envRuntime.ENV.IS_EXTENSION).toBe(envRuntime.isExtensionContext());
    expect(envRuntime.ENV.IS_BACKGROUND).toBe(envRuntime.isBackgroundContext());
    expect(envRuntime.ENV.IS_CONTENT).toBe(envRuntime.isContentContext());
    expect(envRuntime.ENV.IS_NODE).toBe(envRuntime.isNodeEnvironment());
    expect(envRuntime.ENV.IS_DEV).toBe(envRuntime.isDevelopment());
    expect(envRuntime.ENV.IS_PROD).toBe(envRuntime.isProduction());
    expect(Object.isFrozen(envRuntime.ENV)).toBe(true);
  });
});
