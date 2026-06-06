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

module.exports = {
  createLoggerMock,
};
