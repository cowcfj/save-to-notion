import { jest } from '@jest/globals';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const harnessDirectory = path.dirname(fileURLToPath(import.meta.url));
const backgroundEntrypointPath = fileURLToPath(
  new URL('../../../scripts/background.js', import.meta.url)
);

function toHarnessImportSpecifier(absolutePath) {
  const relativePath = path.relative(harnessDirectory, absolutePath).replaceAll(path.sep, '/');
  return relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
}

function createSyntheticModule(moduleNamespace, identifier, context) {
  const exportNames = Object.getOwnPropertyNames(moduleNamespace);
  return new vm.SyntheticModule(
    exportNames,
    function evaluateSyntheticModule() {
      for (const exportName of exportNames) {
        this.setExport(exportName, moduleNamespace[exportName]);
      }
    },
    { context, identifier }
  );
}

async function importLinkedModule(specifier, referencingModule) {
  if (!specifier.startsWith('.')) {
    const moduleNamespace = await import(specifier);
    return createSyntheticModule(
      moduleNamespace,
      `${specifier}?synthetic-native-esm`,
      referencingModule.context
    );
  }

  const referencingPath = fileURLToPath(referencingModule.identifier);
  const absolutePath = path.resolve(path.dirname(referencingPath), specifier);
  const moduleNamespace = await import(toHarnessImportSpecifier(absolutePath));
  return createSyntheticModule(
    moduleNamespace,
    `${pathToFileURL(absolutePath).href}?synthetic-native-esm`,
    referencingModule.context
  );
}

async function importBackgroundEntrypoint() {
  if (typeof vm.SourceTextModule !== 'function' || typeof vm.SyntheticModule !== 'function') {
    throw new TypeError('Native ESM background import requires VM Modules support.');
  }

  const source = await fs.readFile(backgroundEntrypointPath, 'utf8');
  const context = vm.createContext(globalThis);
  const backgroundModule = new vm.SourceTextModule(source, {
    context,
    identifier: pathToFileURL(backgroundEntrypointPath).href,
  });

  await backgroundModule.link(importLinkedModule);
  await backgroundModule.evaluate();

  return backgroundModule.namespace;
}

function makeDefaultChrome() {
  return {
    runtime: {
      onInstalled: { addListener: jest.fn(), removeListener: jest.fn() },
      onMessage: { addListener: jest.fn(), removeListener: jest.fn() },
      onStartup: { addListener: jest.fn(), removeListener: jest.fn() },
      getManifest: jest.fn(() => ({ version: '2.8.1' })),
      getURL: jest.fn(path => `chrome-extension://ext-id/${path}`),
      lastError: null,
    },
    alarms: {
      get: jest.fn(),
      create: jest.fn(),
      clear: jest.fn(),
      onAlarm: { addListener: jest.fn(), removeListener: jest.fn() },
    },
    tabs: {
      onUpdated: { addListener: jest.fn(), removeListener: jest.fn() },
      onRemoved: { addListener: jest.fn(), removeListener: jest.fn() },
      onActivated: { addListener: jest.fn(), removeListener: jest.fn() },
      create: jest.fn(async () => ({ id: 1 })),
      sendMessage: jest.fn(),
      get: jest.fn(),
      query: jest.fn(),
    },
    windows: {
      create: jest.fn(),
    },
    storage: {
      local: {
        get: jest.fn(),
        set: jest.fn(),
        remove: jest.fn(),
      },
      sync: {
        get: jest.fn(),
        set: jest.fn(),
      },
    },
    action: {
      setBadgeText: jest.fn(),
      setBadgeBackgroundColor: jest.fn(),
    },
    scripting: {
      executeScript: jest.fn(),
    },
  };
}

function makeLoggerMock() {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    log: jest.fn(),
    success: jest.fn(),
    ready: jest.fn(),
    start: jest.fn(),
  };
}

function unwrapTestExports(moduleNamespace) {
  if (moduleNamespace?.default !== undefined) {
    return moduleNamespace.default;
  }

  if (moduleNamespace && Object.keys(moduleNamespace).length > 0) {
    return moduleNamespace;
  }

  if (globalThis.module?.exports && typeof globalThis.module.exports === 'object') {
    return globalThis.module.exports;
  }

  return moduleNamespace;
}

const CHROME_MOCK_CLEAR_PATHS = [
  ['runtime', 'onInstalled', 'removeListener'],
  ['runtime', 'onMessage', 'removeListener'],
  ['runtime', 'onStartup', 'removeListener'],
  ['alarms', 'onAlarm', 'removeListener'],
  ['tabs', 'onUpdated', 'removeListener'],
  ['tabs', 'onRemoved', 'removeListener'],
  ['tabs', 'onActivated', 'removeListener'],
  ['storage', 'local', 'get'],
  ['storage', 'local', 'set'],
  ['storage', 'local', 'remove'],
  ['storage', 'sync', 'get'],
  ['storage', 'sync', 'set'],
];

function readPath(source, pathParts) {
  return pathParts.reduce((value, key) => value?.[key], source);
}

function clearMockByPath(source, pathParts) {
  readPath(source, pathParts)?.mockClear?.();
}

function clearListenerRegistries(chromeLike) {
  for (const pathParts of CHROME_MOCK_CLEAR_PATHS) {
    clearMockByPath(chromeLike, pathParts);
  }
}

function cleanup(chromeLike) {
  clearListenerRegistries(chromeLike);
  jest.clearAllMocks();
  jest.resetModules();
}

export {
  cleanup,
  clearListenerRegistries,
  importBackgroundEntrypoint,
  makeDefaultChrome,
  makeLoggerMock,
  unwrapTestExports,
};
