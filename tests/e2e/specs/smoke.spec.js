import { test, expect } from '../fixtures';

test('Popup should load successfully', async ({ page, extensionId }) => {
  // 1. 導航到一個簡單的頁面，確保 Content Script 有機會注入 (雖然此測試主要測 Popup)
  await page.goto('https://example.com');

  // 2. 打開 Popup 頁面
  // 注意：在 Extension 環境中，Popup 通常是一個 HTML 文件
  // 我們可以直接導航到其 chrome-extension:// URL 來測試 UI
  const popupUrl = `chrome-extension://${extensionId}/popup/popup.html`;
  await page.goto(popupUrl);

  // 3. 驗證標題或其他關鍵元素存在
  await expect(page).toHaveTitle(/save to notion/i);

  // 驗證保存按鈕存在
  const saveBtn = page.locator('#save-button');
  await expect(saveBtn).toBeVisible();
});
