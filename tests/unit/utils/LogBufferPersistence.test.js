let LogBufferPersistence;
let LogBuffer;

beforeAll(async () => {
  ({ LogBufferPersistence } = await import('../../../scripts/utils/LogBufferPersistence.js'));
  ({ LogBuffer } = await import('../../../scripts/utils/LogBuffer.js'));
});

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
  const initLogBuffer = async (capacity = 10) => {
    const buffer = new LogBuffer(capacity);
    await LogBufferPersistence.init(buffer);
    return buffer;
  };

  test('init registers alarm and restores from session storage', async () => {
    mockStorage._logBuffer = [{ level: 'info', source: 'bg', message: 'restored', context: {} }];

    const buffer = await initLogBuffer();

    expect(chrome.alarms.create).toHaveBeenCalledWith('log-buffer-flush', { periodInMinutes: 1 });
    expect(chrome.alarms.onAlarm.addListener).toHaveBeenCalled();
    expect(buffer.getAll()).toHaveLength(1);
    expect(buffer.getAll()[0].message).toBe('restored');
  });

  test('flush writes buffer to session storage when dirty', async () => {
    const buffer = await initLogBuffer();

    buffer.push({ level: 'info', source: 'bg', message: 'new-entry', context: {} });
    expect(buffer.isDirty()).toBe(true);

    await LogBufferPersistence.flush();

    expect(chrome.storage.session.set).toHaveBeenCalled();
    const stored = chrome.storage.session.set.mock.calls.at(-1)[0]._logBuffer;
    expect(stored).toHaveLength(1);
    expect(stored[0].message).toBe('new-entry');
    expect(buffer.isDirty()).toBe(false);
  });

  test('flush skips write when buffer is not dirty', async () => {
    await initLogBuffer();

    chrome.storage.session.set.mockClear();
    await LogBufferPersistence.flush();

    expect(chrome.storage.session.set).not.toHaveBeenCalled();
  });

  test('flush keeps buffer dirty when storage write fails', async () => {
    const buffer = await initLogBuffer();

    buffer.push({ level: 'error', source: 'bg', message: 'quota-test', context: {} });
    chrome.storage.session.set.mockRejectedValueOnce(new Error('QUOTA_BYTES quota exceeded'));

    await LogBufferPersistence.flush();

    expect(buffer.isDirty()).toBe(true);
  });

  test('alarm triggers flush', async () => {
    const buffer = await initLogBuffer();

    buffer.push({ level: 'warn', source: 'bg', message: 'alarm-test', context: {} });

    for (const listener of mockAlarmListeners) {
      listener({ name: 'log-buffer-flush' });
    }

    expect(chrome.storage.session.set).toHaveBeenCalled();
  });

  test('unrelated alarm does not trigger flush', async () => {
    const buffer = await initLogBuffer();

    buffer.push({ level: 'info', source: 'bg', message: 'x', context: {} });
    chrome.storage.session.set.mockClear();

    for (const listener of mockAlarmListeners) {
      listener({ name: 'some-other-alarm' });
    }

    expect(chrome.storage.session.set).not.toHaveBeenCalled();
  });

  test('restore handles empty storage gracefully', async () => {
    const buffer = await initLogBuffer();

    expect(buffer.getAll()).toHaveLength(0);
  });
});
