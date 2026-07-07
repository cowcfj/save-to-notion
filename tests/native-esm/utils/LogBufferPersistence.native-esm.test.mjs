import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { LogBuffer } from '../../../scripts/utils/LogBuffer.js';
import { LogBufferPersistence } from '../../../scripts/utils/LogBufferPersistence.js';

const mockStorage = {};
const mockAlarmListeners = [];

function makeChromeMock() {
  return {
    storage: {
      session: {
        get: jest.fn(key => {
          const storageKey = typeof key === 'string' ? key : Object.keys(key)[0];
          return Promise.resolve({ [storageKey]: mockStorage[storageKey] });
        }),
        set: jest.fn(obj => {
          Object.assign(mockStorage, obj);
          return Promise.resolve();
        }),
      },
    },
    alarms: {
      create: jest.fn(),
      clear: jest.fn(),
      onAlarm: {
        addListener: jest.fn(listener => {
          mockAlarmListeners.push(listener);
        }),
        removeListener: jest.fn(listener => {
          const index = mockAlarmListeners.indexOf(listener);
          if (index !== -1) {
            mockAlarmListeners.splice(index, 1);
          }
        }),
      },
    },
  };
}

function makeEntry(message, level = 'info') {
  return {
    level,
    source: 'native-esm',
    message,
    context: {},
  };
}

async function dispatchAlarm(name = 'log-buffer-flush') {
  for (const listener of mockAlarmListeners) {
    listener({ name });
  }
  await Promise.resolve();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAlarmListeners.length = 0;
  for (const key of Object.keys(mockStorage)) {
    delete mockStorage[key];
  }
  globalThis.chrome = makeChromeMock();
});

afterEach(() => {
  LogBufferPersistence._reset();
  delete globalThis.chrome;
});

describe('LogBufferPersistence native ESM fallback coverage', () => {
  test('init restores session entries and registers the flush alarm', async () => {
    mockStorage._logBuffer = [makeEntry('restored')];

    const buffer = new LogBuffer(5);
    await LogBufferPersistence.init(buffer);

    expect(chrome.storage.session.get).toHaveBeenCalledWith('_logBuffer');
    expect(chrome.alarms.onAlarm.addListener).toHaveBeenCalledTimes(1);
    expect(chrome.alarms.create).toHaveBeenCalledWith('log-buffer-flush', {
      periodInMinutes: 1,
    });
    expect(buffer.getAll()).toEqual([makeEntry('restored')]);
  });

  test('restore falls back to an empty buffer when session storage fails', async () => {
    chrome.storage.session.get.mockRejectedValueOnce(new Error('session unavailable'));

    const buffer = new LogBuffer(5);
    await LogBufferPersistence.init(buffer);

    expect(buffer.getAll()).toEqual([]);
    expect(buffer.isDirty()).toBe(false);
  });

  test('flush writes dirty entries and marks the buffer clean', async () => {
    const buffer = new LogBuffer(5);
    await LogBufferPersistence.init(buffer);
    buffer.push(makeEntry('queued'));

    expect(buffer.isDirty()).toBe(true);
    await LogBufferPersistence.flush();

    expect(chrome.storage.session.set).toHaveBeenCalledWith({
      _logBuffer: [makeEntry('queued')],
    });
    expect(buffer.isDirty()).toBe(false);
  });

  test('flush leaves dirty entries dirty when session storage write fails', async () => {
    const buffer = new LogBuffer(5);
    await LogBufferPersistence.init(buffer);
    buffer.push(makeEntry('quota', 'error'));
    chrome.storage.session.set.mockRejectedValueOnce(new Error('QUOTA_BYTES quota exceeded'));

    await LogBufferPersistence.flush();

    expect(buffer.isDirty()).toBe(true);
  });

  test('registered alarm flushes only the log-buffer alarm', async () => {
    const buffer = new LogBuffer(5);
    await LogBufferPersistence.init(buffer);
    buffer.push(makeEntry('alarm'));

    chrome.storage.session.set.mockClear();
    await dispatchAlarm('not-log-buffer-flush');
    expect(chrome.storage.session.set).not.toHaveBeenCalled();

    await dispatchAlarm();
    expect(chrome.storage.session.set).toHaveBeenCalledWith({
      _logBuffer: [makeEntry('alarm')],
    });
  });
});
