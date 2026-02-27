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

function _canonicalizeNotionUrl(url) {
  if (typeof url !== 'string') {
    return null;
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    parsed.search = '';
    parsed.hash = '';

    // 非 root path 才移除尾斜線，避免把根路徑變成空字串
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
      let normalizedPath = parsed.pathname;
      while (normalizedPath.length > 1 && normalizedPath.endsWith('/')) {
        normalizedPath = normalizedPath.slice(0, -1);
      }
      parsed.pathname = normalizedPath;
    }

    // normalize percent-encoding（失敗則保留既有 path）
    try {
      parsed.pathname = encodeURI(decodeURI(parsed.pathname));
    } catch {
      // keep original pathname
    }

    return parsed.toString();
  } catch {
    // 非標準 URL：保守回退為 trim 後字串比對
    return trimmed;
  }
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
    const canonicalStableUrl = _canonicalizeNotionUrl(stableUrl);
    const canonicalLegacyUrl = _canonicalizeNotionUrl(legacyUrl);
    return canonicalStableUrl === canonicalLegacyUrl;
  }

  return null;
}
