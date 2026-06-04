/**
 * railInitialization.js
 *
 * 管理 __NOTION_RAIL_READY__ 的 Promise 生命週期與 Floating Rail 的動態載入與初始化。
 */

import { RUNTIME_ERROR_MESSAGES } from '../../config/runtimeActions/errorMessages.js';
import Logger from '../../utils/Logger.js';

/**
 * 建立 Rail 初始化控制器
 *
 * @param {object} options
 * @param {object} options.globalScope - 全域作用域物件（預設為 globalThis）
 * @returns {object} { failRailReady, initializeFloatingRail, settleRailReady }
 */
export function createRailInitializationController({ globalScope = globalThis } = {}) {
  let railReadyResolve;
  let isRailReadySettled = false;

  const railReadyPromise = new Promise(resolve => {
    railReadyResolve = resolve;
  });

  // 必須在 Controller 建立時立刻掛載 promise，確保與原有的 content script 載入時序一致
  globalScope.__NOTION_RAIL_READY__ = railReadyPromise;

  /**
   * 標記 rail 狀態為完成（成功或失敗）
   *
   * @param {object} result
   * @param {boolean} result.success
   * @param {object} [result.rail]
   * @param {string} [result.error]
   */
  function settleRailReady(result) {
    if (isRailReadySettled) {
      return;
    }
    isRailReadySettled = true;
    if (!result?.success) {
      globalScope.__NOTION_RAIL_READY__ = undefined;
    }
    railReadyResolve(result);
  }

  /**
   * 標記 rail 狀態為失敗
   *
   * @param {Error} error
   * @param {string} [fallbackMessage]
   */
  function failRailReady(error, fallbackMessage) {
    settleRailReady({
      success: false,
      error: fallbackMessage || error?.message,
    });
  }

  /**
   * 動態載入並初始化 Floating Rail
   *
   * @param {object} manager - Highlighter manager 實例
   * @param {boolean} autoShowRail - 是否自動顯示 Floating Rail
   */
  async function initializeFloatingRail(manager, autoShowRail) {
    try {
      const { FloatingRail } = await import('../ui/FloatingRail.js');
      const rail = new FloatingRail(manager);
      await rail.initialize();

      if (globalScope.HighlighterV2) {
        globalScope.HighlighterV2.rail = rail;
      }

      if (!autoShowRail) {
        rail.hide();
      }
      settleRailReady({ success: true, rail });
    } catch (railError) {
      Logger.warn('[Highlighter] Floating Rail 初始化失敗', {
        action: 'initializeExtension',
        error: railError?.message,
      });
      failRailReady(railError, RUNTIME_ERROR_MESSAGES.FLOATING_RAIL_INIT_FAILED);
    }
  }

  return {
    failRailReady,
    initializeFloatingRail,
    settleRailReady,
  };
}
