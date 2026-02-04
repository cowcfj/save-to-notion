/**
 * DOM 穩定性工具模組
 * 提供等待 DOM 穩定的功能
 */

/**
 * 等待 DOM 穩定
 * 監視指定容器或整個文檔的 DOM 變更，當在穩定閾值時間內無新增變更時視為穩定
 *
 * @param {object} options - 配置選項
 * @param {string} [options.containerSelector] - 要監視的容器選擇器
 * @param {number} [options.stabilityThresholdMs=150] - 穩定閾值（毫秒）
 * @param {number} [options.maxWaitMs=5000] - 最大等待時間（毫秒）
 * @returns {Promise<boolean>} true=成功穩定, false=超時或找不到容器
 * @example
 * const isStable = await waitForDOMStability();
 * @example
 * const isStable = await waitForDOMStability({
 *   containerSelector: '#main',
 *   stabilityThresholdMs: 200,
 *   maxWaitMs: 3000
 * });
 */
export function waitForDOMStability(options = {}) {
  const { containerSelector = null, stabilityThresholdMs = 150, maxWaitMs = 5000 } = options;

  return new Promise(resolve => {
    // 確保 document.body 存在
    if (typeof document === 'undefined' || !document.body) {
      resolve(false);
      return;
    }

    // 確定要監視的容器
    let targetContainer = document.body;
    if (containerSelector) {
      const container = document.querySelector(containerSelector);
      if (!container) {
        resolve(false);
        return;
      }
      targetContainer = container;
    }

    // 資源追蹤
    let observer = null;
    let stabilityTimerId = null;
    let maxWaitTimerId = null;
    let idleCallbackId = null;
    let lastMutationTime = Date.now();

    // 清理所有資源
    const cleanup = () => {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      if (stabilityTimerId !== null) {
        clearTimeout(stabilityTimerId);
        stabilityTimerId = null;
      }
      if (maxWaitTimerId !== null) {
        clearTimeout(maxWaitTimerId);
        maxWaitTimerId = null;
      }
      if (idleCallbackId !== null && typeof cancelIdleCallback !== 'undefined') {
        cancelIdleCallback(idleCallbackId);
        idleCallbackId = null;
      }
    };

    // 檢查 DOM 是否已穩定
    const checkStability = () => {
      const timeSinceLastMutation = Date.now() - lastMutationTime;

      if (timeSinceLastMutation >= stabilityThresholdMs) {
        cleanup();
        resolve(true);
        return true;
      }

      return false;
    };

    // 排程穩定檢查
    const scheduleStabilityCheck = () => {
      if (stabilityTimerId !== null) {
        clearTimeout(stabilityTimerId);
        stabilityTimerId = null;
      }
      if (idleCallbackId !== null && typeof cancelIdleCallback !== 'undefined') {
        cancelIdleCallback(idleCallbackId);
        idleCallbackId = null;
      }

      // 優先使用 requestIdleCallback
      if (typeof requestIdleCallback === 'undefined') {
        stabilityTimerId = setTimeout(() => {
          if (!checkStability()) {
            scheduleStabilityCheck();
          }
        }, stabilityThresholdMs);
      } else {
        idleCallbackId = requestIdleCallback(
          () => {
            if (!checkStability()) {
              stabilityTimerId = setTimeout(scheduleStabilityCheck, stabilityThresholdMs);
            }
          },
          { timeout: stabilityThresholdMs }
        );
      }
    };

    // 超時處理
    const handleTimeout = () => {
      cleanup();
      resolve(false);
    };

    // 設置最大等待時間
    maxWaitTimerId = setTimeout(handleTimeout, maxWaitMs);

    // 創建 MutationObserver
    observer = new MutationObserver(() => {
      lastMutationTime = Date.now();
      scheduleStabilityCheck();
    });

    // 開始觀察
    try {
      observer.observe(targetContainer, {
        childList: true,
        subtree: true,
      });

      scheduleStabilityCheck();
    } catch {
      cleanup();
      resolve(false);
    }
  });
}
