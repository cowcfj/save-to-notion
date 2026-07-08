function createLoggerMock(overrides = {}) {
  return {
    debugEnabled: false,
    success: jest.fn(),
    start: jest.fn(),
    ready: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    getBuffer: jest.fn(() => []),
    addLogToBuffer: jest.fn(),
    ...overrides,
  };
}

function clearLoggerMock(loggerMock) {
  Object.values(loggerMock).forEach(value => {
    if (jest.isMockFunction(value)) {
      value.mockClear();
    }
  });
}

function restoreGlobalLogger(originalLogger) {
  if (originalLogger === undefined) {
    delete globalThis.Logger;
  } else {
    globalThis.Logger = originalLogger;
  }
}

function installGlobalLoggerMock(overrides = {}) {
  const originalLogger = globalThis.Logger;
  const loggerMock = createLoggerMock(overrides);

  globalThis.Logger = loggerMock;

  beforeEach(() => {
    clearLoggerMock(loggerMock);
    globalThis.Logger = loggerMock;
  });

  afterAll(() => {
    restoreGlobalLogger(originalLogger);
  });

  return loggerMock;
}

module.exports = {
  clearLoggerMock,
  createLoggerMock,
  installGlobalLoggerMock,
  restoreGlobalLogger,
};
