/**
 * stableUrlResolution.js
 *
 * Highlighter V2 初始化階段的穩定 URL 解析模組。
 *
 * 職責：
 * - 等待並監聽來自 Background 的 SET_STABLE_URL 訊息，包含超時保護。
 * - 依優先級解析頁面初始化所需的穩定 URL（__NOTION_STABLE_URL__ > SET_STABLE_URL 訊息 > checkPageStatus 快取）。
 * - 寫入全域 __NOTION_STABLE_URL__ 並以安全（去敏感）日誌記錄解析來源。
 */

/**
 * 監聽單次 SET_STABLE_URL 訊息的內部輔助函數
 *
 * @param {object} params
 * @param {object} params.onMessage - chrome.runtime.onMessage 監聽器
 * @param {number} params.timeoutMs - 超時毫秒數
 * @param {object} params.contentBridgeActions - action 常量定義
 * @param {object} params.logger - Logger 實例
 * @returns {Promise<string|null>}
 */
function awaitStableUrlMessage({ onMessage, timeoutMs, contentBridgeActions, logger }) {
  return new Promise(resolve => {
    let resolved = false;

    const settle = value => {
      if (resolved) {
        return;
      }
      resolved = true;
      try {
        onMessage?.removeListener(handler);
      } catch (error) {
        logger?.warn('[Highlighter] 移除 SET_STABLE_URL 監聽器失敗', {
          action: 'waitForStableUrl',
          error: error?.message,
        });
      }
      resolve(value);
    };

    // 監聽 SET_STABLE_URL 訊息
    const handler = request => {
      if (request?.action === contentBridgeActions?.SET_STABLE_URL && request?.stableUrl) {
        settle(request.stableUrl);
      }
    };

    try {
      onMessage?.addListener(handler);
    } catch (error) {
      logger?.warn('[Highlighter] 註冊 SET_STABLE_URL 監聽器失敗', {
        action: 'waitForStableUrl',
        error: error?.message,
      });
      settle(null);
      return;
    }

    // 超時保護：避免無限等待
    setTimeout(() => {
      if (!resolved) {
        logger?.debug('[Highlighter] 等待 SET_STABLE_URL 超時，將在沒有穩定 URL 的情況下繼續', {
          action: 'waitForStableUrl',
        });
        settle(null);
      }
    }, timeoutMs);
  });
}

/**
 * 等待 Background Script 通過 SET_STABLE_URL 訊息發送穩定 URL。
 * 帶超時保護：若超時未收到，返回 null。
 *
 * @param {object} params
 * @param {object} [params.globalScope] - 全域作用域（預設為 globalThis）
 * @param {number} params.timeoutMs - 超時毫秒數
 * @param {object} params.contentBridgeActions - Action 常量定義
 * @param {object} params.logger - Logger 實例
 * @returns {Promise<string|null>}
 */
export function waitForStableUrl({
  globalScope = globalThis,
  timeoutMs,
  contentBridgeActions,
  logger,
}) {
  // 如果已經通過其他途徑設置了，直接返回
  if (globalScope.__NOTION_STABLE_URL__) {
    return Promise.resolve(globalScope.__NOTION_STABLE_URL__);
  }

  return awaitStableUrlMessage({
    onMessage: globalScope.chrome?.runtime?.onMessage,
    timeoutMs,
    contentBridgeActions,
    logger,
  });
}

/**
 * 解析頁面初始化所使用的穩定 URL（實作優先權決策）。
 *
 * 設置穩定 URL 優先權（Phase 3 regression fix）：
 * - SET_STABLE_URL 是 Background 在 preloader 解析完成後主動推送的，代表最新且最權威的 canonical source。
 * - checkPageStatus 的 stableUrl 可能來自較舊的快取，優先級較低。
 *
 * @param {object} params
 * @param {object} [params.globalScope] - 全域作用域（預設為 globalThis）
 * @param {object} [params.pageStatus] - checkPageStatus 的回傳結果
 * @param {Promise<string|null>} params.runtimeStableUrlPromise - 透過 waitForStableUrl 取得的 Promise
 * @returns {Promise<object>} { resolvedStableUrl, stableUrlSource }
 */
export function resolveStableUrlForInit({
  globalScope = globalThis,
  pageStatus,
  runtimeStableUrlPromise,
}) {
  const pendingRuntimeStableUrl = Symbol('pending_runtime_stable_url');
  return Promise.race([runtimeStableUrlPromise, Promise.resolve(pendingRuntimeStableUrl)]).then(
    runtimeStableUrlResult => {
      const runtimeStableUrl =
        runtimeStableUrlResult === pendingRuntimeStableUrl ? null : runtimeStableUrlResult;

      const resolvedStableUrl =
        globalScope.__NOTION_STABLE_URL__ || runtimeStableUrl || pageStatus?.stableUrl || null;
      const stableUrlSource =
        globalScope.__NOTION_STABLE_URL__ || runtimeStableUrl
          ? 'SET_STABLE_URL'
          : 'checkPageStatus';

      return { resolvedStableUrl, stableUrlSource };
    }
  );
}

/**
 * 套用解析後的穩定 URL，並記錄去敏感日誌。
 *
 * @param {object} params
 * @param {object} [params.globalScope] - 全域作用域（預設為 globalThis）
 * @param {string|null} params.resolvedStableUrl - 解析後的穩定 URL
 * @param {string} params.stableUrlSource - 解析來源說明字串
 * @param {object} params.logger - Logger 實例
 * @param {Function} [params.sanitizeUrlForLogging] - 安全過濾 URL 的函數
 */
export function applyResolvedStableUrl({
  globalScope = globalThis,
  resolvedStableUrl,
  stableUrlSource,
  logger,
  sanitizeUrlForLogging,
}) {
  if (resolvedStableUrl) {
    globalScope.__NOTION_STABLE_URL__ = resolvedStableUrl;

    const loggedUrl =
      typeof sanitizeUrlForLogging === 'function'
        ? sanitizeUrlForLogging(resolvedStableUrl)
        : resolvedStableUrl;

    logger?.debug('[Highlighter] 已使用穩定 URL 完成初始化', {
      action: 'initializeExtension',
      stableUrl: loggedUrl,
      source: stableUrlSource,
    });
  }
}
