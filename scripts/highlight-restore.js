// 標註恢復腳本
// 用於在頁面刷新後恢復已保存的標註

'use strict';

(function () {

  // 常數：工具欄隱藏延遲（毫秒）
  const HIDE_TOOLBAR_DELAY_MS = 500; // 與既有行為一致，避免改變 UX 時序

  // 使用 Logger 系統（可能在某些環境不存在，使用可選鏈避免報錯）
  const log = {
    info: (msg, ...args) => window.Logger?.info?.(msg, ...args),
    warn: (msg, ...args) => window.Logger?.warn?.(msg, ...args),
    error: (msg, ...args) => window.Logger?.error?.(msg, ...args),
  };

  // 在 DOM 就緒後執行，降低初始化時序造成的間歇性失敗
  const onReady = (fn) => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => fn(), { once: true });
    } else {
      fn();
    }
  };

  const run = async () => {
    // 確保必要的依賴已加載
    if (typeof window.initHighlighter !== 'function') {
      // 依規範使用 Logger
      log.warn('⚠️ 標註工具未加載，無法恢復標註');
      return;
    }

    // 初始化標註工具（加上���誤處理以避免整段腳本中斷）
    try {
      window.initHighlighter();
      log.info('🔧 執行標註恢復腳本');
    } catch (e) {
      log.error('❌ 標註初始化過程中出錯:', e);
      // 初始化失敗則無法繼續恢復流程
      return;
    }

    // 嘗試恢復標註（防禦式存取，避免 TypeError）
    const canForceRestore =
      typeof window.notionHighlighter?.manager?.forceRestoreHighlights === 'function';

    if (canForceRestore) {
      try {
        const result = await window.notionHighlighter.manager.forceRestoreHighlights();
        // 若沒有明確的布林規約，僅在明確 true 時標記成功
        if (result === true) {
          log.info('✅ 標註恢復成功');
        } else {
          log.warn('⚠️ 標註恢復失敗');
        }
      } catch (error) {
        log.error('❌ 標註恢復過程中出錯:', error);
      }
    } else {
      log.warn('⚠️ 無法找到標註管理器，跳過強制恢復');
    }

    // 隱藏工具欄（保持原 500ms 行為，避免改變既有使用者感受）
    setTimeout(() => {
      if (typeof window.notionHighlighter?.hide === 'function') {
        try {
          window.notionHighlighter.hide();
        } catch (e) {
          // 隱藏失敗不應阻斷流程，只記錄錯誤
          log.error('❌ 隱藏標註工具欄時出錯:', e);
        }
      }
    }, HIDE_TOOLBAR_DELAY_MS);
  };

  onReady(run);
})();
