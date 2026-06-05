import Logger from '../../utils/Logger.js';

function getRestoreGlobalScope(options) {
  return options?.globalScope ?? globalThis;
}

function getRestoreLogger(options) {
  return options?.logger ?? Logger;
}

function getHighlighter(globalScope) {
  return globalScope.HighlighterV2 || {};
}

function hasSkipRestoreFlag(highlighter, shouldSkipLateRestore) {
  return (
    shouldSkipLateRestore || highlighter.skipRestore === true || highlighter.wasDeleted === true
  );
}

function hasNoHighlights(manager) {
  return typeof manager?.getCount === 'function' && manager.getCount() === 0;
}

function canRetryLateStableUrlRestore({
  hasRetriedLateStableRestore,
  shouldSkipLateRestore,
  highlighter,
}) {
  if (hasRetriedLateStableRestore) {
    return false;
  }
  if (hasSkipRestoreFlag(highlighter, shouldSkipLateRestore)) {
    return false;
  }
  if (!hasNoHighlights(highlighter.manager)) {
    return false;
  }
  return typeof highlighter.restoreManager?.restore === 'function';
}

function sendRestoreFailure({ logger, sendResponse, error }) {
  logger.warn('[Highlighter] 延後收到穩定 URL，重試恢復標註失敗', {
    action: 'SET_STABLE_URL',
    error,
  });
  sendResponse({ success: false, error: String(error) });
}

export function createLateStableUrlRestoreController(options) {
  const globalScope = getRestoreGlobalScope(options);
  const logger = getRestoreLogger(options);
  let hasRetriedLateStableRestore = false;
  let shouldSkipLateRestore = false;

  function markSkipLateRestore(skipRestore) {
    shouldSkipLateRestore = skipRestore;
  }

  function handleSetStableUrl(request, sendResponse) {
    globalScope.__NOTION_STABLE_URL__ = request.stableUrl;

    const highlighter = getHighlighter(globalScope);
    if (
      !canRetryLateStableUrlRestore({
        hasRetriedLateStableRestore,
        shouldSkipLateRestore,
        highlighter,
      })
    ) {
      sendResponse({ success: true });
      return true;
    }

    hasRetriedLateStableRestore = true;
    highlighter.restoreManager
      .restore()
      .then(() => {
        sendResponse({ success: true });
      })
      .catch(error => {
        sendRestoreFailure({ logger, sendResponse, error });
      });

    return true;
  }

  return {
    handleSetStableUrl,
    markSkipLateRestore,
  };
}
