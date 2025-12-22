/**
 * Action Handlers
 *
 * 包含所有具體的消息處理邏輯，通過依賴注入接收服務實例。
 *
 * @module handlers/actionHandlers
 */

/* global chrome, Logger */

// Logger definition handled by build process (global injection)

import { normalizeUrl } from '../../utils/urlUtils.js';
import { buildHighlightBlocks } from '../utils/BlockBuilder.js';
import { isRestrictedInjectionUrl } from '../services/InjectionService.js';

/**
 * 處理內容提取結果
 * @param {Object} rawResult - 注入腳本返回的原始結果
 * @param {Array} highlights - 標註數據
 * @returns {Object} 處理後的內容結果 { title, blocks, siteIcon }
 */
export function processContentResult(rawResult, highlights) {
  // 正規化所有欄位，確保不修改原始輸入
  const title = rawResult?.title || 'Untitled';
  const siteIcon = rawResult?.siteIcon ?? null;
  const blocks = Array.isArray(rawResult?.blocks) ? [...rawResult.blocks] : [];

  // 添加標註區塊
  if (highlights && highlights.length > 0) {
    const highlightBlocks = buildHighlightBlocks(highlights);
    blocks.push(...highlightBlocks);
  }

  return { title, blocks, siteIcon };
}

/**
 * 創建並返回所有 Action Handlers
 * @param {Object} services - 服務實例集合
 * @param {NotionService} services.notionService
 * @param {StorageService} services.storageService
 * @param {InjectionService} services.injectionService
 * @param {PageContentService} services.pageContentService
 * @returns {Object} 處理函數映射
 */
export function createActionHandlers(services) {
  const { notionService, storageService, injectionService, pageContentService } = services;

  /**
   * 清理頁面標記的輔助函數
   */
  async function clearPageHighlights(tabId) {
    try {
      await injectionService.injectHighlighter(tabId);
      await injectionService.inject(tabId, () => {
        if (window.clearPageHighlights) {
          window.clearPageHighlights();
        }
      });
    } catch (error) {
      console.warn('Failed to clear page highlights:', error);
    }
  }

  /**
   * 根據頁面狀態決定並執行保存操作
   */
  async function determineAndExecuteSaveAction(params) {
    const {
      savedData,
      normUrl,
      dataSourceId,
      dataSourceType,
      contentResult,
      highlights,
      activeTabId,
      sendResponse,
    } = params;

    const imageCount = contentResult.blocks.filter(block => block.type === 'image').length;

    // 已有保存記錄：檢查頁面是否仍存在
    if (savedData?.notionPageId) {
      const pageExists = await notionService.checkPageExists(savedData.notionPageId);

      if (pageExists === null) {
        Logger.warn(
          `⚠️ 無法確認 Notion 頁面存在性 (Page ID: ${savedData.notionPageId})，中止保存操作。`
        );
        sendResponse({
          success: false,
          error:
            'Network error or service unavailable while checking page existence. Please try again later.',
        });
        return;
      }

      if (pageExists) {
        // 頁面存在：更新標註或內容
        if (highlights.length > 0) {
          // 只更新標註
          const highlightBlocks = buildHighlightBlocks(highlights);
          const result = await notionService.updateHighlightsSection(
            savedData.notionPageId,
            highlightBlocks
          );

          if (result.success) {
            result.highlightCount = highlights.length;
            result.highlightsUpdated = true;
            // 更新本地時間戳以保持數據一致性
            await storageService.setSavedPageData(normUrl, {
              ...savedData,
              lastUpdated: new Date().toISOString(),
            });
          }
          sendResponse(result);
        } else {
          // 刷新頁面內容
          const result = await notionService.refreshPageContent(
            savedData.notionPageId,
            contentResult.blocks,
            { updateTitle: true, title: contentResult.title }
          );

          if (result.success) {
            result.imageCount = imageCount;
            result.blockCount = contentResult.blocks.length;
            result.updated = true;
            // 更新本地時間戳以保持數據一致性
            await storageService.setSavedPageData(normUrl, {
              ...savedData,
              lastUpdated: new Date().toISOString(),
            });
          }
          sendResponse(result);
        }
      } else {
        // 頁面已刪除：清理狀態並創建新頁面
        Logger.log('Notion page was deleted, clearing local state and creating new page');
        await storageService.clearPageState(normUrl);
        await clearPageHighlights(activeTabId);

        // 創建新頁面
        const { pageData, validBlocks } = notionService.buildPageData({
          title: contentResult.title,
          pageUrl: normUrl,
          dataSourceId,
          dataSourceType,
          blocks: contentResult.blocks,
          siteIcon: contentResult.siteIcon,
        });

        const result = await notionService.createPage(pageData, {
          autoBatch: true,
          allBlocks: validBlocks,
        });

        if (result.success) {
          // 保存狀態
          await storageService.setSavedPageData(normUrl, {
            notionPageId: result.pageId,
            notionUrl: result.url,
            title: contentResult.title,
            savedAt: Date.now(),
          });

          result.imageCount = imageCount;
          result.blockCount = contentResult.blocks.length;
          result.created = true;
          result.recreated = true;
        }
        sendResponse(result);
      }
    } else {
      // 首次保存
      const { pageData, validBlocks } = notionService.buildPageData({
        title: contentResult.title,
        pageUrl: normUrl,
        dataSourceId,
        dataSourceType,
        blocks: contentResult.blocks,
        siteIcon: contentResult.siteIcon,
      });

      const result = await notionService.createPage(pageData, {
        autoBatch: true,
        allBlocks: validBlocks,
      });

      if (result.success) {
        // 保存狀態
        await storageService.setSavedPageData(normUrl, {
          notionPageId: result.pageId,
          notionUrl: result.url,
          title: contentResult.title,
          savedAt: Date.now(),
        });

        result.imageCount = imageCount;
        result.blockCount = contentResult.blocks.length;
        result.created = true;
      }
      sendResponse(result);
    }
  }

  // --- Handlers ---

  return {
    /**
     * 處理用戶快捷鍵激活（來自 Preloader）
     */
    USER_ACTIVATE_SHORTCUT: async (request, sender, sendResponse) => {
      try {
        if (!sender.tab || !sender.tab.id) {
          Logger.warn('[USER_ACTIVATE_SHORTCUT] No tab context');
          sendResponse({ success: false, error: 'No tab context' });
          return;
        }

        const tabId = sender.tab.id;
        const tabUrl = sender.tab.url;
        Logger.log(`⚡ [USER_ACTIVATE_SHORTCUT] Triggered from tab ${tabId}`);

        // 檢查是否為受限頁面
        if (tabUrl && isRestrictedInjectionUrl(tabUrl)) {
          Logger.warn(`[USER_ACTIVATE_SHORTCUT] Restricted URL: ${tabUrl}`);
          sendResponse({
            success: false,
            error: '此頁面不支援標註功能（系統頁面或受限網址）',
          });
          return;
        }

        // 確保 Bundle 已注入（捕獲可能的注入錯誤）
        try {
          await injectionService.ensureBundleInjected(tabId);
        } catch (injectionError) {
          Logger.error('[USER_ACTIVATE_SHORTCUT] Bundle injection failed:', injectionError);
          sendResponse({
            success: false,
            error: `Bundle 注入失敗: ${injectionError.message}`,
          });
          return;
        }

        // 等待 Bundle 完全就緒（重試機制）
        const maxRetries = 10;
        const retryDelay = 150; // ms
        let bundleReady = false;

        for (let i = 0; i < maxRetries; i++) {
          try {
            const pingResponse = await new Promise((resolve, reject) => {
              chrome.tabs.sendMessage(tabId, { action: 'PING' }, result => {
                if (chrome.runtime.lastError) {
                  reject(new Error(chrome.runtime.lastError.message));
                } else {
                  resolve(result);
                }
              });
            });

            if (pingResponse?.status === 'bundle_ready') {
              bundleReady = true;
              Logger.log(`[USER_ACTIVATE_SHORTCUT] Bundle ready on attempt ${i + 1}`);
              break;
            }
          } catch (_pingError) {
            // Bundle 還未就緒，等待後重試
            if (i < maxRetries - 1) {
              await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
          }
        }

        if (!bundleReady) {
          Logger.warn(`[USER_ACTIVATE_SHORTCUT] Bundle not ready after ${maxRetries} retries`);
          sendResponse({
            success: false,
            error: 'Bundle 初始化超時，請重試或刷新頁面',
          });
          return;
        }

        // 發送消息顯示 highlighter
        chrome.tabs.sendMessage(tabId, { action: 'showHighlighter' }, response => {
          if (chrome.runtime.lastError) {
            Logger.warn(
              '[USER_ACTIVATE_SHORTCUT] Failed to show highlighter:',
              chrome.runtime.lastError.message
            );
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
          } else {
            Logger.log('[USER_ACTIVATE_SHORTCUT] Highlighter shown successfully');
            sendResponse({ success: true, response });
          }
        });
      } catch (error) {
        Logger.error('[USER_ACTIVATE_SHORTCUT] Unexpected error:', error);
        sendResponse({ success: false, error: error.message });
      }
    },

    /**
     * 保存頁面
     */
    savePage: async (request, sender, sendResponse) => {
      try {
        const tabs = await new Promise(resolve =>
          chrome.tabs.query({ active: true, currentWindow: true }, resolve)
        );

        const activeTab = tabs[0];
        if (!activeTab || !activeTab.id) {
          sendResponse({ success: false, error: 'Could not get active tab.' });
          return;
        }

        const config = await storageService.getConfig([
          'notionApiKey',
          'notionDataSourceId',
          'notionDatabaseId',
          'notionDataSourceType',
        ]);

        const dataSourceId = config.notionDataSourceId || config.notionDatabaseId;
        const dataSourceType = config.notionDataSourceType || 'data_source';

        Logger.log(`保存目標: ID=${dataSourceId}, 類型=${dataSourceType}`);

        if (!config.notionApiKey || !dataSourceId) {
          sendResponse({ success: false, error: 'API Key or Data Source ID is not set.' });
          return;
        }

        // 重要：設置 Service 的 API Key
        notionService.setApiKey(config.notionApiKey);

        const normUrl = normalizeUrl(activeTab.url || '');
        const savedData = await storageService.getSavedPageData(normUrl);

        // 注入 highlighter 並收集標記
        await injectionService.injectHighlighter(activeTab.id);
        const highlights = await injectionService.collectHighlights(activeTab.id);

        Logger.log('📊 收集到的標註數據:', highlights);

        // 注入並執行內容提取
        let result = null;

        try {
          result = await pageContentService.extractContent(activeTab.id);
          Logger.log('✅ [PageContentService] 內容提取成功');
        } catch (error) {
          Logger.error('❌ [PageContentService] 提取失敗:', error.message);
        }

        if (!result || !result.title || !result.blocks) {
          console.error('❌ Content extraction result validation failed:', {
            result,
            url: activeTab.url,
          });
          let errorMessage = 'Could not parse the article content.';
          if (!result) {
            errorMessage = 'Content extraction script returned no result.';
          } else if (!result.title) {
            errorMessage = 'Content extraction failed to get page title.';
          } else if (!result.blocks) {
            errorMessage = 'Content extraction failed to generate content blocks.';
          }

          sendResponse({
            success: false,
            error: `${errorMessage} Please check the browser console for details.`,
          });
          return;
        }

        // 處理內容結果並添加標註
        const contentResult = processContentResult(result, highlights);

        // 執行保存操作
        await determineAndExecuteSaveAction({
          savedData,
          normUrl,
          dataSourceId,
          dataSourceType,
          contentResult,
          highlights,
          activeTabId: activeTab.id,
          sendResponse,
        });
      } catch (error) {
        console.error('Error in handleSavePage:', error);
        sendResponse({ success: false, error: error.message });
      }
    },

    /**
     * 打開 Notion 頁面
     */
    openNotionPage: async (request, sender, sendResponse) => {
      try {
        const pageUrl = request.url;
        if (!pageUrl) {
          sendResponse({ success: false, error: 'No URL provided' });
          return;
        }

        const normUrl = normalizeUrl(pageUrl);
        const savedData = await storageService.getSavedPageData(normUrl);

        if (!savedData || !savedData.notionPageId) {
          sendResponse({
            success: false,
            error: '此頁面尚未保存到 Notion，請先點擊「保存頁面」',
          });
          return;
        }

        let notionUrl = savedData.notionUrl;
        if (!notionUrl && savedData.notionPageId) {
          notionUrl = `https://www.notion.so/${savedData.notionPageId.replace(/-/g, '')}`;
          Logger.log('🔗 為頁面生成 Notion URL:', notionUrl);
        }

        if (!notionUrl) {
          sendResponse({ success: false, error: '無法獲取 Notion 頁面 URL' });
          return;
        }

        chrome.tabs.create({ url: notionUrl }, tab => {
          if (chrome.runtime.lastError) {
            console.error('Failed to open Notion page:', chrome.runtime.lastError);
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
          } else {
            Logger.log('✅ Opened Notion page in new tab:', notionUrl);
            sendResponse({ success: true, tabId: tab.id, notionUrl });
          }
        });
      } catch (error) {
        console.error('❌ handleOpenNotionPage 錯誤:', error);
        sendResponse({ success: false, error: error.message });
      }
    },

    /**
     * 檢查頁面是否存在
     */
    checkNotionPageExists: async (request, sender, sendResponse) => {
      try {
        const { pageId } = request;
        if (!pageId) {
          sendResponse({ success: false, error: 'Page ID is missing' });
          return;
        }

        const config = await storageService.getConfig(['notionApiKey']);
        if (!config.notionApiKey) {
          sendResponse({ success: false, error: 'Notion API Key not configured' });
          return;
        }

        notionService.setApiKey(config.notionApiKey);
        const exists = await notionService.checkPageExists(pageId);

        sendResponse({ success: true, exists });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    },

    /**
     * 檢查頁面保存狀態
     */
    checkPageStatus: async (request, sender, sendResponse) => {
      try {
        const tabs = await new Promise(resolve =>
          chrome.tabs.query({ active: true, currentWindow: true }, resolve)
        );
        const activeTab = tabs[0];

        if (!activeTab || !activeTab.id) {
          sendResponse({ success: false, error: 'Could not get active tab.' });
          return;
        }

        const normUrl = normalizeUrl(activeTab.url || '');
        const savedData = await storageService.getSavedPageData(normUrl);

        if (savedData?.notionPageId) {
          // 緩存驗證機制 (TTL: 60秒)
          // 避免每次點擊都請求 Notion API，提高響應速度
          const TTL = 60 * 1000;
          const lastVerified = savedData.lastVerifiedAt || 0;
          const now = Date.now();
          const isFresh = now - lastVerified < TTL;

          if (isFresh) {
            // 緩存有效，直接返回本地狀態
            sendResponse({
              success: true,
              isSaved: true,
              notionPageId: savedData.notionPageId,
              notionUrl: savedData.notionUrl,
              title: savedData.title,
            });
            return;
          }

          // 緩存過期，執行 API 驗證
          const config = await storageService.getConfig(['notionApiKey']);
          if (config.notionApiKey) {
            notionService.setApiKey(config.notionApiKey);

            // 嚴格檢查：確認頁面在 Notion 中是否真的存在
            const exists = await notionService.checkPageExists(savedData.notionPageId);

            if (exists === false) {
              // 頁面已在 Notion 刪除，清理本地狀態
              Logger.log(
                '⚠️ Page found in local storage but deleted in Notion. Clearing local state.'
              );
              await storageService.clearPageState(normUrl);
              sendResponse({
                success: true,
                isSaved: false,
                wasDeleted: true,
              });
              return;
            } else if (exists === true) {
              // 頁面存在，更新驗證時間
              savedData.lastVerifiedAt = now;
              // 注意：setSavedPageData 會覆蓋寫入，需傳入完整對象 (除了 lastUpdated 會自動更新)
              await storageService.setSavedPageData(normUrl, savedData);
            } else if (exists === null) {
              Logger.warn(
                '⚠️ Failed to verify page existence (network/API error). Assuming local state is correct.'
              );
            }
          }

          sendResponse({
            success: true,
            isSaved: true,
            notionPageId: savedData.notionPageId,
            notionUrl: savedData.notionUrl,
            title: savedData.title,
          });
        } else {
          sendResponse({
            success: true,
            isSaved: false,
          });
        }
      } catch (error) {
        console.error('Error in checkPageStatus:', error);
        sendResponse({ success: false, error: error.message });
      }
    },

    /**
     * 啟動/切換高亮工具
     */
    startHighlight: async (request, sender, sendResponse) => {
      try {
        const tabs = await new Promise(resolve =>
          chrome.tabs.query({ active: true, currentWindow: true }, resolve)
        );
        const activeTab = tabs[0];

        if (!activeTab || !activeTab.id) {
          sendResponse({ success: false, error: 'Could not get active tab.' });
          return;
        }

        // 檢查是否為受限頁面（chrome://、chrome-extension:// 等）
        if (isRestrictedInjectionUrl(activeTab.url)) {
          sendResponse({
            success: false,
            error: '此頁面不支援標註功能（系統頁面或受限網址）',
          });
          return;
        }

        // 嘗試先發送消息切換（如果腳本已加載）
        try {
          const response = await new Promise((resolve, reject) => {
            chrome.tabs.sendMessage(
              activeTab.id,
              { action: 'toggleHighlighter' },
              messageResponse => {
                if (chrome.runtime.lastError) {
                  // 如果最後一個錯誤存在，說明沒有監聽器或其他問題
                  reject(chrome.runtime.lastError);
                } else {
                  resolve(messageResponse);
                }
              }
            );
          });

          if (response?.success) {
            sendResponse({ success: true });
            return;
          }
        } catch (error) {
          // 消息發送失敗，說明腳本可能未加載，繼續執行注入
          Logger.log('發送 toggleHighlighter 失敗，嘗試注入腳本:', error);
        }

        const result = await injectionService.injectHighlighter(activeTab.id);
        if (result?.initialized) {
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'Highlighter initialization failed' });
        }
      } catch (error) {
        console.error('Error in startHighlight:', error);
        sendResponse({ success: false, error: error.message });
      }
    },

    /**
     * 更新現有頁面的標註
     */
    updateHighlights: async (request, sender, sendResponse) => {
      try {
        const tabs = await new Promise(resolve =>
          chrome.tabs.query({ active: true, currentWindow: true }, resolve)
        );
        const activeTab = tabs[0];

        if (!activeTab || !activeTab.id) {
          sendResponse({ success: false, error: 'Could not get active tab.' });
          return;
        }

        const config = await storageService.getConfig(['notionApiKey']);
        if (!config.notionApiKey) {
          sendResponse({ success: false, error: 'API Key is not set.' });
          return;
        }

        notionService.setApiKey(config.notionApiKey);

        const normUrl = normalizeUrl(activeTab.url || '');
        const savedData = await storageService.getSavedPageData(normUrl);

        if (!savedData || !savedData.notionPageId) {
          sendResponse({
            success: false,
            error: 'Page not saved yet. Please save the page first.',
          });
          return;
        }

        const highlights = await injectionService.collectHighlights(activeTab.id);

        // 轉換標記為 Blocks
        const highlightBlocks = buildHighlightBlocks(highlights);

        // 調用 NotionService 更新標記
        const result = await notionService.updateHighlightsSection(
          savedData.notionPageId,
          highlightBlocks
        );

        if (result.success) {
          result.highlightsUpdated = true;
          result.highlightCount = highlights.length;
        }
        sendResponse(result);
      } catch (error) {
        console.error('Error in handleUpdateHighlights:', error);
        sendResponse({ success: false, error: error.message });
      }
    },

    /**
     * 同步標註 (從請求 payload 中獲取)
     */
    syncHighlights: async (request, sender, sendResponse) => {
      try {
        const tabs = await new Promise(resolve =>
          chrome.tabs.query({ active: true, currentWindow: true }, resolve)
        );

        const activeTab = tabs[0];
        if (!activeTab || !activeTab.id) {
          sendResponse({ success: false, error: '無法獲取當前標籤頁' });
          return;
        }

        const config = await storageService.getConfig(['notionApiKey']);

        if (!config.notionApiKey) {
          sendResponse({ success: false, error: 'API Key 未設置' });
          return;
        }

        notionService.setApiKey(config.notionApiKey);

        const normUrl = normalizeUrl(activeTab.url || '');
        const savedData = await storageService.getSavedPageData(normUrl);

        if (!savedData || !savedData.notionPageId) {
          sendResponse({
            success: false,
            error: '頁面尚未保存到 Notion，請先點擊「保存頁面」',
          });
          return;
        }

        const highlights = request.highlights || [];
        Logger.log(`📊 準備同步 ${highlights.length} 個標註到頁面: ${savedData.notionPageId}`);

        if (highlights.length === 0) {
          sendResponse({
            success: true,
            message: '沒有新標註需要同步',
            highlightCount: 0,
          });
          return;
        }

        // 轉換標記為 Blocks
        const highlightBlocks = buildHighlightBlocks(highlights);

        // 調用 NotionService 更新標記
        const result = await notionService.updateHighlightsSection(
          savedData.notionPageId,
          highlightBlocks
        );

        if (result.success) {
          Logger.log(`✅ 成功同步 ${highlights.length} 個標註`);
          result.highlightCount = highlights.length;
          result.message = `成功同步 ${highlights.length} 個標註`;
        } else {
          console.error('❌ 同步標註失敗:', result.error);
        }
        sendResponse(result);
      } catch (error) {
        console.error('❌ handleSyncHighlights 錯誤:', error);
        sendResponse({ success: false, error: error.message });
      }
    },

    /**
     * 執行標註數據遷移
     * 從選項頁面發起，將舊版標註升級為現代格式
     * 使用 Headless Tab 策略：在後台分頁中執行 DOM 感知的遷移
     */
    migration_execute: async (request, sender, sendResponse) => {
      let createdTabId = null;

      try {
        const { url } = request;
        if (!url) {
          sendResponse({ success: false, error: '缺少 URL 參數' });
          return;
        }

        Logger.log(`🔄 [Migration] 開始遷移: ${url}`);

        // 1. 檢查數據是否存在
        const pageKey = `highlights_${url}`;
        const result = await chrome.storage.local.get(pageKey);
        const data = result[pageKey];

        if (!data) {
          sendResponse({ success: true, message: '無數據需要遷移' });
          return;
        }

        // 2. 查找或創建分頁
        const tabs = await chrome.tabs.query({ url });
        let targetTab = null;

        if (tabs.length > 0) {
          // 使用已存在的分頁
          targetTab = tabs[0];
          Logger.log(`📌 [Migration] 使用已存在的分頁: ${targetTab.id}`);
        } else {
          // 創建新的後台分頁（不激活）
          targetTab = await chrome.tabs.create({
            url,
            active: false,
          });
          createdTabId = targetTab.id;
          Logger.log(`🆕 [Migration] 創建新分頁: ${targetTab.id}`);

          // 等待分頁加載完成 (帶超時保護)
          await new Promise((resolve, reject) => {
            const TIMEOUT_MS = 15000;
            let timeoutId = null;
            let listener = null; // 提前聲明變量以解決作用域問題

            /**
             * 清理監聽器和計時器
             */
            const cleanup = () => {
              if (listener && chrome.tabs.onUpdated.hasListener(listener)) {
                chrome.tabs.onUpdated.removeListener(listener);
              }
              if (timeoutId) {
                clearTimeout(timeoutId);
              }
            };

            /**
             * 監聽分頁更新狀態的回調函數
             * @param {number} tabId - 更新的分頁 ID
             * @param {object} changeInfo - 分頁變更信息
             */
            listener = (tabId, changeInfo) => {
              if (tabId === targetTab.id && changeInfo.status === 'complete') {
                cleanup();
                resolve();
              }
            };

            // 設置監聽器
            chrome.tabs.onUpdated.addListener(listener);

            // 設置超時
            timeoutId = setTimeout(() => {
              cleanup();
              reject(new Error(`分頁加載超時 (${TIMEOUT_MS}ms)`));
            }, TIMEOUT_MS);

            // 檢查分頁當前狀態 (處理競態條件)
            chrome.tabs
              .get(targetTab.id)
              .then(tab => {
                if (tab && tab.status === 'complete') {
                  cleanup();
                  resolve();
                }
              })
              .catch(error => {
                // 如果分頁無法獲取 (例如已關閉)，則報錯
                cleanup();
                reject(new Error(`無法獲取分頁狀態: ${error.message}`));
              });
          });
        }

        // 3. 注入 migration-executor.js
        Logger.log(`💉 [Migration] 注入遷移執行器到分頁: ${targetTab.id}`);
        await new Promise(resolve => setTimeout(resolve, 500)); // 額外緩衝確保腳本環境就緒
        await chrome.scripting.executeScript({
          target: { tabId: targetTab.id },
          files: ['dist/migration-executor.js'],
        });

        // 4. 執行遷移
        Logger.log('🚀 [Migration] 執行 DOM 遷移...');
        const migrationResult = await chrome.scripting.executeScript({
          target: { tabId: targetTab.id },
          func: async () => {
            // 在分頁上下文中執行
            if (!window.MigrationExecutor) {
              return { error: 'MigrationExecutor 未載入' };
            }

            if (!window.HighlighterV2?.manager) {
              return { error: 'HighlighterV2.manager 未初始化' };
            }

            const executor = new window.MigrationExecutor();
            const manager = window.HighlighterV2.manager;

            // 執行遷移
            const outcome = await executor.migrate(manager);
            const stats = executor.getStatistics();

            return {
              success: true,
              result: outcome,
              statistics: stats,
            };
          },
        });

        const execResult = migrationResult[0]?.result;

        if (execResult?.error) {
          throw new Error(execResult.error);
        }

        // 5. 清理創建的分頁
        if (createdTabId) {
          Logger.log(`🧹 [Migration] 關閉分頁: ${createdTabId}`);
          try {
            // 先檢查分頁是否存在再刪除，避免無謂的報錯
            const tab = await chrome.tabs.get(createdTabId).catch(() => null);
            if (tab) {
              await chrome.tabs.remove(createdTabId);
            }
          } catch (error) {
            Logger.warn(`[Migration] 無法關閉分頁 ${createdTabId} (可能已關閉):`, error.message);
          } finally {
            createdTabId = null;
          }
        }

        // 6. 返回結果
        const stats = execResult?.statistics || {};
        Logger.log(`✅ [Migration] 遷移完成: ${url}`, stats);

        sendResponse({
          success: true,
          count: stats.newHighlightsCreated || 0,
          message: `成功遷移 ${stats.newHighlightsCreated || 0} 個標註`,
          statistics: stats,
        });
      } catch (error) {
        Logger.error('❌ [Migration] 遷移失敗:', error);

        // 清理創建的分頁
        if (createdTabId) {
          try {
            // 先檢查分頁是否存在再刪除
            const tab = await chrome.tabs.get(createdTabId).catch(() => null);
            if (tab) {
              await chrome.tabs.remove(createdTabId);
            }
          } catch (cleanupError) {
            Logger.warn(
              `[Migration] 清理分頁 ${createdTabId} 失敗 (可能已關閉):`,
              cleanupError.message
            );
          } finally {
            createdTabId = null;
          }
        }

        sendResponse({ success: false, error: error.message });
      }
    },

    /**
     * 刪除標註數據
     * 從選項頁面發起，刪除指定 URL 的所有標註
     */
    migration_delete: async (request, sender, sendResponse) => {
      try {
        const { url } = request;
        if (!url) {
          sendResponse({ success: false, error: '缺少 URL 參數' });
          return;
        }

        Logger.log(`🗑️ [Migration] 開始刪除: ${url}`);

        const pageKey = `highlights_${url}`;

        // 檢查數據是否存在
        const result = await chrome.storage.local.get(pageKey);
        const data = result[pageKey];

        if (!data) {
          sendResponse({ success: true, message: '數據不存在，無需刪除' });
          return;
        }

        // 刪除數據
        await chrome.storage.local.remove(pageKey);

        Logger.log(`✅ [Migration] 刪除完成: ${url}`);
        sendResponse({
          success: true,
          message: '成功刪除標註數據',
        });
      } catch (error) {
        Logger.error('❌ [Migration] 刪除失敗:', error);
        sendResponse({ success: false, error: error.message });
      }
    },

    /**
     * 批量遷移標註數據
     * 直接在 Storage 中轉換格式，標記 needsRangeInfo
     * 用戶訪問頁面時會自動完成 rangeInfo 生成
     */
    migration_batch: async (request, sender, sendResponse) => {
      try {
        const { urls } = request;
        if (!urls || !Array.isArray(urls) || urls.length === 0) {
          sendResponse({ success: false, error: '缺少 URLs 參數' });
          return;
        }

        Logger.log(`📦 [Migration] 開始批量遷移: ${urls.length} 個頁面`);

        const results = {
          success: 0,
          failed: 0,
          details: [],
        };

        for (const url of urls) {
          try {
            const pageKey = `highlights_${url}`;
            const storageResult = await chrome.storage.local.get(pageKey);
            const data = storageResult[pageKey];

            if (!data) {
              results.details.push({ url, status: 'skipped', reason: '無數據' });
              continue;
            }

            // 提取標註數據（支持新舊格式）
            const oldHighlights = data.highlights || (Array.isArray(data) ? data : []);

            if (oldHighlights.length === 0) {
              results.details.push({ url, status: 'skipped', reason: '無標註' });
              continue;
            }

            // 轉換格式：對於沒有 rangeInfo 的項目添加 needsRangeInfo 標記
            const newHighlights = oldHighlights.map(item => ({
              ...item,
              needsRangeInfo: !item.rangeInfo,
            }));

            // 保存新格式數據
            await chrome.storage.local.set({
              [pageKey]: { url, highlights: newHighlights },
            });

            results.success++;
            results.details.push({
              url,
              status: 'success',
              count: newHighlights.length,
              pending: newHighlights.filter(highlight => highlight.needsRangeInfo).length,
            });

            Logger.log(`✅ [Migration] 批量遷移: ${url} (${newHighlights.length} 個標註)`);
          } catch (itemError) {
            results.failed++;
            results.details.push({ url, status: 'failed', reason: itemError.message });
            Logger.error(`❌ [Migration] 批量遷移失敗: ${url}`, itemError);
          }
        }

        Logger.log(`📦 [Migration] 批量遷移完成: 成功 ${results.success}, 失敗 ${results.failed}`);
        sendResponse({ success: true, results });
      } catch (error) {
        Logger.error('❌ [Migration] 批量遷移失敗:', error);
        sendResponse({ success: false, error: error.message });
      }
    },

    /**
     * 批量刪除標註數據
     * 一次性刪除多個 URL 的標註數據
     */
    migration_batch_delete: async (request, sender, sendResponse) => {
      try {
        const { urls } = request;
        if (!urls || !Array.isArray(urls) || urls.length === 0) {
          sendResponse({ success: false, error: '缺少 URLs 參數' });
          return;
        }

        Logger.log(`🗑️ [Migration] 開始批量刪除: ${urls.length} 個頁面`);

        const keysToRemove = urls.map(url => `highlights_${url}`);
        await chrome.storage.local.remove(keysToRemove);

        Logger.log(`✅ [Migration] 批量刪除完成: ${urls.length} 個頁面`);
        sendResponse({
          success: true,
          count: urls.length,
          message: `成功刪除 ${urls.length} 個頁面的標註數據`,
        });
      } catch (error) {
        Logger.error('❌ [Migration] 批量刪除失敗:', error);
        sendResponse({ success: false, error: error.message });
      }
    },

    /**
     * 獲取待完成 rangeInfo 的遷移項目
     * 返回所有包含 needsRangeInfo: true 的標註頁面列表
     */
    migration_get_pending: async (request, sender, sendResponse) => {
      try {
        const allData = await chrome.storage.local.get(null);
        const pendingItems = [];

        for (const [key, value] of Object.entries(allData)) {
          if (!key.startsWith('highlights_')) {
            continue;
          }

          const url = key.replace('highlights_', '');
          const highlights = value?.highlights || (Array.isArray(value) ? value : []);

          // 計算需要 rangeInfo 的標註數量
          const pendingCount = highlights.filter(
            highlight => highlight.needsRangeInfo === true
          ).length;

          if (pendingCount > 0) {
            pendingItems.push({
              url,
              totalCount: highlights.length,
              pendingCount,
            });
          }
        }

        Logger.log(`📋 [Migration] 待完成項目: ${pendingItems.length} 個頁面`);
        sendResponse({
          success: true,
          items: pendingItems,
          totalPages: pendingItems.length,
          totalPending: pendingItems.reduce((sum, item) => sum + item.pendingCount, 0),
        });
      } catch (error) {
        Logger.error('❌ [Migration] 獲取待完成項目失敗:', error);
        sendResponse({ success: false, error: error.message });
      }
    },

    /**
     * 處理來自 Content Script 的日誌轉發
     * 用於將 Content Script 的日誌集中到 Background Console
     */
    devLogSink: (request, sender, sendResponse) => {
      try {
        const level = request.level || 'log';
        const message = request.message || '';
        const args = Array.isArray(request.args) ? request.args : [];
        const prefix = '[ClientLog]';

        // 使用 Logger 輸出，這樣可以利用 Logger 的過濾和格式化功能
        if (level === 'warn') {
          Logger.warn(prefix, message, ...args);
        } else if (level === 'error') {
          Logger.error(prefix, message, ...args);
        } else if (level === 'info') {
          Logger.info(`${prefix} ${message}`, ...args);
        } else {
          Logger.log(`${prefix} ${message}`, ...args);
        }

        sendResponse({ success: true });
      } catch (error) {
        // 日誌處理不應崩潰
        sendResponse({ success: false, error: error.message });
      }
    },
  };
}
