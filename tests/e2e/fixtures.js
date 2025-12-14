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

    const context = await chromium.launchPersistentContext('', {
      headless: Boolean(process.env.CI), // CI 環境使用 headless，本地使用 headed
      args: [
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
        const nycOutput = path.join(__dirname, '../../.nyc_output');
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
     * 一個簡單的方法是打開 chrome://extensions 頁面並解析，或者預設它是載入的第一個擴充功能。
     * 但更可靠的是在測試開始時打開 popup 或 options 頁面時獲取。
     * 這裡我們先留空，視具體測試需求獲取。
     */

    let [background] = context.serviceWorkers();
    if (!background) {
      background = await context.waitForEvent('serviceworker');
    }

    const extensionId = background.url().split('/')[2];
    await use(extensionId);
  },
});

export const expect = base.expect;
