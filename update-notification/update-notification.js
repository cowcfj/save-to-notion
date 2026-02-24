/* global chrome */
// 更新通知頁面邏輯
'use strict';

(function () {
  let updateInfo = null;

  // 頁面載入完成後初始化
  document.addEventListener('DOMContentLoaded', () => {
    initializeUpdateNotification();
    setupEventListeners();
  });

  // 監聽來自 background script 的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'UPDATE_INFO') {
      updateInfo = message;
      displayUpdateInfo(message);
      sendResponse({ success: true });
    }
  });

  /**
   * 初始化更新通知頁面
   */
  function initializeUpdateNotification() {
    // 設置當前版本
    const currentVersion = chrome.runtime.getManifest().version;
    document.querySelector('#current-version').textContent = `v${currentVersion}`;

    // 如果沒有收到更新信息，使用默認值
    setTimeout(() => {
      if (!updateInfo) {
        displayDefaultUpdateInfo(currentVersion);
      }
    }, 2000);
  }

  /**
   * 設置事件監聽器
   */
  function setupEventListeners() {
    // 關閉按鈕
    document.querySelector('#close-btn').addEventListener('click', () => {
      window.close();
    });

    // 立即體驗按鈕
    document.querySelector('#try-now-btn').addEventListener('click', () => {
      // 打開擴展彈出窗口或設置頁面
      chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html') });
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
        window.close();
      }
    });
  }

  /**
   * 顯示更新信息
   *
   * @param {object} info
   */
  function displayUpdateInfo(info) {
    // 更新版本信息
    document.querySelector('#prev-version').textContent = `v${info.previousVersion}`;
    document.querySelector('#curr-version').textContent = `v${info.currentVersion}`;

    // 載入對應版本的更新內容
    loadUpdateContent(info.currentVersion);
  }

  /**
   * 顯示默認更新信息
   *
   * @param {string} currentVersion
   */
  function displayDefaultUpdateInfo(currentVersion) {
    document.querySelector('#prev-version').textContent = 'v—';
    document.querySelector('#curr-version').textContent = `v${currentVersion}`;
    loadUpdateContent(currentVersion);
  }

  /**
   * 載入更新內容
   *
   * @param {string} version
   */
  function loadUpdateContent(version) {
    const updateContent = getUpdateContentByVersion(version);
    const contentContainer = document.querySelector('#update-content');

    if (updateContent) {
      contentContainer.innerHTML = updateContent;
    } else {
      // 載入通用更新內容
      contentContainer.innerHTML = getGenericUpdateContent();
    }
  }

  /**
   * 根據版本獲取更新內容
   *
   * @param {string} version
   * @returns {string|undefined}
   */
  function getUpdateContentByVersion(version) {
    const updateContents = {
      '2.7.3': `
                <div class="update-section">
                    <h3 class="section-title">
                        <span>🐛</span>
                        核心修復
                    </h3>
                    <ul class="feature-list">
                        <li class="feature-item">
                            <span class="feature-icon">✅</span>
                            <div class="feature-content">
                                <h4>修復超長文章內容截斷問題</h4>
                                <p>現在支持保存任意長度的文章（8000+ 字），自動分批處理，確保內容完整保存</p>
                            </div>
                        </li>
                        <li class="feature-item">
                            <span class="feature-icon">⚡</span>
                            <div class="feature-content">
                                <h4>智能分批處理</h4>
                                <p>自動檢測內容長度，超過 100 個區塊時自動分批添加，遵守 Notion API 限制</p>
                            </div>
                        </li>
                        <li class="feature-item">
                            <span class="feature-icon">🔧</span>
                            <div class="feature-content">
                                <h4>完善的錯誤處理</h4>
                                <p>即使單個批次失敗，也會繼續處理剩餘內容，確保最大程度的內容保存</p>
                            </div>
                        </li>
                    </ul>
                </div>
            `,
      '2.8.0': `
                <div class="update-section">
                    <h3 class="section-title">
                        <span>🎉</span>
                        新功能
                    </h3>
                    <ul class="feature-list">
                        <li class="feature-item">
                            <span class="feature-icon">📢</span>
                            <div class="feature-content">
                                <h4>商店更新說明彈出</h4>
                                <p>擴展更新後自動顯示更新說明，讓您第一時間了解新功能和改進</p>
                            </div>
                        </li>
                        <li class="feature-item">
                            <span class="feature-icon">🔍</span>
                            <div class="feature-content">
                                <h4>可搜索的數據庫選擇器</h4>
                                <p>支持通過輸入數據庫名稱快速搜索和選擇，大幅提升用戶體驗</p>
                            </div>
                        </li>
                        <li class="feature-item">
                            <span class="feature-icon">📤</span>
                            <div class="feature-content">
                                <h4>設定導出導入</h4>
                                <p>支持備份和恢復擴展設定，方便跨設備遷移和數據備份</p>
                            </div>
                        </li>
                    </ul>
                </div>
            `,
    };

    return updateContents[version];
  }

  /**
   * 獲取通用更新內容
   *
   * @returns {string}
   */
  function getGenericUpdateContent() {
    return `
            <div class="update-section">
                <h3 class="section-title">
                    <span>🚀</span>
                    更新內容
                </h3>
                <ul class="feature-list">
                    <li class="feature-item">
                        <span class="feature-icon">✨</span>
                        <div class="feature-content">
                            <h4>功能改進和錯誤修復</h4>
                            <p>本次更新包含多項功能改進和錯誤修復，提升整體使用體驗</p>
                        </div>
                    </li>
                    <li class="feature-item">
                        <span class="feature-icon">🔧</span>
                        <div class="feature-content">
                            <h4>性能優化</h4>
                            <p>優化擴展性能，提升頁面保存和標註功能的響應速度</p>
                        </div>
                    </li>
                    <li class="feature-item">
                        <span class="feature-icon">🛡️</span>
                        <div class="feature-content">
                            <h4>穩定性提升</h4>
                            <p>修復已知問題，提升擴展在各種網站上的兼容性和穩定性</p>
                        </div>
                    </li>
                </ul>
            </div>
            <div class="update-section">
                <h3 class="section-title">
                    <span>📋</span>
                    詳細信息
                </h3>
                <p style="color: #718096; font-size: 14px; line-height: 1.6;">
                    查看完整的更新日誌以了解所有改進和修復的詳細信息。
                    如有任何問題或建議，歡迎通過 GitHub 或 Chrome 商店反饋。
                </p>
            </div>
        `;
  }

  // 頁面載入動畫
  window.addEventListener('load', () => {
    document.body.style.opacity = '1';
  });
})();
