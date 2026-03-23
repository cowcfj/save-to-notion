/* global chrome */
// 更新通知頁面邏輯
'use strict';

(function () {
  /**
   * 初始化更新通知頁面
   *
   * 從 URL 參數讀取版本資訊，無 sendMessage 競態條件。
   */
  function initializeUpdateNotification() {
    const params = new URLSearchParams(globalThis.location.search);
    const prev = params.get('prev') ?? '—';
    const curr = params.get('curr') ?? chrome.runtime.getManifest().version;

    document.querySelector('#prev-version').textContent = `v${prev}`;
    document.querySelector('#curr-version').textContent = `v${curr}`;
    document.querySelector('#current-version').textContent = `v${curr}`;
  }

  /**
   * 設置事件監聽器
   */
  function setupEventListeners() {
    // 標題列關閉按鈕
    document.querySelector('#close-btn').addEventListener('click', () => {
      globalThis.close();
    });

    // 底部關閉按鈕
    document.querySelector('#close-action-btn').addEventListener('click', () => {
      globalThis.close();
    });

    // 查看完整更新日誌按鈕
    document.querySelector('#view-changelog-btn').addEventListener('click', () => {
      chrome.tabs.create({
        url: 'https://github.com/cowcfj/save-to-notion/blob/main/CHANGELOG.md',
      });
    });

    // ESC 鍵關閉
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        globalThis.close();
      }
    });
  }

  // 頁面載入完成後初始化
  document.addEventListener('DOMContentLoaded', () => {
    initializeUpdateNotification();
    setupEventListeners();
  });

  // 頁面載入動畫
  globalThis.addEventListener('load', () => {
    document.body.style.opacity = '1';
  });
})();
