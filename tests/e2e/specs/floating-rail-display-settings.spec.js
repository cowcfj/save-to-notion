import { test, expect } from '../fixtures';

/**
 * Floating Rail 顯示設定 E2E 測試
 *
 * 驗證當 chrome.storage.sync 中的 floatingRailPosition / floatingRailSize
 * 變更時，rail host 上的 CSS 自訂屬性會即時 hot-swap，無需重新整理頁面。
 *
 * 注意：dist/content.bundle.js 是 web_accessible_resource，
 * 一般網頁載入時不會自動注入，必須由 service worker 透過
 * chrome.scripting.executeScript 顯式注入後 entryAutoInit 才會建立 rail。
 * 這對齊 highlight.spec.js 的注入流程。
 */
test('changing settings updates rail CSS variables on host', async ({
  page,
  context,
  extensionId: _extensionId,
}) => {
  await page.goto('https://example.com');

  // 取得 background service worker（先檢查既存，否則等候事件）
  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker', { timeout: 5000 });
  }

  // 透過 service worker 取得 tabId 並注入 content bundle
  const targetTabId = await serviceWorker.evaluate(
    () =>
      new Promise(resolve => {
        chrome.tabs.query({ url: 'https://example.com/*' }, tabs => {
          resolve(tabs[0]?.id ?? null);
        });
      })
  );
  expect(targetTabId).not.toBeNull();

  await serviceWorker.evaluate(async tabId => {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['dist/content.bundle.js'],
    });
  }, targetTabId);

  const railHost = page.locator('#notion-floating-rail-host');
  await expect(railHost).toBeVisible({ timeout: 15_000 });

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
