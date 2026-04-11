describe('Chrome mock 預設行為', () => {
  afterEach(() => {
    jest.resetModules();
  });

  test('全域 chrome.runtime.lastError 預設為 undefined', () => {
    expect(globalThis.chrome.runtime.lastError).toBeUndefined();
  });

  test('重新載入共用 mock 時 lastError 預設為 undefined', () => {
    jest.resetModules();
    const chrome = require('../../mocks/chrome.js');

    expect(chrome.runtime.lastError).toBeUndefined();
    expect(globalThis.chrome.runtime.lastError).toBeUndefined();
  });
});
