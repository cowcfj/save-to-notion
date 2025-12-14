import { test as base, chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';

export const test = base.extend({
  context: async ({}, use) => {
    // 構建後的擴充功能路徑
    const pathToExtension = path.join(__dirname, '../../dist');

    // 檢查 dist 目錄是否存在
    if (!fs.existsSync(pathToExtension)) {
      throw new Error(
        `Extension build not found at ${pathToExtension}. Please run 'npm run build' first.`
      );
    }

    const context = await chromium.launchPersistentContext('', {
      headless: false, // Extension 測試必須有頭模式
      args: [
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
