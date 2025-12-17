/**
 * Notion Smart Clipper - Background Script
 * Refactored for modular service orchestration
 */

/* global chrome */

// Import Utils
import Logger from './utils/Logger.module.js';
import { normalizeUrl } from './utils/urlUtils.js';

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
import { createActionHandlers } from './background/handlers/actionHandlers.js';

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
const actionHandlers = createActionHandlers({
  notionService,
  storageService,
  injectionService,
  pageContentService,
});

messageHandler.registerAll(actionHandlers);

// TEST_EXPOSURE_START
// Expose handlers for E2E testing (Development/Test only)
if (typeof self !== 'undefined') {
  self.actionHandlers = actionHandlers;
}
// TEST_EXPOSURE_END

// Initialize TabService
const tabService = new TabService({
  logger: Logger,
  injectionService,
  normalizeUrl,
  getSavedPageData: url => storageService.getSavedPageData(url),
  isRestrictedUrl: isRestrictedInjectionUrl,
  isRecoverableError: isRecoverableInjectionError,
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
  Logger.log('Notion Smart Clipper extension installed/updated');

  // 處理擴展更新
  if (details.reason === 'update') {
    handleExtensionUpdate(details.previousVersion);
  } else if (details.reason === 'install') {
    handleExtensionInstall();
  }
});

/**
 * 處理擴展更新
 */
async function handleExtensionUpdate(previousVersion) {
  const currentVersion = chrome.runtime.getManifest().version;
  Logger.log(`擴展已更新: ${previousVersion} → ${currentVersion}`);

  // 檢查是否需要顯示更新說明
  if (shouldShowUpdateNotification(previousVersion, currentVersion)) {
    await showUpdateNotification(previousVersion, currentVersion);
  }
}

/**
 * 處理擴展安裝
 */
function handleExtensionInstall() {
  Logger.log('擴展首次安裝');
  // 可以在這裡添加歡迎頁面或設置引導
}

/**
 * 判斷是否需要顯示更新通知
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
 */
async function showUpdateNotification(previousVersion, currentVersion) {
  try {
    // 創建通知標籤頁
    const tab = await chrome.tabs.create({
      url: chrome.runtime.getURL('update-notification/update-notification.html'),
      active: true,
    });

    // 等待頁面載入後傳送版本信息
    setTimeout(async () => {
      try {
        // 先確認分頁是否還存在，避免競態條件錯誤
        const existingTab = await chrome.tabs.get(tab.id).catch(() => null);
        if (!existingTab) {
          Logger.log('更新通知分頁已關閉，跳過發送訊息');
          return;
        }

        await chrome.tabs.sendMessage(tab.id, {
          type: 'UPDATE_INFO',
          previousVersion,
          currentVersion,
        });
      } catch (err) {
        Logger.log('發送更新信息失敗:', err);
      }
    }, 1000);

    Logger.log('已顯示更新通知頁面');
  } catch (error) {
    console.error('顯示更新通知失敗:', error);
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
  };
}
// TEST_EXPOSURE_END
