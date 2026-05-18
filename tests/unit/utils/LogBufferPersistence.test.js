import { LogBufferPersistence } from '../../../scripts/utils/LogBufferPersistence.js';
import { LogBuffer } from '../../../scripts/utils/LogBuffer.js';

const mockStorage = {};
const mockAlarmListeners = [];

beforeEach(() => {
  jest.clearAllMocks();
  mockAlarmListeners.length = 0;

  globalThis.chrome = {
    storage: {
      session: {
        get: jest.fn(key => {
          const k = typeof key === 'string' ? key : Object.keys(key)[0];
          return Promise.resolve({ [k]: mockStorage[k] ?? undefined });
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
        addListener: jest.fn(fn => mockAlarmListeners.push(fn)),
        removeListener: jest.fn(fn => {
          const idx = mockAlarmListeners.indexOf(fn);
          if (idx !== -1) {
            mockAlarmListeners.splice(idx, 1);
          }
        }),
      },
    },
  };
});

afterEach(() => {
  for (const key of Object.keys(mockStorage)) {
    delete mockStorage[key];
  }
  if (globalThis.chrome) {
    LogBufferPersistence._reset();
  }
});

describe('LogBufferPersistence', () => {
  test('init registers alarm and restores from session storage', async () => {
    mockStorage._logBuffer = [{ level: 'info', source: 'bg', message: 'restored', context: {} }];

    const buffer = new LogBuffer(10);
    await LogBufferPersistence.init(buffer);

    expect(chrome.alarms.create).toHaveBeenCalledWith('log-buffer-flush', { periodInMinutes: 0.5 });
    expect(chrome.alarms.onAlarm.addListener).toHaveBeenCalled();
    expect(buffer.getAll()).toHaveLength(1);
    expect(buffer.getAll()[0].message).toBe('restored');
  });

  test('flush writes buffer to session storage when dirty', async () => {
    const buffer = new LogBuffer(10);
    await LogBufferPersistence.init(buffer);

    buffer.push({ level: 'info', source: 'bg', message: 'new-entry', context: {} });
    expect(buffer.isDirty()).toBe(true);

    LogBufferPersistence.flush();

    expect(chrome.storage.session.set).toHaveBeenCalled();
    const stored = chrome.storage.session.set.mock.calls.at(-1)[0]._logBuffer;
    expect(stored).toHaveLength(1);
    expect(stored[0].message).toBe('new-entry');
    expect(buffer.isDirty()).toBe(false);
  });

  test('flush skips write when buffer is not dirty', async () => {
    const buffer = new LogBuffer(10);
    await LogBufferPersistence.init(buffer);

    chrome.storage.session.set.mockClear();
    LogBufferPersistence.flush();

    expect(chrome.storage.session.set).not.toHaveBeenCalled();
  });

  test('alarm triggers flush', async () => {
    const buffer = new LogBuffer(10);
    await LogBufferPersistence.init(buffer);

    buffer.push({ level: 'warn', source: 'bg', message: 'alarm-test', context: {} });

    for (const listener of mockAlarmListeners) {
      listener({ name: 'log-buffer-flush' });
    }

    expect(chrome.storage.session.set).toHaveBeenCalled();
  });

  test('unrelated alarm does not trigger flush', async () => {
    const buffer = new LogBuffer(10);
    await LogBufferPersistence.init(buffer);

    buffer.push({ level: 'info', source: 'bg', message: 'x', context: {} });
    chrome.storage.session.set.mockClear();

    for (const listener of mockAlarmListeners) {
      listener({ name: 'some-other-alarm' });
    }

    expect(chrome.storage.session.set).not.toHaveBeenCalled();
  });

  test('restore handles empty storage gracefully', async () => {
    const buffer = new LogBuffer(10);
    await LogBufferPersistence.init(buffer);

    expect(buffer.getAll()).toHaveLength(0);
  });
});
