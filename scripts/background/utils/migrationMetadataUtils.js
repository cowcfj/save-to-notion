/**
 * 判斷 savedData 是否含 Notion 資訊
 *
 * @param {object|null} savedData
 * @returns {boolean}
 */
export function hasNotionData(savedData) {
  return Boolean(
    savedData?.notionPageId || savedData?.pageId || savedData?.notionUrl || savedData?.url
  );
}

/**
 * 比對兩筆 savedData 是否指向同一 Notion 頁面
 *
 * @param {object|null} stableSavedData
 * @param {object|null} legacySavedData
 * @returns {boolean}
 */
export function isSameNotionPage(stableSavedData, legacySavedData) {
  const stablePageId = stableSavedData?.notionPageId || stableSavedData?.pageId || null;
  const legacyPageId = legacySavedData?.notionPageId || legacySavedData?.pageId || null;

  if (stablePageId && legacyPageId) {
    return stablePageId === legacyPageId;
  }

  const stableUrl = stableSavedData?.notionUrl || stableSavedData?.url || null;
  const legacyUrl = legacySavedData?.notionUrl || legacySavedData?.url || null;
  if (stableUrl && legacyUrl) {
    return stableUrl === legacyUrl;
  }

  return true;
}
