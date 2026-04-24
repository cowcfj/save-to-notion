/**
 * @jest-environment jsdom
 */

import { getActiveTab } from '../../../../scripts/background/handlers/handlerUtils.js';
import { ERROR_MESSAGES } from '../../../../scripts/config/shared/messages.js';

describe('handlerUtils.getActiveTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('應返回當前活動標籤頁', async () => {
    const mockTab = { id: 123, url: 'https://example.com', active: true };
    chrome.tabs.query.mockResolvedValueOnce([mockTab]);

    await expect(getActiveTab()).resolves.toEqual(mockTab);
    expect(chrome.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
  });

  test('當沒有活動標籤頁時應拋出 NO_ACTIVE_TAB', async () => {
    chrome.tabs.query.mockResolvedValueOnce([]);

    await expect(getActiveTab()).rejects.toThrow(ERROR_MESSAGES.TECHNICAL.NO_ACTIVE_TAB);
  });

  test('當 chrome.tabs.query 回傳 undefined 時應拋出 NO_ACTIVE_TAB', async () => {
    chrome.tabs.query.mockResolvedValueOnce(undefined);

    await expect(getActiveTab()).rejects.toThrow(ERROR_MESSAGES.TECHNICAL.NO_ACTIVE_TAB);
  });

  test('當標籤頁缺少 id 時應拋出 NO_ACTIVE_TAB', async () => {
    chrome.tabs.query.mockResolvedValueOnce([{ url: 'https://example.com' }]);

    await expect(getActiveTab()).rejects.toThrow(ERROR_MESSAGES.TECHNICAL.NO_ACTIVE_TAB);
  });
});
