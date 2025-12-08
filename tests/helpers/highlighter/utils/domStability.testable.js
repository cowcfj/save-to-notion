/**
 * DOM 穩定性工具組（Testable 版本）
 *
 * 此檔案為測試版本，使用 CommonJS 格式
 * 源檔案：scripts/highlighter/utils/domStability.js (ES6 模組)
 */

function waitForDOMStability(options = {}) {
  const { containerSelector = null, stabilityThresholdMs = 150, maxWaitMs = 5000 } = options;

  return new Promise(resolve => {
    if (typeof document === 'undefined' || !document.body) {
      resolve(false);
      return;
    }

    let targetContainer = document.body;
    if (containerSelector) {
      const container = document.querySelector(containerSelector);
      if (!container) {
        resolve(false);
        return;
      }
      targetContainer = container;
    }

    let observer = null;
    let stabilityTimerId = null;
    let maxWaitTimerId = null;
    let idleCallbackId = null;
    let lastMutationTime = Date.now();

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

    const checkStability = () => {
      const timeSinceLastMutation = Date.now() - lastMutationTime;

      if (timeSinceLastMutation >= stabilityThresholdMs) {
        cleanup();
        resolve(true);
        return true;
      }

      return false;
    };

    const scheduleStabilityCheck = () => {
      if (stabilityTimerId !== null) {
        clearTimeout(stabilityTimerId);
        stabilityTimerId = null;
      }
      if (idleCallbackId !== null && typeof cancelIdleCallback !== 'undefined') {
        cancelIdleCallback(idleCallbackId);
        idleCallbackId = null;
      }

      if (typeof requestIdleCallback !== 'undefined') {
        idleCallbackId = requestIdleCallback(
          () => {
            if (!checkStability()) {
              stabilityTimerId = setTimeout(scheduleStabilityCheck, stabilityThresholdMs);
            }
          },
          { timeout: stabilityThresholdMs }
        );
      } else {
        stabilityTimerId = setTimeout(() => {
          if (!checkStability()) {
            scheduleStabilityCheck();
          }
        }, stabilityThresholdMs);
      }
    };

    const handleTimeout = () => {
      cleanup();
      resolve(false);
    };

    maxWaitTimerId = setTimeout(handleTimeout, maxWaitMs);

    observer = new MutationObserver(() => {
      lastMutationTime = Date.now();
      scheduleStabilityCheck();
    });

    try {
      observer.observe(targetContainer, {
        childList: true,
        subtree: true,
      });

      scheduleStabilityCheck();
    } catch (_error) {
      cleanup();
      resolve(false);
    }
  });
}

if (typeof module !== 'undefined') {
  module.exports = {
    waitForDOMStability,
  };
}
