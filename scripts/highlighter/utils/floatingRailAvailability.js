import { RUNTIME_ERROR_MESSAGES } from '../../config/runtimeActions/errorMessages.js';

const ALLOWED_RUNTIME_ERROR_MESSAGES = new Set([
  RUNTIME_ERROR_MESSAGES.EXTENSION_UNAVAILABLE,
  RUNTIME_ERROR_MESSAGES.FLOATING_RAIL_NOT_INITIALIZED,
  RUNTIME_ERROR_MESSAGES.FLOATING_RAIL_INIT_FAILED,
  RUNTIME_ERROR_MESSAGES.FLOATING_RAIL_SHOW_METHOD_MISSING,
  RUNTIME_ERROR_MESSAGES.FLOATING_RAIL_ACTIVATE_METHOD_MISSING,
  RUNTIME_ERROR_MESSAGES.FLOATING_RAIL_ACTION_FAILED,
  RUNTIME_ERROR_MESSAGES.SHORTCUT_REPLAY_FAILED,
]);

function isAllowedRuntimeErrorMessage(message) {
  return typeof message === 'string' && ALLOWED_RUNTIME_ERROR_MESSAGES.has(message);
}

/**
 * 顯示或喚回 Floating Rail
 *
 * @param {object} rail - Floating Rail instance
 * @returns {void|Promise<void>}
 */
export function revealFloatingRail(rail) {
  if (rail?.stateManager?.isDismissed && typeof rail.undismiss === 'function') {
    return rail.undismiss();
  }

  if (typeof rail?.show !== 'function') {
    throw new TypeError(RUNTIME_ERROR_MESSAGES.FLOATING_RAIL_SHOW_METHOD_MISSING);
  }

  return rail.show();
}

/**
 * 將 runtime error 正規化為可顯示字串
 *
 * @param {unknown} error - 錯誤物件
 * @param {string} fallbackMessage - 後備錯誤訊息
 * @returns {string}
 */
export function formatRuntimeErrorMessage(error, fallbackMessage) {
  if (isAllowedRuntimeErrorMessage(error)) {
    return error;
  }

  if (isAllowedRuntimeErrorMessage(error?.message)) {
    return error.message;
  }

  return fallbackMessage;
}

function sendFloatingRailError(sendResponse, error) {
  sendResponse({
    success: false,
    error: formatRuntimeErrorMessage(error, RUNTIME_ERROR_MESSAGES.FLOATING_RAIL_ACTION_FAILED),
  });
}

function isPromiseLike(value) {
  return Boolean(value) && typeof value.then === 'function';
}

function resetFloatingRailReady() {
  globalThis.__NOTION_RAIL_READY__ = undefined;
}

async function runActiveRailAction(activeRail, onRailReady, sendResponse) {
  try {
    const activeResult = onRailReady(activeRail);
    if (isPromiseLike(activeResult)) {
      await activeResult;
    }
    sendResponse({ success: true });
  } catch (error) {
    sendFloatingRailError(sendResponse, error);
  }
}

async function createDynamicRailInitPromise(manager) {
  try {
    const { FloatingRail } = await import('../ui/FloatingRail.js');
    const rail = new FloatingRail(manager);
    const initResult = await rail.initialize();
    if (initResult?.success) {
      globalThis.HighlighterV2.rail = rail;
      return { success: true, rail };
    }
    return {
      success: false,
      error: initResult?.error || RUNTIME_ERROR_MESSAGES.FLOATING_RAIL_INIT_FAILED,
    };
  } catch (error) {
    return { success: false, error };
  }
}

async function recoverReadyFailureWithDynamicRail(onRailReady, sendResponse) {
  const manager = globalThis.HighlighterV2?.manager;
  if (!manager) {
    return false;
  }

  const recoveryPromise = createDynamicRailInitPromise(manager);
  globalThis.__NOTION_RAIL_READY__ = recoveryPromise;
  await awaitReadyAndAct(recoveryPromise, onRailReady, sendResponse, { sessionOverride: false });
  return true;
}

function sendReadyFailureResponse(sendResponse, error) {
  sendResponse({
    success: false,
    error: formatRuntimeErrorMessage(error, RUNTIME_ERROR_MESSAGES.FLOATING_RAIL_INIT_FAILED),
  });
}

async function recoverOrSendReadyFailure({ onRailReady, sendResponse, sessionOverride, error }) {
  if (sessionOverride && (await recoverReadyFailureWithDynamicRail(onRailReady, sendResponse))) {
    return;
  }

  sendReadyFailureResponse(sendResponse, error);
}

async function runReadyRailAction(rail, onRailReady, sendResponse) {
  try {
    const readyActionResult = onRailReady(rail);
    if (isPromiseLike(readyActionResult)) {
      await readyActionResult;
    }
    sendResponse({ success: true });
  } catch (error) {
    resetFloatingRailReady();
    sendFloatingRailError(sendResponse, error);
  }
}

async function awaitReadyAndAct(
  railReadyPromise,
  onRailReady,
  sendResponse,
  { sessionOverride = false } = {}
) {
  let readyResult;
  try {
    readyResult = await railReadyPromise;
  } catch {
    resetFloatingRailReady();
    await recoverOrSendReadyFailure({
      onRailReady,
      sendResponse,
      sessionOverride,
      error: RUNTIME_ERROR_MESSAGES.FLOATING_RAIL_INIT_FAILED,
    });
    return;
  }

  if (!readyResult?.success || !readyResult.rail) {
    resetFloatingRailReady();
    await recoverOrSendReadyFailure({
      onRailReady,
      sendResponse,
      sessionOverride,
      error: readyResult?.error,
    });
    return;
  }

  await runReadyRailAction(readyResult.rail, onRailReady, sendResponse);
}

/**
 * 執行依賴 Floating Rail 可用性的 action
 *
 * @param {Function} sendResponse - 回應函數
 * @param {(rail: object) => (void|Promise<void>)} onRailReady - rail action callback
 * @param {{sessionOverride?: boolean}} [options] - popup user action 可要求本 tab 動態喚回 rail
 */
export async function withAvailableFloatingRail(sendResponse, onRailReady, options = {}) {
  const activeRail = globalThis.HighlighterV2?.rail;
  if (activeRail) {
    await runActiveRailAction(activeRail, onRailReady, sendResponse);
    return;
  }

  let railReadyPromise = globalThis.__NOTION_RAIL_READY__;
  if (!railReadyPromise) {
    const manager = globalThis.HighlighterV2?.manager;
    if (!manager) {
      sendResponse({ success: false, error: RUNTIME_ERROR_MESSAGES.FLOATING_RAIL_NOT_INITIALIZED });
      return;
    }
    railReadyPromise = createDynamicRailInitPromise(manager);
    globalThis.__NOTION_RAIL_READY__ = railReadyPromise;
  }

  await awaitReadyAndAct(railReadyPromise, onRailReady, sendResponse, options);
}
