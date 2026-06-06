import { CONTENT_BRIDGE_ACTIONS } from '../config/runtimeActions/contentBridgeActions.js';
import { HIGHLIGHTER_ACTIONS } from '../config/runtimeActions/highlighterActions.js';
import { RUNTIME_ERROR_MESSAGES } from '../config/runtimeActions/errorMessages.js';
import { revealFloatingRail as defaultRevealFloatingRail } from '../highlighter/utils/floatingRailAvailability.js';
import { isRootUrl } from '../utils/urlUtils.js';

/**
 * 顯示或喚回 Floating Rail 後執行指定動作。
 *
 * @param {object} rail - Floating Rail instance
 * @param {Function} onRevealed - rail 已顯示後執行的動作
 * @param {Function} [revealFloatingRail] - rail reveal helper
 * @returns {void|Promise<void>}
 */
function runAfterFloatingRailReveal(
  rail,
  onRevealed,
  revealFloatingRail = defaultRevealFloatingRail
) {
  const revealResult = revealFloatingRail(rail);
  if (Boolean(revealResult) && typeof revealResult.then === 'function') {
    return revealResult.then(onRevealed);
  }

  return onRevealed();
}

/**
 * 啟動已顯示 Floating Rail 的標註模式。
 *
 * @param {object} rail - Floating Rail instance
 * @returns {void|Promise<void>}
 */
function activateRevealedFloatingRailHighlighting(rail) {
  if (typeof rail?.activateHighlighting !== 'function') {
    throw new TypeError(RUNTIME_ERROR_MESSAGES.FLOATING_RAIL_ACTIVATE_METHOD_MISSING);
  }

  return rail.activateHighlighting();
}

/**
 * 啟動 Floating Rail 標註模式。
 *
 * @param {object} rail - Floating Rail instance
 * @param {{revealFloatingRail?: Function}} [options] - helper injection for tests/router factory
 * @returns {void|Promise<void>}
 */
export function activateFloatingRailHighlighting(rail, options = {}) {
  return runAfterFloatingRailReveal(
    rail,
    () => activateRevealedFloatingRailHighlighting(rail),
    options.revealFloatingRail
  );
}

/**
 * 驗證 URL 是否可作為穩定 URL。
 *
 * @param {unknown} url - 待驗證的 URL
 * @param {object} logger - Logger-like object
 * @returns {boolean}
 */
function isValidStableUrl(url, logger) {
  if (typeof url !== 'string' || url.trim() === '') {
    return false;
  }

  if (isRootUrl(url)) {
    logger.debug('拒絕設置首頁 URL 為穩定 URL', { action: 'setStableUrl', rejected: url });
    return false;
  }

  try {
    new URL(url);
    return true;
  } catch {
    logger.debug('拒絕設置無效 URL 為穩定 URL', { action: 'setStableUrl', rejected: url });
    return false;
  }
}

function handlePing({ getPreloaderCache, isBundleReady }, sendResponse) {
  const preloaderCache = getPreloaderCache();
  sendResponse({
    status: isBundleReady() ? 'bundle_ready' : 'preloader_only',
    hasPreloaderCache: Boolean(preloaderCache),
    nextRouteInfo: preloaderCache?.nextRouteInfo || null,
    shortlink: preloaderCache?.shortlink || null,
  });
}

function handleRemoveHighlightDom({ getHighlighterRuntime, logger }, highlightId, sendResponse) {
  try {
    const removed = getHighlighterRuntime()?.manager?.removeHighlight?.(highlightId);

    if (removed === undefined) {
      logger.warn('Highlighter 尚未初始化，略過移除標註 DOM', {
        action: 'REMOVE_HIGHLIGHT_DOM',
        highlightId,
      });
      sendResponse({ success: false, error: 'Highlighter 尚未初始化' });
    } else {
      sendResponse({ success: Boolean(removed) });
    }
  } catch (error) {
    logger.error('移除標註 DOM 失敗', { action: 'REMOVE_HIGHLIGHT_DOM', error });
    sendResponse({
      success: false,
      error: error?.message ?? '移除標註 DOM 失敗',
    });
  }
}

function handleSetStableUrl({ logger, setStableUrl }, stableUrl, sendResponse) {
  if (!isValidStableUrl(stableUrl, logger)) {
    sendResponse({ success: false, error: 'INVALID_STABLE_URL' });
    return;
  }

  setStableUrl(stableUrl);
  logger.debug('已接收並設置穩定 URL', { action: 'setStableUrl', stableUrl });
  sendResponse({ success: true });
}

function createActivationHandler(revealFloatingRail) {
  return rail => activateFloatingRailHighlighting(rail, { revealFloatingRail });
}

/**
 * 建立 content runtime message router。
 *
 * @param {object} dependencies - runtime dependencies owned by content entry
 * @param {Function} dependencies.getPreloaderCache
 * @param {Function} dependencies.isBundleReady
 * @param {Function} dependencies.getStableUrl
 * @param {Function} dependencies.setStableUrl
 * @param {Function} dependencies.getHighlighterRuntime
 * @param {object} dependencies.logger
 * @param {Function} dependencies.withAvailableFloatingRail
 * @param {Function} dependencies.revealFloatingRail
 * @returns {(request: unknown, sender: unknown, sendResponse: Function) => boolean}
 */
export function createContentRuntimeMessageHandler(dependencies) {
  const { getStableUrl, getHighlighterRuntime, withAvailableFloatingRail, revealFloatingRail } =
    dependencies;
  const activateFloatingRail = createActivationHandler(revealFloatingRail);

  const runtimeMessageHandlers = {
    [CONTENT_BRIDGE_ACTIONS.PING]: (_request, sendResponse) => {
      handlePing(dependencies, sendResponse);
      return true;
    },
    [HIGHLIGHTER_ACTIONS.SHOW_HIGHLIGHTER]: (_request, sendResponse) => {
      void withAvailableFloatingRail(sendResponse, revealFloatingRail);
      return true;
    },
    [CONTENT_BRIDGE_ACTIONS.SHOW_FLOATING_RAIL]: (_request, sendResponse) => {
      void withAvailableFloatingRail(sendResponse, revealFloatingRail);
      return true;
    },
    [CONTENT_BRIDGE_ACTIONS.SHOW_TOAST]: request => {
      getHighlighterRuntime()?.toast?.show(request.messageKey, { level: request.level });
      return false;
    },
    [HIGHLIGHTER_ACTIONS.ACTIVATE_FLOATING_RAIL_HIGHLIGHT]: (request, sendResponse) => {
      void withAvailableFloatingRail(sendResponse, activateFloatingRail, {
        sessionOverride: request?.sessionOverride === true,
      });
      return true;
    },
    [HIGHLIGHTER_ACTIONS.REMOVE_HIGHLIGHT_DOM]: (request, sendResponse) => {
      handleRemoveHighlightDom(dependencies, request.highlightId, sendResponse);
      return true;
    },
    [CONTENT_BRIDGE_ACTIONS.SET_STABLE_URL]: (request, sendResponse) => {
      handleSetStableUrl(dependencies, request.stableUrl, sendResponse);
      return true;
    },
    [CONTENT_BRIDGE_ACTIONS.GET_STABLE_URL]: (_request, sendResponse) => {
      sendResponse({ stableUrl: getStableUrl() });
      return true;
    },
    [CONTENT_BRIDGE_ACTIONS.INIT_BUNDLE]: (_request, sendResponse) => {
      sendResponse({ ready: true, bufferedEvents: 0 });
      return true;
    },
  };

  return function handleRuntimeMessage(request, _sender, sendResponse) {
    if (!request || typeof request !== 'object') {
      return false;
    }

    const handler = runtimeMessageHandlers[request.action];
    if (!handler) {
      return false;
    }

    return handler(request, sendResponse);
  };
}
