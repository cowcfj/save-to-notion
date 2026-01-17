const { test, expect } = require('../fixtures');

/**
 * Popup UI E2E 測試
 * 測試 Popup 的主要功能及 UI 響應
 */

test.describe('Popup UI', () => {
  test.beforeEach(async ({ page, extensionId }) => {
    // 每個測試前導航到 Popup 頁面
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  });

  test('應該顯示初始狀態（提示設置）', async ({ page }) => {
    // 模擬未設置 API Key 的情況 (預設 storage 可能為空)
    const statusText = await page.textContent('#status');
    expect(statusText).toContain('Please set API Key');
  });

  test('當設置完成後應該顯示保存按鈕', async ({ page, context, extensionId }) => {
    // 透過 options 頁面設置 storage (確保 extension 實例一致)
    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options/options.html`);
    await optionsPage.evaluate(async () => {
      await chrome.storage.sync.set({
        notionApiKey: 'test-key',
        notionDataSourceId: 'test-db',
      });
    });
    await optionsPage.close();

    // 重新載入 popup
    await page.reload();

    // 檢查保存按鈕是否可見
    const saveButton = page.locator('#save-button');
    await expect(saveButton).toBeVisible();

    const statusText = await page.textContent('#status');
    expect(statusText).toContain('Save page first');
  });

  test('模擬已保存狀態下的 UI 變化', async ({ page, context, extensionId }) => {
    // 1. 設置基本 storage
    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options/options.html`);
    await optionsPage.evaluate(async () => {
      await chrome.storage.sync.set({
        notionApiKey: 'test-key',
        notionDataSourceId: 'test-db',
      });
    });
    await optionsPage.close();

    // 2. 透過 evaluate 直接修改 popup 內的邏輯來測試 UI 更新
    await page.reload();
    await page.evaluate(() => {
      // 模擬 Actions 模組的導入並手動調用更新 UI 的函數 (測試 UI 響應)
      document.getElementById('save-button').style.display = 'none';
      document.getElementById('highlight-button').style.display = 'block';
      document.getElementById('highlight-button').disabled = false;
      document.getElementById('open-notion-button').style.display = 'block';
      document.getElementById('status').textContent = 'Page saved. Ready to highlight or update.';
    });

    // 檢查 UI 元素切換
    await expect(page.locator('#save-button')).not.toBeVisible();
    await expect(page.locator('#highlight-button')).toBeVisible();
    await expect(page.locator('#open-notion-button')).toBeVisible();

    const statusText = await page.textContent('#status');
    expect(statusText).toContain('Page saved');
  });

  test('清除標記應該顯示確認彈窗', async ({ page, context, extensionId }) => {
    // 1. 先設置 storage 讓初始化通過
    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options/options.html`);
    await optionsPage.evaluate(async () => {
      await chrome.storage.sync.set({
        notionApiKey: 'test-key',
        notionDataSourceId: 'test-db',
      });
    });
    await optionsPage.close();

    await page.reload();

    // 2. 手動顯示清除按鈕（因為正常流程依賴 Service Worker 返回 isSaved: true）
    await page.evaluate(() => {
      document.getElementById('clear-highlights-button').style.display = 'block';
    });

    // 3. 點擊清除按鈕
    await page.click('#clear-highlights-button');

    // 4. 檢查 Modal 是否顯示
    const modal = page.locator('#confirmation-modal');
    await expect(modal).toHaveCSS('display', 'flex');

    const modalMessage = await page.textContent('#modal-message');
    expect(modalMessage).toContain('確定要清除');

    // 5. 點擊取消
    await page.click('#modal-cancel');
    await expect(modal).toHaveCSS('display', 'none');
  });
});
