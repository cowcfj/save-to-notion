/**
 * help.html 頁面腳本
 * 處理版本顯示與 FAQ 互動
 */

document.addEventListener('DOMContentLoaded', () => {
  // 版本設定
  const version = chrome.runtime.getManifest().version;
  const versionStr = `v${version}`;
  document.title = `Notion Smart Clipper ${versionStr}`;

  // 更新所有版本顯示元素
  document.querySelectorAll('.version-display').forEach(el => {
    el.textContent = versionStr;
  });

  // FAQ 互動（可選的視覺切換支援）
  document.querySelectorAll('.faq-item').forEach(item => {
    item.addEventListener('click', () => {
      // 如有需要，可在此添加展開/收合邏輯
    });
  });
});
