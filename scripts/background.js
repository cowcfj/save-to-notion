/**
 * Notion Smart Clipper - Background Script
 * Refactored for modular service orchestration
 */

/* global chrome, Logger */

// Import Utils
import './utils/Logger.js'; // Side-effect import to register self.Logger

import { normalizeUrl, computeStableUrl } from './utils/urlUtils.js';
import { getActiveNotionToken } from './utils/notionAuth.js';

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
import { MigrationService } from './background/services/MigrationService.js';

// Import Handlers
import { MessageHandler } from './background/handlers/MessageHandler.js';
import { createSaveHandlers } from './background/handlers/saveHandlers.js';
import { createHighlightHandlers } from './background/handlers/highlightHandlers.js';
import { createMigrationHandlers } from './background/handlers/migrationHandlers.js';
import { createLogHandlers } from './background/handlers/logHandlers.js';
import { createNotionHandlers } from './background/handlers/notionHandlers.js';
import { createSidepanelHandlers } from './background/handlers/sidepanelHandlers.js';

const UPDATE_NOTIFICATION_WINDOW_WIDTH = 480;
const UPDATE_NOTIFICATION_WINDOW_HEIGHT = 560;

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
// Initialize TabService
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
  getApiKey: () => getActiveNotionToken().then(result => result.token),
  clearPageState: url => storageService.clearPageState(url),
  clearNotionState: (url, options) => storageService.clearNotionState(url, options),
  clearNotionStateWithRetry: (url, options) =>
    storageService.clearNotionStateWithRetry(url, options),
  setSavedPageData: (url, data) => storageService.setSavedPageData(url, data),
});

const migrationService = new MigrationService(storageService, tabService, injectionService);

// Create and Register Action Handlers
const actionHandlers = {
  ...createSaveHandlers({
    notionService,
    storageService,
    injectionService,
    pageContentService,
    tabService,
    migrationService,
  }),
  ...createHighlightHandlers({
    notionService,
    storageService,
    injectionService,
    tabService,
    migrationService,
  }),
  ...createMigrationHandlers({
    storageService,
    notionService,
    migrationService,
  }),
  ...createLogHandlers(),
  ...createNotionHandlers({ notionService }),
  ...createSidepanelHandlers(),
};

messageHandler.registerAll(actionHandlers);

// TEST_EXPOSURE_START
// Expose handlers for E2E testing (Development/Test only)
if (globalThis.self !== undefined) {
  globalThis.actionHandlers = actionHandlers;
}
// TEST_EXPOSURE_END

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

  // 1. 主版本 (Major)
  if (currParts[0] > prevParts[0]) {
    return true;
  }
  if (currParts[0] < prevParts[0]) {
    return false; // 降級不通知
  }

  // 2. 次版本 (Minor) - 僅 Major 相同時才比較
  if (currParts[1] > prevParts[1]) {
    return true;
  }

  // Patch 版本升級不顯示通知（內容由 CHANGELOG.md 自動記錄）
  return false;
}

/**
 * 顯示更新通知小視窗
 *
 * 透過 URL 參數傳遞版本資訊，避免 sendMessage 競態條件。
 *
 * @param {string} previousVersion - 舊版本號
 * @param {string} currentVersion - 當前版本號
 */
async function showUpdateNotification(previousVersion, currentVersion) {
  try {
    const url = new URL(chrome.runtime.getURL('update-notification/update-notification.html'));
    url.searchParams.set('prev', previousVersion);
    url.searchParams.set('curr', currentVersion);

    await chrome.windows.create({
      url: url.toString(),
      type: 'popup',
      width: UPDATE_NOTIFICATION_WINDOW_WIDTH,
      height: UPDATE_NOTIFICATION_WINDOW_HEIGHT,
      focused: true,
    });

    Logger.info('[Lifecycle] 已顯示更新通知視窗');
  } catch (error) {
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
    showUpdateNotification,
  };
}
// TEST_EXPOSURE_END
