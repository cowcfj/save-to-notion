/**
 * Notion Smart Clipper - Background Script
 * Refactored for modular service orchestration
 */

/* global chrome, Logger */

// Import Utils
import './utils/Logger.js'; // Side-effect import to register self.Logger

import { normalizeUrl, computeStableUrl } from './utils/urlUtils.js';

import { TAB_SERVICE } from './config/constants.js';

// Import Services
import { StorageService } from './background/services/StorageService.js';
import { NotionService } from './background/services/NotionService.js';
import {
  InjectionService,
  isRestrictedInjectionUrl,
  isRecoverableInjectionError,
} from './background/services/InjectionService.js';
import { PageContentService } from './background/services/PageContentService.js';
import { TabService } from './background/services/TabService.js';

// Import Handlers
import { MessageHandler } from './background/handlers/MessageHandler.js';
import { createSaveHandlers } from './background/handlers/saveHandlers.js';
import { createHighlightHandlers } from './background/handlers/highlightHandlers.js';
import { createMigrationHandlers } from './background/handlers/migrationHandlers.js';
import { createLogHandlers } from './background/handlers/logHandlers.js';
import { createNotionHandlers } from './background/handlers/notionHandlers.js';

// ==========================================
// SERVICE INITIALIZATION
// ==========================================

const injectionService = new InjectionService({ logger: Logger });
const pageContentService = new PageContentService({
  injectionService,
  logger: Logger,
});
const storageService = new StorageService({ logger: Logger });
const notionService = new NotionService({ logger: Logger });

// Initialize MessageHandler
const messageHandler = new MessageHandler({ logger: Logger });

// Create and Register Action Handlers
const actionHandlers = {
  ...createSaveHandlers({
    notionService,
    storageService,
    injectionService,
    pageContentService,
  }),
  ...createHighlightHandlers({
    notionService,
    storageService,
    injectionService,
  }),
  ...createMigrationHandlers({
    storageService,
    notionService,
  }),
  ...createLogHandlers(),
  ...createNotionHandlers({ notionService }),
};

messageHandler.registerAll(actionHandlers);

// TEST_EXPOSURE_START
// Expose handlers for E2E testing (Development/Test only)
if (globalThis.self !== undefined) {
  globalThis.actionHandlers = actionHandlers;
}
// TEST_EXPOSURE_END

const tabService = new TabService({
  logger: Logger,
  injectionService,
  normalizeUrl,
  computeStableUrl,
  getSavedPageData: url => storageService.getSavedPageData(url),
  isRestrictedUrl: isRestrictedInjectionUrl,
  isRecoverableError: isRecoverableInjectionError,
  // 新增驗證所需的依賴
  checkPageExists: (pageId, apiKey) => notionService.checkPageExists(pageId, { apiKey }),
  getApiKey: () => storageService.getConfig(['notionApiKey']).then(config => config.notionApiKey),
  clearPageState: url => storageService.clearPageState(url),
  setSavedPageData: (url, data) => storageService.setSavedPageData(url, data),
});

// ==========================================
// LISTENERS SETUP
// ==========================================

messageHandler.setupListener();
tabService.setupListeners();

// ==========================================
// LIFECYCLE MANAGEMENT
// ==========================================

// Initialize the extension
chrome.runtime.onInstalled.addListener(details => {
  Logger.ready('[Lifecycle] Notion Smart Clipper extension ready');

  // 處理擴展更新
  if (details.reason === 'update') {
    handleExtensionUpdate(details.previousVersion);
  } else if (details.reason === 'install') {
    handleExtensionInstall();
  }
});

/**
 * 處理擴展更新
 *
 * @param {string} previousVersion - 舊版本號
 */
async function handleExtensionUpdate(previousVersion) {
  const currentVersion = chrome.runtime.getManifest().version;
  Logger.success('[Lifecycle] 擴展已更新', {
    previousVersion,
    currentVersion,
    action: 'handleExtensionUpdate',
  });

  // 檢查是否需要顯示更新說明
  if (shouldShowUpdateNotification(previousVersion, currentVersion)) {
    await showUpdateNotification(previousVersion, currentVersion);
  }
}

/**
 * 處理擴展安裝
 */
function handleExtensionInstall() {
  Logger.success('[Lifecycle] 擴展首次安裝', { action: 'handleExtensionInstall' });
  // 可以在這裡添加歡迎頁面或設置引導
}

/**
 * 判斷是否需要顯示更新通知
 *
 * @param {string} previousVersion - 舊版本號
 * @param {string} currentVersion - 當前版本號
 * @returns {boolean} 是否顯示通知
 */
function shouldShowUpdateNotification(previousVersion, currentVersion) {
  // 跳過開發版本或測試版本
  if (!previousVersion || !currentVersion) {
    return false;
  }

  // 解析版本號
  const prevParts = previousVersion.split('.').map(Number);
  const currParts = currentVersion.split('.').map(Number);

  // 主版本或次版本更新時顯示通知
  if (currParts[0] > prevParts[0] || currParts[1] > prevParts[1]) {
    return true;
  }

  // 修訂版本更新且有重要功能時也顯示
  if (currParts[2] > prevParts[2]) {
    // 檢查是否為重要更新
    return isImportantUpdate(currentVersion);
  }

  return false;
}

/**
 * 檢查是否為重要更新
 *
 * @param {string} version - 版本號
 * @returns {boolean} 是否為重要更新
 */
function isImportantUpdate(version) {
  // 定義重要更新的版本列表
  const importantUpdates = [
    '2.7.3', // 修復超長文章截斷問題
    '2.8.0', // 商店更新說明功能
    // 可以繼續添加重要版本
  ];

  return importantUpdates.includes(version);
}

/**
 * 顯示更新通知
 *
 * @param {string} previousVersion - 舊版本號
 * @param {string} currentVersion - 當前版本號
 */
async function showUpdateNotification(previousVersion, currentVersion) {
  try {
    // 創建通知標籤頁
    const tab = await chrome.tabs.create({
      url: chrome.runtime.getURL('update-notification/update-notification.html'),
      active: true,
    });

    // 使用 Promise 包裝事件監聽，等待頁面載入完成
    await new Promise((resolve, reject) => {
      let timeoutId = null;
      let updateListener = null;
      let removeListener = null;

      /**
       * 清理函數：移除所有監聽器和計時器
       *
       * @returns {void}
       */
      const cleanup = () => {
        if (updateListener) {
          chrome.tabs.onUpdated.removeListener(updateListener);
        }
        if (removeListener) {
          chrome.tabs.onRemoved.removeListener(removeListener);
        }
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      };

      /**
       * 監聽分頁載入狀態
       *
       * @param {number} tabId - 分頁 ID
       * @param {object} changeInfo - 分頁變更資訊
       * @returns {void}
       */
      updateListener = (tabId, changeInfo) => {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          cleanup();
          resolve();
        }
      };

      /**
       * 監聽分頁被關閉
       *
       * @param {number} removedTabId - 被關閉的分頁 ID
       * @returns {void}
       */
      removeListener = removedTabId => {
        if (removedTabId === tab.id) {
          cleanup();
          reject(new Error('更新通知分頁已被關閉'));
        }
      };

      chrome.tabs.onUpdated.addListener(updateListener);
      chrome.tabs.onRemoved.addListener(removeListener);

      // 檢查分頁是否已經載入完成（處理競態條件：頁面可能在監聽器註冊前就已載入完成）
      chrome.tabs
        .get(tab.id)
        .then(currentTab => {
          if (currentTab?.status === 'complete') {
            cleanup();
            resolve();
          }
        })
        .catch(() => {
          // 分頁可能已被關閉，忽略錯誤（onRemoved 監聽器會處理）
        });

      // 設置超時保護，避免無限等待
      timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error('頁面載入超時'));
      }, TAB_SERVICE.LOADING_TIMEOUT_MS);
    });

    // 頁面載入完成後發送版本信息
    await chrome.tabs.sendMessage(tab.id, {
      type: 'UPDATE_INFO',
      previousVersion,
      currentVersion,
    });

    Logger.info('[Lifecycle] 已顯示更新通知頁面');
  } catch (error) {
    // 處理分頁可能已被關閉、載入超時或其他錯誤
    Logger.warn('[Lifecycle] 顯示更新通知失敗', { error, action: 'showUpdateNotification' });
  }
}

// ============================================================
// EXPORTS (For Testing)
// ============================================================
// TEST_EXPOSURE_START
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    storageService,
    notionService,
    injectionService,
    pageContentService,
    tabService,
    messageHandler,
    actionHandlers,
    handleExtensionUpdate,
    handleExtensionInstall,
    shouldShowUpdateNotification,
    isImportantUpdate,
    showUpdateNotification,
  };
}
// TEST_EXPOSURE_END
