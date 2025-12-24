/**
 * Save Handlers
 *
 * 處理頁面保存、狀態檢查與相關導航操作。
 *
 * @module handlers/saveHandlers
 */

/* global chrome, Logger */

import { normalizeUrl } from '../../utils/urlUtils.js';
import { validateInternalRequest, isValidNotionUrl } from '../../utils/securityUtils.js';
import { buildHighlightBlocks } from '../utils/BlockBuilder.js';
import { HANDLER_CONSTANTS } from '../../config/constants.js';

// ============================================================================
// 內部輔助函數 (Local Helpers)
// ============================================================================

/**
 * 獲取活動標籤頁
 * @returns {Promise<chrome.tabs.Tab>}
 * @throws {Error} 如果無法獲取標籤頁
 */
async function getActiveTab() {
  const tabs = await new Promise(resolve =>
    chrome.tabs.query({ active: true, currentWindow: true }, resolve)
  );
  const activeTab = tabs[0];
  if (!activeTab || !activeTab.id) {
    throw new Error('Could not get active tab.');
  }
  return activeTab;
}

/**
 * 獲取並設置 Notion API Key
 * @param {StorageService} storageService
 * @param {NotionService} notionService
 * @returns {Promise<string>} API Key
 * @throws {Error} 如果 API Key 未設置
 */
async function ensureNotionApiKey(storageService, notionService) {
  const config = await storageService.getConfig(['notionApiKey']);
  if (!config.notionApiKey) {
    throw new Error('Notion API Key 未設置');
  }
  notionService.setApiKey(config.notionApiKey);
  return config.notionApiKey;
}
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
    const buildBlocks = buildHighlightBlocks || (() => []);
    const highlightBlocks = buildBlocks(highlights);
    blocks.push(...highlightBlocks);
  }

  return { title, blocks, siteIcon };
}

// ============================================================================
// 工廠函數
// ============================================================================

/**
 * 創建 Save Handlers
 * @param {Object} services - 服務實例集合
 * @returns {Object} 處理函數映射
 */
export function createSaveHandlers(services) {
  const { notionService, storageService, injectionService, pageContentService } = services;

  /**
   * 清理頁面標記的輔助函數 (跨模組調用時可能需要，暫時保留在此，若 highlightHandlers 也需要則各自實現)
   * 注意：savePage 中會調用 clearPageHighlights
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
      Logger.warn('Failed to clear page highlights:', error);
    }
  }

  /**
   * 執行頁面創建（包含圖片錯誤重試邏輯）
   */
  async function performCreatePage(params) {
    const { normUrl, dataSourceId, dataSourceType, contentResult } = params;

    // 第一次嘗試
    const buildOptions = {
      title: contentResult.title,
      pageUrl: normUrl,
      dataSourceId,
      dataSourceType,
      blocks: contentResult.blocks,
      siteIcon: contentResult.siteIcon,
    };

    const { pageData, validBlocks } = notionService.buildPageData(buildOptions);

    let result = await notionService.createPage(pageData, {
      autoBatch: true,
      allBlocks: validBlocks,
    });

    // 失敗重試邏輯：如果是圖片驗證錯誤
    if (!result.success && result.error && /image|media|validation/i.test(result.error)) {
      Logger.warn(
        `收到 Notion 圖片驗證錯誤，${HANDLER_CONSTANTS.IMAGE_RETRY_DELAY}ms 後嘗試排除圖片並重試...`
      );

      await new Promise(resolve => setTimeout(resolve, HANDLER_CONSTANTS.IMAGE_RETRY_DELAY));

      // 重建數據，排除圖片
      buildOptions.excludeImages = true;
      const rebuild = notionService.buildPageData(buildOptions);

      result = await notionService.createPage(rebuild.pageData, {
        autoBatch: true,
        allBlocks: rebuild.validBlocks,
      });
    }

    if (result.success) {
      // 保存狀態
      await storageService.setSavedPageData(normUrl, {
        notionPageId: result.pageId,
        notionUrl: result.url,
        title: contentResult.title,
        savedAt: Date.now(),
      });

      // 補充統計數據
      result.imageCount = contentResult.blocks.filter(block => block.type === 'image').length;
      result.blockCount = contentResult.blocks.length;
      result.created = true;
    }

    return result;
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
          // Build highlight blocks (safely)
          const buildBlocks = buildHighlightBlocks || (() => []);
          const highlightBlocks = buildBlocks(highlights);
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

        // 使用 performCreatePage 統一處理創建與重試
        const result = await performCreatePage({
          normUrl,
          dataSourceId,
          dataSourceType,
          contentResult,
        });

        if (result.success) {
          result.recreated = true;
        }
        sendResponse(result);
      }
    } else {
      // 首次保存
      const result = await performCreatePage({
        normUrl,
        dataSourceId,
        dataSourceType,
        contentResult,
      });
      sendResponse(result);
    }
  }

  return {
    /**
     * 保存頁面
     */
    savePage: async (request, sender, sendResponse) => {
      try {
        // 安全性驗證：檢查請求來源
        // savePage 會執行腳本注入和內容提取，必須確保僅限內部調用
        const validationError = validateInternalRequest(sender);
        if (validationError) {
          Logger.warn('⚠️ [savePage] 安全性阻擋:', validationError.error, { sender });
          sendResponse(validationError);
          return;
        }

        const activeTab = await getActiveTab();

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

        const normalize = normalizeUrl || (url => url);
        const normUrl = normalize(activeTab.url || '');
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
          Logger.error('❌ Content extraction result validation failed:', {
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
        Logger.error('Error in handleSavePage:', error);
        sendResponse({ success: false, error: error.message });
      }
    },

    /**
     * 打開 Notion 頁面
     */
    openNotionPage: async (request, sender, sendResponse) => {
      try {
        // 安全性驗證：檢查請求來源
        const validationError = validateInternalRequest(sender);
        if (validationError) {
          Logger.warn('⚠️ [openNotionPage] 安全性阻擋:', validationError.error, { sender });
          sendResponse(validationError);
          return;
        }

        const pageUrl = request.url;
        if (!pageUrl) {
          sendResponse({ success: false, error: 'No URL provided' });
          return;
        }

        const normalize = normalizeUrl || (url => url);
        const normUrl = normalize(pageUrl);
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

        // 安全性驗證：確保 URL 是有效的 Notion URL
        if (!isValidNotionUrl(notionUrl)) {
          Logger.error('❌ [openNotionPage] 非法 Notion URL 被阻擋:', notionUrl);
          sendResponse({
            success: false,
            error: '安全性錯誤：僅允許打開 Notion 官方網域的頁面',
          });
          return;
        }

        chrome.tabs.create({ url: notionUrl }, tab => {
          if (chrome.runtime.lastError) {
            Logger.error('Failed to open Notion page:', chrome.runtime.lastError);
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
          } else {
            Logger.log('✅ Opened Notion page in new tab:', notionUrl);
            sendResponse({ success: true, tabId: tab.id, notionUrl });
          }
        });
      } catch (error) {
        Logger.error('❌ handleOpenNotionPage 錯誤:', error);
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

        await ensureNotionApiKey(storageService, notionService);

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
        const activeTab = await getActiveTab();

        const normalize = normalizeUrl || (url => url);
        const normUrl = normalize(activeTab.url || '');
        const savedData = await storageService.getSavedPageData(normUrl);

        if (savedData?.notionPageId) {
          // 緩存驗證機制
          const TTL = HANDLER_CONSTANTS.PAGE_STATUS_CACHE_TTL;
          const lastVerified = savedData.lastVerifiedAt || 0;
          const now = Date.now();
          // forceRefresh 會繞過緩存，強制重新驗證
          const isFresh = !request.forceRefresh && now - lastVerified < TTL;

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
              // setSavedPageData 會自動更新 lastUpdated，但這裡是更新 metadata，可以接受
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
        Logger.error('Error in checkPageStatus:', error);
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
          Logger.warn(`${prefix} ${message}`, ...args);
        } else if (level === 'error') {
          Logger.error(`${prefix} ${message}`, ...args);
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
