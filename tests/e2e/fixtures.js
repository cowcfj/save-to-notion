import { test as base, chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import v8toIstanbul from 'v8-to-istanbul';

export const test = base.extend({
  context: async ({ browserName: _ }, use) => {
    // 構建後的擴充功能路徑
    const pathToExtension = path.join(__dirname, '../../dist');

    // 檢查 dist 目錄是否存在
    if (!fs.existsSync(pathToExtension)) {
      throw new Error(
        `Extension build not found at ${pathToExtension}. Please run 'npm run build' first.`
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
      timeout: 60000, // 增加啟動超時時間
      args: [
        ...ciArgs,
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
    });

    // 1. 監聽新頁面並開啟覆蓋率收集
    // 這裡的 page 包含: 測試目標頁面, Popup, Options 頁面
    await context.exposeBinding('__coverage__', () => {
      /* noop */
    }); // 預防性綁定

    context.on('page', async page => {
      try {
        await page.coverage.startJSCoverage({
          resetOnNavigation: false,
        });
      } catch (_err) {
        // 忽略錯誤
      }
    });

    // 為已經存在的頁面開啟覆蓋率 (如果有)
    for (const page of context.pages()) {
      await page.coverage.startJSCoverage({
        resetOnNavigation: false,
      });
    }

    await use(context);

    // 2. 停止並獲取覆蓋率 (從所有開啟的頁面)
    const allCoverage = [];

    for (const page of context.pages()) {
      try {
        const coverage = await page.coverage.stopJSCoverage();
        allCoverage.push(...coverage);
      } catch (_err) {
        // 忽略錯誤
      }
    }

    // 3. 處理覆蓋率數據
    for (const entry of allCoverage) {
      // 只處理擴充功能的腳本
      if (!entry.url.includes('chrome-extension://')) {
        continue;
      }

      const url = new URL(entry.url);
      // 排除第三方庫和非專案代碼 (粗略過濾)
      if (url.pathname.includes('node_modules')) {
        continue;
      }

      // 對應到本地文件路徑
      // entry.url 類似: chrome-extension://[id]/scripts/background.js
      const relativePath = url.pathname.replace(/^\//, '');
      const filePath = path.join(pathToExtension, relativePath);

      if (fs.existsSync(filePath)) {
        // 使用 v8-to-istanbul 轉換
        const converter = v8toIstanbul(filePath);
        await converter.load();
        converter.applyCoverage(entry.functions);

        // 轉換為 Istanbul 格式
        const istanbulCoverage = converter.toIstanbul();

        // 4. 存儲到 .nyc_output 目錄，供 merge 使用
        const nycOutput = path.join(__dirname, '../../coverage/e2e');
        if (!fs.existsSync(nycOutput)) {
          fs.mkdirSync(nycOutput, { recursive: true });
        }

        // 為每個文件/測試生成唯一報告
        const reportName = `playwright-${crypto.randomUUID()}.json`;
        fs.writeFileSync(path.join(nycOutput, reportName), JSON.stringify(istanbulCoverage));
      }
    }

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
        timeout: 30000,
      });

      // 打開一個頁面觸發 Extension 載入
      const tempPage = await context.newPage();
      await tempPage.goto('https://example.com', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
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
