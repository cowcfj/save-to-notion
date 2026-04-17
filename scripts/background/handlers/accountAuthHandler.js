/* global chrome, Logger */

import { ACCOUNT_API } from '../../config/api.js';
import { BUILD_ENV } from '../../config/env.js';
import { sanitizeApiError } from '../../utils/securityUtils.js';

/**
 * 建立 account callback bridge handler。
 *
 * 負責攔截 Worker callback bridge URL，並由 extension 主動導回 auth.html，
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
export function createAccountAuthHandler(dependencies = {}) {
  const {
    oauthServerUrl = BUILD_ENV.OAUTH_SERVER_URL,
    bridgePath = ACCOUNT_API.CALLBACK_BRIDGE,
    runtime = chrome.runtime,
    tabs = chrome.tabs,
    logger = Logger,
  } = dependencies;

  let bridgeOrigin = '';

  if (typeof oauthServerUrl === 'string' && oauthServerUrl.trim()) {
    try {
      bridgeOrigin = new URL(oauthServerUrl).origin;
    } catch {
      bridgeOrigin = '';
    }
  }
  const processedBridgeUrlsByTab = new Map();

  /**
   * 解析並驗證 callback bridge URL。
   *
   * @param {string} rawUrl
   * @returns {{ accountTicket: string } | null}
   */
  function parseBridgeUrl(rawUrl) {
    if (!bridgeOrigin) {
      return null;
    }

    let parsedUrl;

    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      return null;
    }

    if (parsedUrl.origin !== bridgeOrigin || parsedUrl.pathname !== bridgePath) {
      return null;
    }

    const accountTicket = parsedUrl.searchParams.get('account_ticket');
    const extensionId = parsedUrl.searchParams.get('ext_id');

    if (!accountTicket || !extensionId || extensionId !== runtime.id) {
      return null;
    }

    return { accountTicket };
  }

  /**
   * 攔截符合條件的 bridge URL，並導向 auth.html。
   *
   * @param {number} tabId
   * @param {{ url?: string }} changeInfo
   * @returns {Promise<void>}
   */
  async function handleTabUpdated(tabId, changeInfo) {
    const rawUrl = changeInfo?.url;
    if (!rawUrl) {
      return;
    }

    const previousUrl = processedBridgeUrlsByTab.get(tabId);
    if (previousUrl === rawUrl) {
      return;
    }
    if (previousUrl && previousUrl !== rawUrl) {
      processedBridgeUrlsByTab.delete(tabId);
    }

    const match = parseBridgeUrl(rawUrl);
    if (!match) {
      return;
    }

    processedBridgeUrlsByTab.set(tabId, rawUrl);

    try {
      const authUrl = runtime.getURL(`auth.html?account_ticket=${match.accountTicket}`);
      await tabs.update(tabId, { url: authUrl });
    } catch (error) {
      processedBridgeUrlsByTab.delete(tabId);
      const safeError = sanitizeApiError(error, 'handle_account_callback_bridge');
      logger?.warn?.('Account callback bridge 導向失敗', {
        action: 'handleAccountCallbackBridge',
        tabId,
        error: safeError,
      });
    }
  }

  /**
   * tab 關閉時清理去重狀態。
   *
   * @param {number} tabId
   */
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
