/**
 * 判斷 savedData 是否含 Notion 資訊
 *
 * @param {object|null} savedData
 * @returns {boolean}
 */
function _extractNotionPageId(savedData) {
  return savedData?.notionPageId || savedData?.pageId || savedData?.notion?.pageId || null;
}

function _extractNotionUrl(savedData) {
  return savedData?.notionUrl || savedData?.notion?.url || null;
}

export function hasNotionData(savedData) {
  return Boolean(_extractNotionPageId(savedData) || _extractNotionUrl(savedData));
}

/**
 * 比對兩筆 savedData 是否指向同一 Notion 頁面
 *
 * @param {object|null} stableSavedData
 * @param {object|null} legacySavedData
 * @returns {boolean|null}
 */
export function isSameNotionPage(stableSavedData, legacySavedData) {
  const stablePageId = _extractNotionPageId(stableSavedData);
  const legacyPageId = _extractNotionPageId(legacySavedData);

  if (stablePageId && legacyPageId) {
    return stablePageId === legacyPageId;
  }

  const stableUrl = _extractNotionUrl(stableSavedData);
  const legacyUrl = _extractNotionUrl(legacySavedData);
  if (stableUrl && legacyUrl) {
    return stableUrl === legacyUrl;
  }

  return null;
}
