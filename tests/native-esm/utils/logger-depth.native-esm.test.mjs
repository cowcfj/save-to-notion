/**
 * @jest-environment node
 */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

function makeChromeMock({ versionName = '1.0.0-dev', storageDebugValue, sendMessageImpl } = {}) {
  return {
    runtime: {
      id: 'native-logger-test',
      getManifest: jest.fn().mockReturnValue({
        version: '1.0.0',
        version_name: versionName,
      }),
      sendMessage:
        sendMessageImpl ??
        jest.fn((_message, callback) => {
          callback?.();
        }),
      lastError: null,
    },
    storage: {
      sync: {
        get: jest.fn((_keys, callback) => {
          callback(storageDebugValue === undefined ? {} : { enableDebugLogs: storageDebugValue });
        }),
      },
      session: {
        get: jest.fn().mockResolvedValue({}),
        set: jest.fn().mockResolvedValue(undefined),
      },
      onChanged: {
        addListener: jest.fn(),
      },
    },
    alarms: {
      create: jest.fn(),
      clear: jest.fn(),
      onAlarm: {
        addListener: jest.fn(),
        removeListener: jest.fn(),
      },
    },
  };
}

function installBackgroundRuntime(options) {
  globalThis.self = {
    addEventListener: jest.fn(),
  };
  globalThis.chrome = makeChromeMock(options);
}

async function importFreshLogger() {
  jest.resetModules();
  return import('../../../scripts/utils/Logger.js');
}

let consoleSpies;

beforeEach(() => {
  consoleSpies = {
    debug: jest.spyOn(console, 'debug').mockImplementation(() => {}),
    log: jest.spyOn(console, 'log').mockImplementation(() => {}),
    info: jest.spyOn(console, 'info').mockImplementation(() => {}),
    warn: jest.spyOn(console, 'warn').mockImplementation(() => {}),
    error: jest.spyOn(console, 'error').mockImplementation(() => {}),
  };
});

afterEach(() => {
  delete globalThis.chrome;
  delete globalThis.self;
  delete globalThis.window;
  delete globalThis.Logger;
  delete globalThis.__CONTENT_SCRIPT_BUILD__;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('Logger native ESM depth coverage', () => {
  test('debug-level methods dispatch only when debug mode is enabled', async () => {
    installBackgroundRuntime({ versionName: '1.0.0' });
    const { default: Logger } = await importFreshLogger();

    Logger.debug('hidden debug');
    Logger.log('hidden log');
    Logger.info('hidden info');
    expect(consoleSpies.debug).not.toHaveBeenCalled();
    expect(consoleSpies.log).not.toHaveBeenCalled();
    expect(consoleSpies.info).not.toHaveBeenCalledWith(
      expect.stringContaining('[INFO]'),
      'hidden info'
    );

    const onChanged = chrome.storage.onChanged.addListener.mock.calls[0][0];
    onChanged({ enableDebugLogs: { newValue: true } }, 'sync');

    Logger.debug('visible debug', { feature: 'native' });
    Logger.log('visible log');
    Logger.info('visible info');

    expect(consoleSpies.debug).toHaveBeenCalledWith(
      expect.stringContaining('[DEBUG]'),
      'visible debug',
      { feature: 'native' }
    );
    expect(consoleSpies.log).toHaveBeenCalledWith(expect.stringContaining('[LOG]'), 'visible log');
    expect(consoleSpies.info).toHaveBeenCalledWith(
      expect.stringContaining('[INFO]'),
      'visible info'
    );
  });

  test('warn and error write sanitized background entries into LogBuffer', async () => {
    installBackgroundRuntime({ versionName: '1.0.0-dev' });
    const { default: Logger } = await importFreshLogger();

    Logger.warn('token secret_abc123', {
      url: 'https://example.com/page?token=abc&utm_source=x',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer secret',
      },
    });
    Logger.error('[Uncaught Exception] failure secret_abc123', new Error('boom'));

    const buffer = Logger.getBuffer();
    expect(buffer).not.toBeNull();
    const entries = buffer.getAll();
    const warnEntry = entries.find(entry => entry.level === 'warn');
    const errorEntry = entries.find(entry => entry.level === 'error');

    expect(warnEntry).toEqual(
      expect.objectContaining({
        source: 'background',
        message: expect.stringContaining('[REDACTED_TOKEN]'),
      })
    );
    expect(warnEntry.context).toEqual(
      expect.objectContaining({
        url: 'https://example.com/page?token=[REDACTED_TOKEN]',
        headers: {
          Accept: 'application/json',
          Authorization: '[REDACTED_HEADER]',
        },
      })
    );
    expect(errorEntry.message).toContain('[Uncaught Exception] failure');
    expect(errorEntry.context).toEqual(
      expect.objectContaining({
        message: 'boom',
        name: '[REDACTED_TITLE]',
        stack: expect.stringContaining('Error: boom'),
      })
    );
  });

  test('addLogToBuffer preserves source and sanitizes context before pushing', async () => {
    installBackgroundRuntime({ versionName: '1.0.0-dev' });
    const { default: Logger } = await importFreshLogger();

    Logger.addLogToBuffer({
      level: 'info',
      message: 'manual secret_abc123',
      source: '/options.html',
      context: {
        title: 'Private page title',
        nested: {
          password: 'do-not-log',
        },
      },
    });

    const entry = Logger.getBuffer()
      .getAll()
      .find(log => log.source === '/options.html');
    expect(entry).toEqual(
      expect.objectContaining({
        level: 'info',
        source: '/options.html',
        message: 'manual [REDACTED_TOKEN]',
      })
    );
    expect(entry.context).toEqual({
      title: '[REDACTED_TITLE]',
      nested: {
        password: '[REDACTED_SENSITIVE_KEY]',
      },
    });
  });

  test('parseArgsToContext keeps Error fields and extra details', async () => {
    installBackgroundRuntime();
    const { parseArgsToContext } = await importFreshLogger();
    const error = new TypeError('bad shape');
    error.code = 'ERR_BAD_SHAPE';

    expect(parseArgsToContext([error, 'detail'])).toEqual(
      expect.objectContaining({
        message: 'bad shape',
        name: 'TypeError',
        code: 'ERR_BAD_SHAPE',
        details: ['detail'],
      })
    );
    expect(parseArgsToContext(['plain', 42])).toEqual({
      details: ['plain', 42],
    });
  });

  test('content-script bridge batches debug logs and serializes IPC payloads safely', async () => {
    jest.useFakeTimers();
    globalThis.self = {
      addEventListener: jest.fn(),
    };
    globalThis.window = globalThis.self;
    globalThis.chrome = makeChromeMock({ versionName: '1.0.0-dev' });

    const { default: Logger } = await importFreshLogger();
    const circular = { name: 'native' };
    circular.self = circular;

    Logger.info('queued info', circular, () => {}, Symbol('flag'));
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();

    jest.advanceTimersByTime(500);

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'devLogSinkBatch',
        logs: [
          expect.objectContaining({
            level: 'info',
            message: 'queued info',
            args: expect.any(Array),
          }),
        ],
      }),
      expect.any(Function)
    );
    const sentArgs = chrome.runtime.sendMessage.mock.calls[0][0].logs[0].args;
    expect(sentArgs[0].self).toBe(sentArgs[0]);
    expect(sentArgs[1]).toBe('[Function]');
    expect(sentArgs[2]).toBe('Symbol(flag)');
  });

  test('runtime send failures and frame-removal errors are safe no-ops', async () => {
    installBackgroundRuntime({
      sendMessageImpl: jest.fn(() => {
        throw new Error('runtime disconnected');
      }),
    });
    const { default: Logger } = await importFreshLogger();

    expect(() => Logger.warn('bridge failure', { ok: true })).not.toThrow();

    consoleSpies.error.mockClear();
    Logger.error('Frame with ID 10 was removed');
    expect(consoleSpies.error).not.toHaveBeenCalled();
  });
});
