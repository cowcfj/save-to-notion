import { test as base, chromium } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

export const test = base.extend({
  context: async ({ browserName: _ }, use) => {
    // 擴充功能路徑 - 指向項目根目錄（manifest.json 所在位置）
    const pathToExtension = process.cwd();

    // 檢查 manifest.json 是否存在
    if (!fs.existsSync(path.join(pathToExtension, 'manifest.json'))) {
      throw new Error(
        `Extension manifest not found at ${pathToExtension}. Please check the extension structure.`
      );
    }

    // CI 環境專用參數
    // Chrome v109+ 支持 --headless=new 模式，可以運行 Extension
    // 參考: https://github.com/microsoft/playwright/issues/26862
    const ciArgs = process.env.CI
      ? [
          '--headless=new', // 新版 headless 模式，支持 Extension
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-software-rasterizer',
        ]
      : [];

    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium', // 使用 Chromium channel 啟用完整 Extension 支持
      headless: false, // 必須設為 false，由 --headless=new 參數控制
      timeout: 60_000, // 增加啟動超時時間
      args: [
        ...ciArgs,
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
    });

    await use(context);
    await context.close();
  },

  extensionId: async ({ context }, use) => {
    /*
     * 在 Background Page 開啟時獲取 extension ID。
     * 由於 Manifest V3 的 Background Service Worker 沒有總是開啟的頁面，
     * 我們可能需要由其他方式獲取，或者打開一個擴充功能頁面。
     *
     * Issue #37347: Manifest V3 的 Service Worker 是懶載入的，
     * 需要先導航到一個頁面觸發 Extension 載入。
     */

    // 先嘗試獲取已存在的 Service Worker
    let [background] = context.serviceWorkers();

    if (!background) {
      // Manifest V3 的 Service Worker 是懶載入的
      // 需要先打開頁面觸發 Extension 載入
      // 參考: https://github.com/microsoft/playwright/issues/37347
      const serviceWorkerPromise = context.waitForEvent('serviceworker', {
        timeout: 30_000,
      });

      // 打開一個頁面觸發 Extension 載入
      const tempPage = await context.newPage();
      await tempPage.goto('https://example.com', {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });

      try {
        background = await serviceWorkerPromise;
      } catch {
        // 列出當前所有頁面和 Service Worker 幫助調試
        const pages = context.pages();
        const workers = context.serviceWorkers();
        console.error(
          `[E2E Debug] 等待 Service Worker 超時。當前頁面數: ${pages.length}, Service Workers: ${workers.length}`
        );
        pages.forEach((page, idx) => {
          console.error(`[E2E Debug] 頁面 ${idx}: ${page.url()}`);
        });

        // 再次嘗試獲取 Service Worker
        [background] = workers;
        if (!background) {
          await tempPage.close();
          throw new Error('Extension Service Worker 未能啟動。請確認 Extension 構建正確。');
        }
      }

      // 關閉臨時頁面
      await tempPage.close();
    }

    const extensionId = background.url().split('/')[2];
    await use(extensionId);
  },
});

export const expect = base.expect;
