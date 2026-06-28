import { jest } from '@jest/globals';

export function snapshotGlobals(names) {
  const snapshots = new Map(
    names.map(name => [
      name,
      {
        exists: Object.hasOwn(globalThis, name),
        descriptor: Object.getOwnPropertyDescriptor(globalThis, name),
      },
    ])
  );

  return () => {
    for (const [name, snapshot] of snapshots) {
      if (!snapshot.exists) {
        delete globalThis[name];
        continue;
      }

      Object.defineProperty(globalThis, name, snapshot.descriptor);
    }
  };
}

export function createStorageArea(initialData = {}) {
  const data = { ...initialData };

  function select(keys) {
    if (keys === null || keys === undefined) {
      return { ...data };
    }
    if (typeof keys === 'string') {
      return { [keys]: data[keys] };
    }
    if (Array.isArray(keys)) {
      return Object.fromEntries(keys.map(key => [key, data[key]]));
    }
    if (typeof keys === 'object') {
      return Object.fromEntries(
        Object.entries(keys).map(([key, defaultValue]) => [
          key,
          data[key] === undefined ? defaultValue : data[key],
        ])
      );
    }
    return {};
  }

  const api = {
    data,
    get: jest.fn(async keys => select(keys)),
    set: jest.fn(async patch => {
      Object.assign(data, patch);
    }),
    remove: jest.fn(async keys => {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        delete data[key];
      }
    }),
    clear: jest.fn(async () => {
      for (const key of Object.keys(data)) {
        delete data[key];
      }
    }),
  };

  return {
    data,
    api,
  };
}

export function installChromeRuntime(options = {}) {
  const {
    id = 'native-esm-extension-id',
    version = '9.9.9-test',
    localData = {},
    syncData = {},
    activeTabs = [{ id: 101, url: 'https://example.com/article' }],
  } = options;
  const local = createStorageArea(localData);
  const sync = createStorageArea(syncData);

  globalThis.chrome = {
    runtime: {
      id,
      getManifest: jest.fn(() => ({ version })),
      sendMessage: jest.fn(async () => ({})),
      lastError: null,
    },
    storage: {
      local: local.api,
      sync: sync.api,
    },
    tabs: {
      query: jest.fn(async () => activeTabs),
      create: jest.fn(async tab => ({ id: 102, ...tab })),
      sendMessage: jest.fn(async () => ({})),
    },
    alarms: {
      clear: jest.fn(async () => true),
      create: jest.fn(async () => {}),
    },
  };

  return { local, sync, chrome: globalThis.chrome };
}

export function installLoggerGlobal() {
  globalThis.Logger = {
    debug: jest.fn(),
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    success: jest.fn(),
    start: jest.fn(),
    ready: jest.fn(),
  };
  return globalThis.Logger;
}

export function installCryptoRandomUUID(value = '00000000-0000-4000-8000-000000000001') {
  const cryptoMock = {
    randomUUID: jest.fn(() => value),
    getRandomValues: jest.fn(bytes => {
      bytes.fill(7);
      return bytes;
    }),
    subtle: {
      digest: jest.fn(async () => new Uint8Array(32).fill(9).buffer),
    },
  };
  Object.defineProperty(globalThis, 'crypto', {
    value: cryptoMock,
    configurable: true,
    writable: true,
  });
  return cryptoMock;
}
