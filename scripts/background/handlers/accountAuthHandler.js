/* global chrome, Logger */

import { ACCOUNT_API } from '../../config/extension/accountApi.js';
import { BUILD_ENV } from '../../config/env/index.js';
import { sanitizeApiError } from '../../utils/ApiErrorSanitizer.js';

function resolveBridgeOrigin(oauthServerUrl) {
  if (typeof oauthServerUrl !== 'string' || !oauthServerUrl.trim()) {
    return '';
  }

  try {
    return new URL(oauthServerUrl).origin;
  } catch {
    return '';
  }
}

function parseUrl(rawUrl) {
  try {
    return new URL(rawUrl);
  } catch {
    return null;
  }
}

function isCallbackBridgeUrl(parsedUrl, bridgeOrigin, bridgePath) {
  return parsedUrl.origin === bridgeOrigin && parsedUrl.pathname === bridgePath;
}

function extractAccountTicket(parsedUrl, runtimeId) {
  const accountTicket = parsedUrl.searchParams.get('account_ticket');
  const extensionId = parsedUrl.searchParams.get('ext_id');

  if (!accountTicket) {
    return null;
  }

  if (extensionId !== runtimeId) {
    return null;
  }

  return accountTicket;
}

function parseBridgeUrl(rawUrl, { bridgeOrigin, bridgePath, runtimeId }) {
  if (!bridgeOrigin) {
    return null;
  }

  const parsedUrl = parseUrl(rawUrl);
  if (!parsedUrl) {
    return null;
  }

  if (!isCallbackBridgeUrl(parsedUrl, bridgeOrigin, bridgePath)) {
    return null;
  }

  const accountTicket = extractAccountTicket(parsedUrl, runtimeId);
  return accountTicket ? { accountTicket } : null;
}

function shouldProcessBridgeUrl(processedBridgeUrlsByTab, tabId, rawUrl) {
  const previousUrl = processedBridgeUrlsByTab.get(tabId);
  if (previousUrl === rawUrl) {
    return false;
  }

  if (previousUrl) {
    processedBridgeUrlsByTab.delete(tabId);
  }

  return true;
}

function buildAuthUrl(runtime, accountTicket) {
  return runtime.getURL(`pages/auth/auth.html?account_ticket=${encodeURIComponent(accountTicket)}`);
}

function resolveBridgeMatch({
  rawUrl,
  processedBridgeUrlsByTab,
  tabId,
  bridgeOrigin,
  bridgePath,
  runtimeId,
}) {
  if (!rawUrl) {
    return null;
  }

  if (!shouldProcessBridgeUrl(processedBridgeUrlsByTab, tabId, rawUrl)) {
    return null;
  }

  return parseBridgeUrl(rawUrl, {
    bridgeOrigin,
    bridgePath,
    runtimeId,
  });
}

function logRedirectFailure({ logger, tabId, error }) {
  const safeError = sanitizeApiError(error, 'handle_account_callback_bridge');
  logger?.warn?.('Account callback bridge 導向失敗', {
    action: 'handleAccountCallbackBridge',
    tabId,
    error: safeError,
  });
}

async function handleAccountBridgeTabUpdate({
  tabId,
  changeInfo,
  bridgeOrigin,
  bridgePath,
  runtime,
  tabs,
  logger,
  processedBridgeUrlsByTab,
}) {
  const rawUrl = changeInfo?.url;
  const match = resolveBridgeMatch({
    rawUrl,
    processedBridgeUrlsByTab,
    tabId,
    bridgeOrigin,
    bridgePath,
    runtimeId: runtime.id,
  });

  if (!match) {
    return;
  }

  processedBridgeUrlsByTab.set(tabId, rawUrl);

  try {
    const authUrl = buildAuthUrl(runtime, match.accountTicket);
    await tabs.update(tabId, { url: authUrl });
  } catch (error) {
    processedBridgeUrlsByTab.delete(tabId);
    logRedirectFailure({ logger, tabId, error });
  }
}

function createAccountBridgeController({ bridgeOrigin, bridgePath, runtime, tabs, logger }) {
  const processedBridgeUrlsByTab = new Map();

  function handleTabUpdated(tabId, changeInfo) {
    return handleAccountBridgeTabUpdate({
      tabId,
      changeInfo,
      bridgeOrigin,
      bridgePath,
      runtime,
      tabs,
      logger,
      processedBridgeUrlsByTab,
    });
  }

  function handleTabRemoved(tabId) {
    processedBridgeUrlsByTab.delete(tabId);
  }

  function setupListeners() {
    tabs.onUpdated.addListener(handleTabUpdated);
    tabs.onRemoved.addListener(handleTabRemoved);
  }

  return {
    setupListeners,
    handleTabUpdated,
    handleTabRemoved,
  };
}

/**
 * 建立 account callback bridge handler。
 *
 * 負責攔截 Worker callback bridge URL，並由 extension 主動導回 canonical auth page，
 * 避免由 web page 直接跨 scheme redirect 到 chrome-extension://。
 *
 * @param {object} [dependencies]
 * @param {string} [dependencies.oauthServerUrl]
 * @param {string} [dependencies.bridgePath]
 * @param {{id: string, getURL: (path: string) => string}} [dependencies.runtime]
 * @param {{
 *   update: (tabId: number, updateProperties: {url: string}) => Promise<unknown>,
 *   onUpdated: { addListener: (listener: Function) => void },
 *   onRemoved: { addListener: (listener: Function) => void }
 * }} [dependencies.tabs]
 * @param {{warn?: Function}} [dependencies.logger]
 * @returns {{
 *   setupListeners: () => void,
 *   handleTabUpdated: (tabId: number, changeInfo: {url?: string}) => Promise<void>,
 *   handleTabRemoved: (tabId: number) => void
 * }}
 */
export function createAccountAuthHandler(dependencies) {
  const options = {
    oauthServerUrl: BUILD_ENV.OAUTH_SERVER_URL,
    bridgePath: ACCOUNT_API.CALLBACK_BRIDGE,
    runtime: chrome.runtime,
    tabs: chrome.tabs,
    logger: Logger,
    ...dependencies,
  };

  const bridgeOrigin = resolveBridgeOrigin(options.oauthServerUrl);
  return createAccountBridgeController({ ...options, bridgeOrigin });
}
