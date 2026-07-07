/**
 * 圖片處理工具 - 區塊合併葉模組
 * 負責將額外圖片區塊與主內容區塊進行去重與合併
 */

/**
 * 從圖片 block 物件中讀取 external URL
 *
 * @param {object} block - Notion image block 結構
 * @returns {string|null} URL 或 null
 * @private
 */
function _extractImageBlockUrl(block) {
  if (!block || block.type !== 'image') {
    return null;
  }
  return block.image?.external?.url ?? null;
}

/**
 * 判斷是否應該保留額外圖片區塊（去重）
 *
 * @param {object} imgBlock - Notion block 結構
 * @param {Set<string>} existingUrls - 已存在的圖片 URL 集合
 * @returns {boolean} 是否保留
 * @private
 */
function _shouldKeepAdditionalImage(imgBlock, existingUrls) {
  if (!imgBlock || typeof imgBlock !== 'object') {
    return false;
  }
  if (imgBlock.type !== 'image') {
    return true;
  }
  const url = _extractImageBlockUrl(imgBlock);
  if (!url || existingUrls.has(url)) {
    return false;
  }
  existingUrls.add(url);
  return true;
}

/**
 * 合併圖片區塊，過濾掉已存在於主區塊列表中的重複圖片
 *
 * @param {Array} contentBlocks - 主內容區塊列表
 * @param {Array} additionalImages - 待合併的額外圖片列表
 * @returns {Array} 去重後的額外圖片列表
 */
export function mergeUniqueImages(contentBlocks, additionalImages) {
  if (!Array.isArray(additionalImages) || additionalImages.length === 0) {
    return [];
  }

  const existingUrls = new Set();

  if (Array.isArray(contentBlocks)) {
    for (const block of contentBlocks) {
      const url = _extractImageBlockUrl(block);
      if (url) {
        existingUrls.add(url);
      }
    }
  }

  return additionalImages.filter(imgBlock => _shouldKeepAdditionalImage(imgBlock, existingUrls));
}
