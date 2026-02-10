/**
 * Content Utility Functions
 *
 * Helper functions for content verification and consistency checks.
 */

/**
 * 檢查文章標題是否與文檔標題一致
 *
 * 用於偵測 SPA 導航導致的數據過期或內容不匹配。
 * 策略：
 * 1. 標題太短則直接放行（避免誤殺）。
 * 2. 取候選標題的前 15 個字符作為特徵值。
 * 3. 檢查文檔標題是否包含該特徵值。
 *
 * @param {string} candidateTitle - 候選標題 (來自 Readability 或 Next.js 數據)
 * @param {string} docTitle - 當前文檔標題 (document.title)
 * @returns {boolean} true 表示一致
 */
export function isTitleConsistent(candidateTitle, docTitle) {
  if (!candidateTitle || !docTitle) {
    return true;
  }

  const cleanCandidate = candidateTitle.trim();
  const cleanDoc = docTitle.trim();

  // 標題太短容易誤殺，直接放行 (例如 "News", "Home", "HK01")
  if (cleanCandidate.length <= 4) {
    return true;
  }

  // 取前 15 個字元作為特徵值
  // 因為 document.title 常會有後綴 (e.g. " | HK01")
  // 而 candidateTitle 可能是完整標題
  const signature = cleanCandidate.slice(0, 15);

  return cleanDoc.includes(signature);
}
