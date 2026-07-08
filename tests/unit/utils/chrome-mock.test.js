describe('Chrome mock 預設行為', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    delete globalThis.chrome;
  });

  test('全域 chrome.runtime.lastError 預設為 undefined', () => {
    expect(globalThis.chrome.runtime.lastError).toBeUndefined();
  });

  test('重新載入共用 mock 時，fresh module 與既有 global 參考的 lastError 都預設為 undefined', () => {
    jest.resetModules();
    const chrome = require('../../mocks/chrome.js');

    // 這裡刻意不覆寫 globalThis.chrome，分開驗證 fresh module 與 setup.js 注入的既有參考
    // 都維持 lastError 預設為 undefined。
    expect(chrome.runtime.lastError).toBeUndefined();
    expect(globalThis.chrome.runtime.lastError).toBeUndefined();
  });

  test('測試 setup 還原後的 runtime.sendMessage 應保留 Promise 與 callback 雙模式契約', async () => {
    const callback = jest.fn();

    const result = await globalThis.chrome.runtime.sendMessage({ action: 'ping' }, callback);

    expect(result).toEqual({ success: true });
    expect(callback).toHaveBeenCalledWith({ success: true });
  });
});
