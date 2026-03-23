/* global chrome */
// 更新通知頁面邏輯
'use strict';

(function () {
  function closeWindow() {
    globalThis.close();
  }

  /**
   * 初始化更新通知頁面
   *
   * 從 URL 參數讀取版本資訊，無 sendMessage 競態條件。
   */
  function initializeUpdateNotification() {
    const params = new URLSearchParams(globalThis.location.search);
    const prevParam = params.get('prev');
    const prev = prevParam || '—';
    const curr = params.get('curr') ?? chrome.runtime.getManifest().version;
    const prevVersionElement = document.querySelector('#prev-version');
    const currVersionElement = document.querySelector('#curr-version');
    const currentVersionElement = document.querySelector('#current-version');

    prevVersionElement.textContent = prevParam ? `v${prev}` : prev;
    currVersionElement.textContent = `v${curr}`;
    currentVersionElement.textContent = `v${curr}`;
  }

  /**
   * 設置事件監聽器
   */
  function setupEventListeners() {
    // 標題列關閉按鈕
    document.querySelector('#close-btn').addEventListener('click', closeWindow);

    // 底部關閉按鈕
    document.querySelector('#close-action-btn').addEventListener('click', closeWindow);

    // 查看完整更新日誌按鈕
    document.querySelector('#view-changelog-btn').addEventListener('click', () => {
      chrome.tabs.create({
        url: 'https://github.com/cowcfj/save-to-notion/blob/main/CHANGELOG.md',
      });
    });

    // ESC 鍵關閉
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        closeWindow();
      }
    });
  }

  // 頁面載入完成後初始化
  document.addEventListener('DOMContentLoaded', () => {
    initializeUpdateNotification();
    setupEventListeners();
  });
})();
