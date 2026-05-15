import { test, expect } from '../fixtures';

/**
 * Floating Rail 顯示設定 E2E 測試
 *
 * 驗證當 chrome.storage.sync 中的 floatingRailPosition / floatingRailSize
 * 變更時，rail host 上的 CSS 自訂屬性會即時 hot-swap，無需重新整理頁面。
 *
 * 注意：CSS custom properties 透過 inline style 設定時，
 * Playwright 的 toHaveCSS 在不同版本行為不一致；
 * 因此一律使用 expect.poll + el.style.getPropertyValue() 來查詢。
 */
test('changing settings updates rail CSS variables on host', async ({
  page,
  context,
  extensionId: _extensionId,
}) => {
  await page.goto('https://example.com');

  const railHost = page.locator('#notion-floating-rail-host');
  await expect(railHost).toBeVisible({ timeout: 5000 });

  // 取得 background service worker（先檢查既存，否則等候事件）
  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker', { timeout: 5000 });
  }

  const readVar = async name =>
    railHost.evaluate((el, varName) => el.style.getPropertyValue(varName), name);

  const expectVars = async expected => {
    for (const [name, value] of Object.entries(expected)) {
      await expect
        .poll(() => readVar(name), {
          timeout: 5000,
          message: `expected ${name} to equal ${value}`,
        })
        .toBe(value);
    }
  };

  // 1. 套用 top + small：頂部位置 + 小型尺寸
  await serviceWorker.evaluate(
    async settings =>
      new Promise(resolve => {
        chrome.storage.sync.set(settings, resolve);
      }),
    { floatingRailPosition: 'top', floatingRailSize: 'small' }
  );

  await expectVars({
    '--rail-top': '25%',
    '--rail-btn-size': '28px',
    '--rail-trigger-icon-size': '18px',
    '--rail-action-icon-size': '14px',
  });

  // 2. 切換為 bottom + large：底部位置 + 大型尺寸
  await serviceWorker.evaluate(
    async settings =>
      new Promise(resolve => {
        chrome.storage.sync.set(settings, resolve);
      }),
    { floatingRailPosition: 'bottom', floatingRailSize: 'large' }
  );

  await expectVars({
    '--rail-top': '75%',
    '--rail-btn-size': '34px',
    '--rail-trigger-icon-size': '22px',
    '--rail-action-icon-size': '18px',
  });
});
