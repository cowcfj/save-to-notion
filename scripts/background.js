// Notion Smart Clipper - Background Script
// Refactored for better organization

/* global chrome, Logger */

// ==========================================
// DEVELOPMENT MODE CONTROL
// ==========================================

// Import unified Logger (ES Module)
import './utils/Logger.js';

// Import modular services (Phase 4 integration)
import { StorageService, URL_TRACKING_PARAMS } from './background/services/StorageService.js';
import { NotionService, fetchWithRetry } from './background/services/NotionService.js';
import {
  InjectionService,
  isRestrictedInjectionUrl,
  isRecoverableInjectionError,
} from './background/services/InjectionService.js';
import { PageContentService } from './background/services/PageContentService.js';

const injectionService = new InjectionService({ logger: Logger });
const pageContentService = new PageContentService({
  injectionService,
  logger: Logger,
});

import { MessageHandler } from './background/handlers/MessageHandler.js';
import { TabService } from './background/services/TabService.js';

// ==========================================
// DEVELOPMENT MODE CONTROL
// ==========================================

// DEBUG_MODE and Logger are now provided by utils/Logger.js

// ==========================================
// IMAGE UTILITIES (provided by imageUtils.js)
// ==========================================
// cleanImageUrl, isValidImageUrl 等函數由 scripts/utils/imageUtils.js 提供
// 在瀏覽器環境中透過 ImageUtils 全局對象訪問

// Initialize Services
const storageService = new StorageService({ logger: Logger });
const notionService = new NotionService({ logger: Logger });

// ==========================================
// TEXT UTILITIES
// ==========================================

/**
 * 將長文本分割成符合 Notion 限制的片段
 * Notion API 限制每個 rich_text 區塊最多 2000 字符
 */
function splitTextForHighlight(text, maxLength = 2000) {
  if (!text || text.length <= maxLength) {
    return [text];
  }

  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // 嘗試在句號、問號、驚嘆號、換行符處分割
    let splitIndex = -1;
    const punctuation = ['\n\n', '\n', '。', '.', '？', '?', '！', '!'];

    for (const punct of punctuation) {
      const lastIndex = remaining.lastIndexOf(punct, maxLength);
      if (lastIndex > maxLength * 0.5) {
        // 至少分割到一半以上，避免片段太短
        splitIndex = lastIndex + punct.length;
        break;
      }
    }

    // 如果找不到合適的標點，嘗試在空格處分割
    if (splitIndex === -1) {
      splitIndex = remaining.lastIndexOf(' ', maxLength);
      if (splitIndex === -1 || splitIndex < maxLength * 0.5) {
        // 實在找不到，強制在 maxLength 處分割
        splitIndex = maxLength;
      }
    }

    chunks.push(remaining.substring(0, splitIndex).trim());
    remaining = remaining.substring(splitIndex).trim();
  }

  return chunks.filter(chunk => chunk.length > 0); // 過濾空字符串
}

// ==========================================
// SCRIPT INJECTION HELPERS
// ==========================================

// 判斷指定網址是否為禁止注入腳本的受限網域
// SCRIPT INJECTION MANAGER provided by InjectionService

// ==========================================
// NOTION API UTILITIES
// ==========================================

/**
 * 分批將區塊添加到 Notion 頁面
 * Notion API 限制每次最多 100 個區塊
 *
 * @param {string} pageId - Notion 頁面 ID
 * @param {Array} blocks - 要添加的區塊數組
 * @param {string} apiKey - Notion API Key
 * @param {number} startIndex - 開始索引（默認 0）
 * @returns {Promise<{success: boolean, addedCount: number, totalCount: number}>}
 */
async function appendBlocksInBatches(pageId, blocks, apiKey, startIndex = 0) {
  const BLOCKS_PER_BATCH = 100;
  const DELAY_BETWEEN_BATCHES = 350; // ms，遵守 Notion API 速率限制（3 req/s）

  let addedCount = 0;
  const totalBlocks = blocks.length - startIndex;

  if (totalBlocks <= 0) {
    return { success: true, addedCount: 0, totalCount: 0 };
  }

  Logger.log(`📦 準備分批添加區塊: 總共 ${totalBlocks} 個，從索引 ${startIndex} 開始`);

  try {
    // 分批處理剩餘區塊
    for (let i = startIndex; i < blocks.length; i += BLOCKS_PER_BATCH) {
      const batch = blocks.slice(i, i + BLOCKS_PER_BATCH);
      const batchNumber = Math.floor((i - startIndex) / BLOCKS_PER_BATCH) + 1;
      const totalBatches = Math.ceil(totalBlocks / BLOCKS_PER_BATCH);

      Logger.log(`📤 發送批次 ${batchNumber}/${totalBatches}: ${batch.length} 個區塊`);

      // 使用重試機制發送批次（處理 5xx/429/409/DatastoreInfraError）
      const response = await fetchNotionWithRetry(
        `https://api.notion.com/v1/blocks/${pageId}/children`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Notion-Version': '2025-09-03',
          },
          body: JSON.stringify({
            children: batch,
          }),
        },
        { maxRetries: 3, baseDelay: 800 }
      );

      // 如果沒有重試機制，記錄批次失敗
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ 批次 ${batchNumber} 失敗:`, errorText);
        throw new Error(`批次添加失敗: ${response.status} - ${errorText}`);
      }

      addedCount += batch.length;
      Logger.log(`✅ 批次 ${batchNumber} 成功: 已添加 ${addedCount}/${totalBlocks} 個區塊`);

      // 如果還有更多批次，添加延遲以遵守速率限制
      if (i + BLOCKS_PER_BATCH < blocks.length) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
      }
    }

    Logger.log(`🎉 所有區塊添加完成: ${addedCount}/${totalBlocks}`);
    return { success: true, addedCount, totalCount: totalBlocks };
  } catch (error) {
    console.error('❌ 分批添加區塊失敗:', error);
    return { success: false, addedCount, totalCount: totalBlocks, error: error.message };
  }
}

// ==========================================
// URL UTILITIES MODULE
// ==========================================

/**
 * 標準化 URL，用於生成一致的存儲鍵和去重
 *
 * ⚠️ 瀏覽器環境使用 StorageService.normalizeUrl
 * 測試環境使用本地實現（避免依賴 window）
 *
 * @param {string} rawUrl - 完整的絕對 URL
 * @returns {string} 標準化後的 URL
 */
const normalizeUrl =
  typeof window !== 'undefined' && window.normalizeUrl
    ? window.normalizeUrl
    : function (rawUrl) {
        if (!rawUrl || typeof rawUrl !== 'string') {
          return rawUrl || '';
        }
        if (!rawUrl.includes('://')) {
          return rawUrl;
        }
        try {
          const urlObj = new URL(rawUrl);
          urlObj.hash = '';
          // 使用共享的追蹤參數列表
          URL_TRACKING_PARAMS.forEach(param => urlObj.searchParams.delete(param));
          if (urlObj.pathname !== '/' && urlObj.pathname.endsWith('/')) {
            urlObj.pathname = urlObj.pathname.replace(/\/+$/, '');
          }
          return urlObj.toString();
        } catch {
          return rawUrl;
        }
      };

// ==========================================
// STORAGE MANAGER MODULE
// ==========================================

/**
 * Clears the local state for a specific page
 * @returns {Promise<void>}
 */
function clearPageState(pageUrl) {
  return storageService.clearPageState(pageUrl);
}

/**
 * Gets the saved page data from local storage
 * @returns {Promise<Object|null>}
 */
function getSavedPageData(pageUrl) {
  return storageService.getSavedPageData(pageUrl);
}

/**
 * Sets the saved page data in local storage
 * @returns {Promise<void>}
 */
function setSavedPageData(pageUrl, data) {
  return storageService.setSavedPageData(pageUrl, data);
}

/**
 * Gets configuration from sync storage
 * @returns {Promise<Object>}
 */
function getConfig(keys) {
  return storageService.getConfig(keys);
}

/**
 * 帶重試的 Notion API 請求
 * @returns {Promise<Response>}
 */
function fetchNotionWithRetry(url, options, retryOptions = {}) {
  // 委派給 NotionService 模組提供的 fetchWithRetry
  return fetchWithRetry(url, options, retryOptions);
}

// ==========================================
// NOTION API MODULE
// ==========================================

/**
 * Checks if a Notion page exists
 */
// 返回值：
//   true  => 確認存在
//   false => 確認不存在（404）
//   null  => 不確定（網路/服務端暫時性錯誤）
function checkNotionPageExists(pageId, apiKey) {
  // 使用全局 notionService 實例，設置 apiKey 後調用
  notionService.setApiKey(apiKey);
  return notionService.checkPageExists(pageId);
}

/**
 * v2.7.1: 處理檢查 Notion 頁面是否存在的消息請求（用於數據清理）
 */
async function handleCheckNotionPageExistsMessage(request, sendResponse) {
  try {
    const { pageId } = request;

    if (!pageId) {
      sendResponse({ success: false, error: 'Page ID is required' });
      return;
    }

    const config = await getConfig(['notionApiKey']);

    if (!config.notionApiKey) {
      sendResponse({ success: false, error: 'Notion API Key not configured' });
      return;
    }

    const exists = await checkNotionPageExists(pageId, config.notionApiKey);
    sendResponse({ success: true, exists });
  } catch (error) {
    console.error('handleCheckNotionPageExistsMessage error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Saves new content to Notion as a new page
 * @param {boolean} excludeImages - 是否排除所有圖片（用於重試）
 * @param {string} dataSourceType - 保存目標類型 ('page' 或 'data_source')
 */
async function saveToNotion(
  title,
  blocks,
  pageUrl,
  apiKey,
  dataSourceId,
  sendResponse,
  siteIcon = null,
  excludeImages = false,
  dataSourceType = 'data_source'
) {
  // 開始性能監控 (service worker 環境，使用原生 Performance API)
  const startTime = performance.now();
  Logger.log('⏱️ 開始保存到 Notion...');

  const notionApiUrl = 'https://api.notion.com/v1/pages';

  // 使用 NotionService 的圖片過濾方法
  const { validBlocks, skippedCount } = notionService.filterValidImageBlocks(blocks, excludeImages);

  Logger.log(
    `📊 Total blocks to save: ${validBlocks.length}, Image blocks: ${validBlocks.filter(block => block.type === 'image').length}`
  );

  // 根據類型設置 parent（支援 page 和 data_source）
  const parentConfig =
    dataSourceType === 'page'
      ? { type: 'page_id', page_id: dataSourceId }
      : { type: 'data_source_id', data_source_id: dataSourceId };

  Logger.log(
    dataSourceType === 'page'
      ? `📄 保存為頁面的子頁面: ${dataSourceId}`
      : `📊 保存為數據庫條目: ${dataSourceId}`
  );

  const pageData = {
    parent: parentConfig,
    properties: {
      Title: {
        title: [{ text: { content: title } }],
      },
      URL: {
        url: pageUrl,
      },
    },
    children: validBlocks.slice(0, 100),
  };

  // v2.6.0: 添加網站 Icon（如果有）
  if (siteIcon) {
    pageData.icon = {
      type: 'external',
      external: {
        url: siteIcon,
      },
    };
    Logger.log('✓ Setting page icon:', siteIcon);
  }

  try {
    Logger.log(`🚀 Sending ${validBlocks.slice(0, 100).length} blocks to Notion API...`);

    // 記錄所有圖片區塊的 URL（用於調試）
    const imageBlocksInPayload = validBlocks.slice(0, 100).filter(block => block.type === 'image');
    if (imageBlocksInPayload.length > 0) {
      Logger.log(`📸 Image blocks in payload: ${imageBlocksInPayload.length}`);
      imageBlocksInPayload.forEach((img, idx) => {
        const url = img.image?.external?.url;
        Logger.log(`  ${idx + 1}. ${url?.substring(0, 100)}... (length: ${url?.length})`);
      });
    }

    const response = await fetchNotionWithRetry(
      notionApiUrl,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2025-09-03',
        },
        body: JSON.stringify(pageData),
      },
      { maxRetries: 2, baseDelay: 600 }
    );

    if (response.ok) {
      const responseData = await response.json();
      Logger.log('📄 Notion API 創建頁面響應:', responseData);
      Logger.log('🔗 響應中的 URL:', responseData.url);
      const notionPageId = responseData.id;

      // 如果區塊數量超過 100，分批添加剩餘區塊
      if (validBlocks.length > 100) {
        Logger.log(`📚 檢測到超長文章: ${validBlocks.length} 個區塊，需要分批添加`);
        const appendResult = await appendBlocksInBatches(notionPageId, validBlocks, apiKey, 100);

        if (!appendResult.success) {
          console.warn(
            `⚠️ 部分區塊添加失敗: ${appendResult.addedCount}/${appendResult.totalCount}`,
            appendResult.error
          );
          // 即使部分失敗，頁面已創建，仍然保存記錄
        }
      }

      // 構建 Notion 頁面 URL（如果 API 響應中沒有提供）
      let notionUrl = responseData.url;
      if (!notionUrl && notionPageId) {
        // 手動構建 Notion URL
        notionUrl = `https://www.notion.so/${notionPageId.replace(/-/g, '')}`;
        Logger.log('🔗 手動構建 Notion URL:', notionUrl);
      }

      setSavedPageData(pageUrl, {
        title,
        savedAt: Date.now(),
        notionPageId,
        notionUrl,
      })
        .then(() => {
          // 結束性能監控 (service worker 環境)
          const duration = performance.now() - startTime;
          Logger.log(`⏱️ 保存到 Notion 完成: ${duration.toFixed(2)}ms`);

          // 如果有過濾掉的圖片，在成功訊息中提醒用戶
          if (skippedCount > 0 || excludeImages) {
            const totalSkipped = excludeImages ? 'All images' : `${skippedCount} image(s)`;
            sendResponse({
              success: true,
              notionPageId,
              warning: `${totalSkipped} were skipped due to compatibility issues`,
            });
          } else {
            sendResponse({ success: true, notionPageId });
          }
        })
        .catch(err => {
          console.error('Failed to save page data:', err);
          // 即使保存本地狀態失敗，Notion 頁面已創建，視為成功但帶有警告
          sendResponse({
            success: true,
            notionPageId,
            warning: `Page saved to Notion, but local state update failed: ${err.message}`,
          });
        });
    } else {
      const errorData = await response.json();
      console.error('Notion API Error:', errorData);
      console.error('Complete error details:', JSON.stringify(errorData, null, 2));

      // 記錄發送到 Notion 的資料，以便調試
      console.error(
        'Blocks sent to Notion (first 5):',
        validBlocks.slice(0, 5).map(block => {
          if (block.type === 'image') {
            return {
              type: block.type,
              imageUrl: block.image?.external?.url,
              urlLength: block.image?.external?.url?.length,
            };
          }
          return { type: block.type };
        })
      );

      // 檢查是否仍有圖片驗證錯誤
      if (
        errorData.code === 'validation_error' &&
        errorData.message &&
        errorData.message.includes('image')
      ) {
        // 嘗試找出哪個圖片導致問題
        const imageBlocks = validBlocks.filter(block => block.type === 'image');
        console.error(
          `❌ Still have image validation errors. Total image blocks: ${imageBlocks.length}`
        );
        console.error(
          'All image URLs:',
          imageBlocks.map(block => block.image?.external?.url)
        );

        // 自動重試：排除所有圖片
        Logger.log('🔄 Auto-retry: Saving without ANY images...');

        // 使用 setTimeout 避免立即重試
        setTimeout(() => {
          saveToNotion(
            title,
            blocks,
            pageUrl,
            apiKey,
            dataSourceId,
            sendResponse,
            siteIcon,
            true,
            dataSourceType
          );
        }, 500);
        return;
      }

      // 提供更友好的錯誤信息
      const errorMessage = errorData.message || 'Failed to save to Notion.';
      sendResponse({ success: false, error: errorMessage });
    }
  } catch (error) {
    console.error('Fetch Error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Updates an entire Notion page with new content
 */
async function updateNotionPage(pageId, title, blocks, pageUrl, apiKey, sendResponse) {
  try {
    // 使用 NotionService 的圖片過濾方法
    const { validBlocks, skippedCount } = notionService.filterValidImageBlocks(blocks);

    const getResponse = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Notion-Version': '2025-09-03',
      },
    });

    if (getResponse.ok) {
      const existingContent = await getResponse.json();
      for (const block of existingContent.results) {
        await fetch(`https://api.notion.com/v1/blocks/${block.id}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Notion-Version': '2025-09-03',
          },
        });
      }
    }

    const updateResponse = await fetchNotionWithRetry(
      `https://api.notion.com/v1/blocks/${pageId}/children`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2025-09-03',
        },
        body: JSON.stringify({
          children: validBlocks.slice(0, 100),
        }),
      },
      { maxRetries: 0, baseDelay: 0 }
    );

    if (updateResponse.ok) {
      // 如果區塊數量超過 100，分批添加剩餘區塊
      if (validBlocks.length > 100) {
        Logger.log(`📚 檢測到超長文章: ${validBlocks.length} 個區塊，需要分批添加`);
        const appendResult = await appendBlocksInBatches(pageId, validBlocks, apiKey, 100);

        if (!appendResult.success) {
          console.warn(
            `⚠️ 部分區塊添加失敗: ${appendResult.addedCount}/${appendResult.totalCount}`,
            appendResult.error
          );
          // 即使部分失敗，頁面已更新，仍然繼續
        }
      }

      const titleUpdatePromise = fetchNotionWithRetry(
        `https://api.notion.com/v1/pages/${pageId}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Notion-Version': '2025-09-03',
          },
          body: JSON.stringify({
            properties: {
              Title: {
                title: [{ text: { content: title } }],
              },
            },
          }),
        },
        { maxRetries: 2, baseDelay: 600 }
      );

      const storageUpdatePromise = setSavedPageData(pageUrl, {
        title,
        savedAt: Date.now(),
        notionPageId: pageId,
        lastUpdated: Date.now(),
      });

      await Promise.all([titleUpdatePromise, storageUpdatePromise]);

      // 如果有過濾掉的圖片，在回應中提醒用戶
      if (skippedCount > 0) {
        sendResponse({
          success: true,
          warning: `${skippedCount} image(s) were skipped due to compatibility issues`,
        });
      } else {
        sendResponse({ success: true });
      }
    } else {
      const errorData = await updateResponse.json();
      console.error('Notion Update Error:', errorData);

      // 提供更友好的錯誤信息
      let errorMessage = errorData.message || 'Failed to update Notion page.';
      if (errorData.code === 'validation_error' && errorMessage.includes('image')) {
        errorMessage =
          'Update Failed. Some images may have invalid URLs. Try updating again - problematic images will be filtered out.';
      }

      sendResponse({ success: false, error: errorMessage });
    }
  } catch (error) {
    console.error('Update Error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Updates only highlights on an existing page
 */
async function updateHighlightsOnly(pageId, highlights, pageUrl, apiKey, sendResponse) {
  try {
    Logger.log('🔄 開始更新標記 - 頁面ID:', pageId, '標記數量:', highlights.length);

    const getResponse = await fetch(
      `https://api.notion.com/v1/blocks/${pageId}/children?page_size=100`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Notion-Version': '2025-09-03',
        },
      }
    );

    if (!getResponse.ok) {
      const errorData = await getResponse.json();
      console.error('❌ 獲取頁面內容失敗:', errorData);
      throw new Error(
        `Failed to get existing page content: ${errorData.message || getResponse.statusText}`
      );
    }

    const existingContent = await getResponse.json();
    const existingBlocks = existingContent.results;
    Logger.log('📋 現有區塊數量:', existingBlocks.length);

    const blocksToDelete = [];
    let foundHighlightSection = false;

    for (let i = 0; i < existingBlocks.length; i++) {
      const block = existingBlocks[i];

      if (
        block.type === 'heading_3' &&
        block.heading_3?.rich_text?.[0]?.text?.content === '📝 頁面標記'
      ) {
        foundHighlightSection = true;
        blocksToDelete.push(block.id);
        Logger.log(`🎯 找到標記區域標題 (索引 ${i}):`, block.id);
      } else if (foundHighlightSection) {
        if (block.type.startsWith('heading_')) {
          Logger.log(`🛑 遇到下一個標題，停止收集標記區塊 (索引 ${i})`);
          break;
        }
        if (block.type === 'paragraph') {
          blocksToDelete.push(block.id);
          Logger.log(`📝 標記為刪除的段落 (索引 ${i}):`, block.id);
        }
      }
    }

    Logger.log('🗑️ 需要刪除的區塊數量:', blocksToDelete.length);

    let deletedCount = 0;
    for (const blockId of blocksToDelete) {
      try {
        Logger.log(`🗑️ 正在刪除區塊: ${blockId}`);
        const deleteResponse = await fetch(`https://api.notion.com/v1/blocks/${blockId}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Notion-Version': '2025-09-03',
          },
        });

        if (deleteResponse.ok) {
          deletedCount++;
          Logger.log(`✅ 成功刪除區塊: ${blockId}`);
        } else {
          const errorData = await deleteResponse.json();
          console.error(`❌ 刪除區塊失敗 ${blockId}:`, errorData);
        }
      } catch (deleteError) {
        console.error(`❌ 刪除區塊異常 ${blockId}:`, deleteError);
      }
    }

    Logger.log(`🗑️ 實際刪除了 ${deletedCount}/${blocksToDelete.length} 個區塊`);

    if (highlights.length > 0) {
      Logger.log('➕ 準備添加新的標記區域...');

      const highlightBlocks = [
        {
          object: 'block',
          type: 'heading_3',
          heading_3: {
            rich_text: [
              {
                type: 'text',
                text: { content: '📝 頁面標記' },
              },
            ],
          },
        },
      ];

      highlights.forEach((highlight, index) => {
        Logger.log(
          `📝 準備添加標記 ${index + 1}: "${highlight.text.substring(0, 30)}..." (顏色: ${highlight.color})`
        );

        // 處理超長標記文本，需要分割成多個段落
        const textChunks = splitTextForHighlight(highlight.text, 2000);

        textChunks.forEach((chunk, chunkIndex) => {
          highlightBlocks.push({
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [
                {
                  type: 'text',
                  text: { content: chunk },
                  annotations: {
                    color: highlight.color,
                  },
                },
              ],
            },
          });

          // 如果是分割的標記，在日誌中標註
          if (textChunks.length > 1) {
            Logger.log(
              `   └─ 分割片段 ${chunkIndex + 1}/${textChunks.length}: ${chunk.length} 字符`
            );
          }
        });
      });

      Logger.log('➕ 準備添加的區塊數量:', highlightBlocks.length);

      const addResponse = await fetchNotionWithRetry(
        `https://api.notion.com/v1/blocks/${pageId}/children`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Notion-Version': '2025-09-03',
          },
          body: JSON.stringify({
            children: highlightBlocks,
          }),
        },
        { maxRetries: 2, baseDelay: 600 }
      );

      Logger.log('📡 API 響應狀態:', addResponse.status, addResponse.statusText);

      if (!addResponse.ok) {
        const errorData = await addResponse.json();
        console.error('❌ 添加標記失敗 - 錯誤詳情:', errorData);
        throw new Error(`Failed to add new highlights: ${errorData.message || 'Unknown error'}`);
      }

      const addResult = await addResponse.json();
      Logger.log('✅ 成功添加新標記 - 響應:', addResult);
      Logger.log('✅ 添加的區塊數量:', addResult.results?.length || 0);
    } else {
      Logger.log('ℹ️ 沒有新標記需要添加');
    }

    Logger.log('💾 更新本地保存記錄...');
    setSavedPageData(pageUrl, {
      savedAt: Date.now(),
      notionPageId: pageId,
      lastUpdated: Date.now(),
    })
      .then(() => {
        Logger.log('🎉 標記更新完成！');
        sendResponse({ success: true });
      })
      .catch(err => {
        console.error('Failed to update local state:', err);
        // 標記已添加到 Notion，視為成功
        sendResponse({
          success: true,
          warning: `Highlights added, but local sync failed: ${err.message}`,
        });
      });
  } catch (error) {
    console.error('💥 標記更新錯誤:', error);
    console.error('💥 錯誤堆棧:', error.stack);
    sendResponse({ success: false, error: error.message });
  }
}

// ==========================================
// TAB MANAGER MODULE
// ==========================================

/**
 * Sets up tab event listeners for dynamic injection
 */
// Tab management logic is now in TabService.js

// ==========================================
// MESSAGE HANDLERS MODULE
// ==========================================

/**
 * Sets up the message listener for runtime messages
 */
/**
 * 設置消息處理器
 * 使用 MessageHandler 統一管理所有消息路由
 */
function setupMessageHandlers() {
  const messageHandler = new MessageHandler({ logger: Logger });

  // 註冊所有消息處理函數
  messageHandler.registerAll({
    devLogSink: (request, sender, sendResponse) => {
      try {
        const level = request.level || 'log';
        const message = request.message || '';
        const args = Array.isArray(request.args) ? request.args : [];
        const prefix = '[ClientLog]';
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
        sendResponse({ success: false, error: error.message });
      }
    },
    checkPageStatus: (request, sender, sendResponse) => {
      handleCheckPageStatus(sendResponse);
    },
    checkNotionPageExists: (request, sender, sendResponse) => {
      handleCheckNotionPageExistsMessage(request, sendResponse);
    },
    startHighlight: (request, sender, sendResponse) => {
      handleStartHighlight(sendResponse);
    },
    updateHighlights: (request, sender, sendResponse) => {
      handleUpdateHighlights(sendResponse);
    },
    syncHighlights: (request, sender, sendResponse) => {
      handleSyncHighlights(request, sendResponse);
    },
    savePage: (request, sender, sendResponse) => {
      Promise.resolve(handleSavePage(sendResponse)).catch(err => {
        try {
          sendResponse({ success: false, error: err?.message || 'Save failed' });
        } catch {
          /* 忽略 sendResponse 錯誤 */
        }
      });
    },
    openNotionPage: (request, sender, sendResponse) => {
      handleOpenNotionPage(request, sendResponse);
    },
  });

  messageHandler.setupListener();
  Logger.log('✅ MessageHandler 設置完成');
}

/**


/**
 * Handles checkPageStatus action
 */
/**
 * 處理檢查頁面狀態的請求
 */
async function handleCheckPageStatus(sendResponse) {
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
    const savedData = await getSavedPageData(normUrl);

    if (savedData?.notionPageId) {
      const config = await getConfig(['notionApiKey']);

      if (config.notionApiKey) {
        try {
          const existence = await checkNotionPageExists(
            savedData.notionPageId,
            config.notionApiKey
          );

          if (existence === false) {
            Logger.log('Notion page was deleted, clearing local state');
            clearPageState(normUrl);

            await injectionService.injectHighlighter(activeTab.id);
            await injectionService.inject(activeTab.id, () => {
              if (window.clearPageHighlights) {
                window.clearPageHighlights();
              }
            });

            // 清除徽章
            chrome.action.setBadgeText({ text: '', tabId: activeTab.id });

            sendResponse({
              success: true,
              isSaved: false,
              url: normUrl,
              title: activeTab.title,
              wasDeleted: true,
            });
          } else {
            // existence 為 true 或 null（不確定）均視為已保存，不清除狀態
            if (existence === null) {
              console.warn(
                '⚠️ Notion page existence uncertain due to transient error; preserving local saved state'
              );
            }
            // 設置綠色徽章表示已保存
            chrome.action.setBadgeText({ text: '✓', tabId: activeTab.id });
            chrome.action.setBadgeBackgroundColor({ color: '#48bb78', tabId: activeTab.id });

            // 為舊版本數據生成 notionUrl（如果沒有的話）
            let notionUrl = savedData.notionUrl;
            if (!notionUrl && savedData.notionPageId) {
              notionUrl = `https://www.notion.so/${savedData.notionPageId.replace(/-/g, '')}`;
              Logger.log('🔗 為舊版本數據生成 Notion URL:', notionUrl);
            }

            sendResponse({
              success: true,
              isSaved: true,
              url: normUrl,
              title: activeTab.title,
              notionUrl: notionUrl || null,
            });
          }
        } catch (error) {
          console.error('Error checking page status:', error);
          // 即使檢查出錯，仍然返回 notionUrl
          chrome.action.setBadgeText({ text: '✓', tabId: activeTab.id });
          chrome.action.setBadgeBackgroundColor({ color: '#48bb78', tabId: activeTab.id });

          // 為舊版本數據生成 notionUrl（如果沒有的話）
          let notionUrl = savedData.notionUrl;
          if (!notionUrl && savedData.notionPageId) {
            notionUrl = `https://www.notion.so/${savedData.notionPageId.replace(/-/g, '')}`;
            Logger.log('🔗 為舊版本數據生成 Notion URL (錯誤處理):', notionUrl);
          }

          sendResponse({
            success: true,
            isSaved: true,
            url: normUrl,
            title: activeTab.title,
            notionUrl: notionUrl || null,
          });
        }
      } else {
        // 設置徽章
        if (savedData) {
          chrome.action.setBadgeText({ text: '✓', tabId: activeTab.id });
          chrome.action.setBadgeBackgroundColor({ color: '#48bb78', tabId: activeTab.id });
        } else {
          chrome.action.setBadgeText({ text: '', tabId: activeTab.id });
        }

        // 為舊版本數據生成 notionUrl（如果沒有的話）
        let notionUrl = savedData?.notionUrl;
        if (!notionUrl && savedData?.notionPageId) {
          notionUrl = `https://www.notion.so/${savedData.notionPageId.replace(/-/g, '')}`;
          Logger.log('🔗 為舊版本數據生成 Notion URL (無 API Key):', notionUrl);
        }

        sendResponse({
          success: true,
          isSaved: Boolean(savedData),
          url: normUrl,
          title: activeTab.title,
          notionUrl: notionUrl || null,
        });
      }
    } else {
      // 清除徽章
      chrome.action.setBadgeText({ text: '', tabId: activeTab.id });

      sendResponse({
        success: true,
        isSaved: false,
        url: normUrl,
        title: activeTab.title,
      });
    }
  } catch (error) {
    console.error('Error in handleCheckPageStatus:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handles startHighlight action
 */
async function handleStartHighlight(sendResponse) {
  try {
    const tabs = await new Promise(resolve =>
      chrome.tabs.query({ active: true, currentWindow: true }, resolve)
    );
    const activeTab = tabs[0];

    if (!activeTab || !activeTab.id) {
      sendResponse({ success: false, error: 'Could not get active tab.' });
      return;
    }

    // 嘗試先發送消息切換（如果腳本已加載）
    try {
      const response = await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(activeTab.id, { action: 'toggleHighlighter' }, messageResponse => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(messageResponse);
          }
        });
      });

      if (response?.success) {
        sendResponse({ success: true });
        return;
      }
    } catch (error) {
      // 消息發送失敗，說明腳本可能未加載，繼續執行注入
      Logger.log('發送 toggleHighlighter 失敗，嘗試注入腳本:', error);
    }

    await injectionService.injectHighlighter(activeTab.id);
    sendResponse({ success: true });
  } catch (error) {
    console.error('Error in handleStartHighlight:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handles updateHighlights action
 */
async function handleUpdateHighlights(sendResponse) {
  try {
    const tabs = await new Promise(resolve =>
      chrome.tabs.query({ active: true, currentWindow: true }, resolve)
    );
    const activeTab = tabs[0];

    if (!activeTab || !activeTab.id) {
      sendResponse({ success: false, error: 'Could not get active tab.' });
      return;
    }

    const config = await getConfig(['notionApiKey']);
    if (!config.notionApiKey) {
      sendResponse({ success: false, error: 'API Key is not set.' });
      return;
    }

    const normUrl = normalizeUrl(activeTab.url || '');
    const savedData = await getSavedPageData(normUrl);

    if (!savedData || !savedData.notionPageId) {
      sendResponse({ success: false, error: 'Page not saved yet. Please save the page first.' });
      return;
    }

    const highlights = await injectionService.collectHighlights(activeTab.id);

    updateHighlightsOnly(
      savedData.notionPageId,
      highlights,
      normUrl,
      config.notionApiKey,
      response => {
        if (response.success) {
          response.highlightsUpdated = true;
          response.highlightCount = highlights.length;
        }
        sendResponse(response);
      }
    );
  } catch (error) {
    console.error('Error in handleUpdateHighlights:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * 處理從工具欄同步標註到 Notion 的請求
 */
async function handleSyncHighlights(request, sendResponse) {
  try {
    Logger.log('🔄 處理同步標註請求');

    const tabs = await new Promise(resolve =>
      chrome.tabs.query({ active: true, currentWindow: true }, resolve)
    );

    const activeTab = tabs[0];
    if (!activeTab || !activeTab.id) {
      sendResponse({ success: false, error: '無法獲取當前標籤頁' });
      return;
    }

    const config = await getConfig(['notionApiKey']);

    if (!config.notionApiKey) {
      sendResponse({ success: false, error: 'API Key 未設置' });
      return;
    }

    const normUrl = normalizeUrl(activeTab.url || '');
    const savedData = await getSavedPageData(normUrl);

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

    // 使用 updateHighlightsOnly 函數同步標註
    updateHighlightsOnly(
      savedData.notionPageId,
      highlights,
      normUrl,
      config.notionApiKey,
      response => {
        if (response.success) {
          Logger.log(`✅ 成功同步 ${highlights.length} 個標註`);
          response.highlightCount = highlights.length;
          response.message = `成功同步 ${highlights.length} 個標註`;
        } else {
          console.error('❌ 同步標註失敗:', response.error);
        }
        sendResponse(response);
      }
    );
  } catch (error) {
    console.error('❌ handleSyncHighlights 錯誤:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * 將標註數據轉換為 Notion 區塊
 * @param {Array} highlights - 標註數據
 * @returns {Array} Notion 區塊數組
 */
function buildHighlightBlocks(highlights) {
  if (!highlights || highlights.length === 0) {
    return [];
  }

  const blocks = [
    {
      object: 'block',
      type: 'heading_3',
      heading_3: {
        rich_text: [
          {
            type: 'text',
            text: { content: '📝 頁面標記' },
          },
        ],
      },
    },
  ];

  highlights.forEach(highlight => {
    const textChunks = splitTextForHighlight(highlight.text || '');

    textChunks.forEach(chunk => {
      blocks.push({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [
            {
              type: 'text',
              text: { content: chunk },
              annotations: {
                color: highlight.color || 'default',
              },
            },
          ],
        },
      });
    });
  });

  return blocks;
}

/**
 * 處理內容提取結果
 * @param {Object} rawResult - 注入腳本返回的原始結果
 * @param {Array} highlights - 標註數據
 * @returns {Object} 處理後的內容結果 { title, blocks, siteIcon }
 */
function processContentResult(rawResult, highlights) {
  const contentResult = rawResult || {
    title: 'Untitled',
    blocks: [],
    siteIcon: null,
  };

  // 添加標註區塊
  if (highlights && highlights.length > 0) {
    const highlightBlocks = buildHighlightBlocks(highlights);
    contentResult.blocks.push(...highlightBlocks);
  }

  return contentResult;
}

/**
 * 根據頁面狀態決定並執行保存操作
 * @param {Object} params - 參數對象
 * @param {Object} params.savedData - 已保存的頁面數據
 * @param {string} params.normUrl - 標準化後的 URL
 * @param {Object} params.config - 配置對象 (含 notionApiKey)
 * @param {string} params.dataSourceId - 數據源 ID
 * @param {string} params.dataSourceType - 數據源類型
 * @param {Object} params.contentResult - 處理後的內容結果
 * @param {Array} params.highlights - 標註數據
 * @param {number} params.activeTabId - 活動標籤頁 ID
 * @param {Function} params.sendResponse - 響應回調函數
 */
async function determineAndExecuteSaveAction(params) {
  const {
    savedData,
    normUrl,
    config,
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
    const pageExists = await checkNotionPageExists(savedData.notionPageId, config.notionApiKey);

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
        updateHighlightsOnly(
          savedData.notionPageId,
          highlights,
          normUrl,
          config.notionApiKey,
          response => {
            if (response.success) {
              response.highlightCount = highlights.length;
              response.highlightsUpdated = true;
            }
            sendResponse(response);
          }
        );
      } else {
        updateNotionPage(
          savedData.notionPageId,
          contentResult.title,
          contentResult.blocks,
          normUrl,
          config.notionApiKey,
          response => {
            if (response.success) {
              response.imageCount = imageCount;
              response.blockCount = contentResult.blocks.length;
              response.updated = true;
            }
            sendResponse(response);
          }
        );
      }
    } else {
      // 頁面已刪除：清理狀態並創建新頁面
      Logger.log('Notion page was deleted, clearing local state and creating new page');
      clearPageState(normUrl);
      await clearPageHighlights(activeTabId);

      saveToNotion(
        contentResult.title,
        contentResult.blocks,
        normUrl,
        config.notionApiKey,
        dataSourceId,
        response => {
          if (response.success) {
            response.imageCount = imageCount;
            response.blockCount = contentResult.blocks.length;
            response.created = true;
            response.recreated = true;
          }
          sendResponse(response);
        },
        contentResult.siteIcon,
        false,
        dataSourceType
      );
    }
  } else {
    // 首次保存
    saveToNotion(
      contentResult.title,
      contentResult.blocks,
      normUrl,
      config.notionApiKey,
      dataSourceId,
      response => {
        if (response.success) {
          response.imageCount = imageCount;
          response.blockCount = contentResult.blocks.length;
          response.created = true;
        }
        sendResponse(response);
      },
      contentResult.siteIcon,
      false,
      dataSourceType
    );
  }
}

/**
 * 處理保存頁面的請求
 */
async function handleSavePage(sendResponse) {
  try {
    const tabs = await new Promise(resolve =>
      chrome.tabs.query({ active: true, currentWindow: true }, resolve)
    );

    const activeTab = tabs[0];
    if (!activeTab || !activeTab.id) {
      sendResponse({ success: false, error: 'Could not get active tab.' });
      return;
    }

    const config = await getConfig([
      'notionApiKey',
      'notionDataSourceId',
      'notionDatabaseId',
      'notionDataSourceType',
    ]);

    const dataSourceId = config.notionDataSourceId || config.notionDatabaseId;
    const dataSourceType = config.notionDataSourceType || 'data_source'; // 默認為 data_source 以保持向後兼容

    Logger.log(`保存目標: ID=${dataSourceId}, 類型=${dataSourceType}`);

    if (!config.notionApiKey || !dataSourceId) {
      sendResponse({ success: false, error: 'API Key or Data Source ID is not set.' });
      return;
    }

    const normUrl = normalizeUrl(activeTab.url || '');
    const savedData = await getSavedPageData(normUrl);

    // 注入 highlighter 並收集標記
    await injectionService.injectHighlighter(activeTab.id);
    const highlights = await injectionService.collectHighlights(activeTab.id);

    Logger.log('📊 收集到的標註數據:', highlights);
    Logger.log('📊 標註數量:', highlights?.length || 0);

    // 注入並執行內容提取
    // 新邏輯：完全使用 PageContentService
    let result = null;

    try {
      result = await pageContentService.extractContent(activeTab.id);
      Logger.log('✅ [PageContentService] 內容提取成功');
    } catch (error) {
      Logger.error('❌ [PageContentService] 提取失敗:', error.message);
      // 不再提供 fallback，直接失敗
      // 上層錯誤處理會捕捉到 result 為 null 的情況
    }
    if (!result || !result.title || !result.blocks) {
      console.error('❌ Content extraction result validation failed:', {
        result,
        resultType: typeof result,
        hasResult: Boolean(result),
        hasTitle: Boolean(result?.title),
        hasBlocks: Boolean(result?.blocks),
        blocksLength: result?.blocks ? result.blocks.length : 'N/A',
        url: activeTab.url,
        timestamp: new Date().toISOString(),
      });

      // Provide more specific error messages based on what's missing
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
      config,
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
}

// 清理頁面標記的輔助函數
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

// ==========================================
// INITIALIZATION
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
    setTimeout(() => {
      chrome.tabs
        .sendMessage(tab.id, {
          type: 'UPDATE_INFO',
          previousVersion,
          currentVersion,
        })
        .catch(err => {
          Logger.log('發送更新信息失敗:', err);
        });
    }, 1000);

    Logger.log('已顯示更新通知頁面');
  } catch (error) {
    console.error('顯示更新通知失敗:', error);
  }
}

/**
 * 處理打開 Notion 頁面的請求
 */
async function handleOpenNotionPage(request, sendResponse) {
  try {
    const pageUrl = request.url;
    if (!pageUrl) {
      sendResponse({ success: false, error: 'No URL provided' });
      return;
    }

    // 標準化 URL
    const normUrl = normalizeUrl(pageUrl);

    // 查詢已保存的頁面數據
    const savedData = await getSavedPageData(normUrl);

    if (!savedData || !savedData.notionPageId) {
      sendResponse({
        success: false,
        error: '此頁面尚未保存到 Notion，請先點擊「保存頁面」',
      });
      return;
    }

    // 獲取或生成 notionUrl
    let notionUrl = savedData.notionUrl;
    if (!notionUrl && savedData.notionPageId) {
      notionUrl = `https://www.notion.so/${savedData.notionPageId.replace(/-/g, '')}`;
      Logger.log('🔗 為頁面生成 Notion URL:', notionUrl);
    }

    if (!notionUrl) {
      sendResponse({ success: false, error: '無法獲取 Notion 頁面 URL' });
      return;
    }

    // 在新標籤頁中打開 Notion 頁面
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
}

// Initialize TabService with dependencies
const tabService = new TabService({
  logger: Logger,
  injectionService,
  normalizeUrl,
  getSavedPageData,
  isRestrictedUrl: isRestrictedInjectionUrl,
  isRecoverableError: isRecoverableInjectionError,
});

// Setup all services
setupMessageHandlers();
tabService.setupListeners();

// ============================================================
// 模組導出 (用於測試)
// ============================================================
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    normalizeUrl,
    splitTextForHighlight,
    appendBlocksInBatches,
    tabService,
    getSavedPageData,
    injectionService,
    isRestrictedInjectionUrl,
    buildHighlightBlocks,
    processContentResult,
    determineAndExecuteSaveAction,
  };
}
