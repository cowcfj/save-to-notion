/**
 * help.html 頁面腳本
 * 處理版本顯示與 FAQ 互動
 */

document.addEventListener('DOMContentLoaded', () => {
  // 版本設定（防禦性檢查，確保在非擴展環境中也能運作）
  let versionStr = '';

  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.getManifest) {
      const version = chrome.runtime.getManifest().version;
      versionStr = `v${version}`;
      document.title = `Notion Smart Clipper ${versionStr}`;
    }
  } catch {
    // 在非擴展環境中靜默失敗，使用預設值
  }

  // 更新所有版本顯示元素
  document.querySelectorAll('.version-display').forEach(el => {
    el.textContent = versionStr;
  });
});
