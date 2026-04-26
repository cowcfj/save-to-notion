/* global chrome */

import { ACCOUNT_API } from '../config/extension/accountApi.js';
import { BUILD_ENV } from '../config/env/index.js';

const ACCOUNT_LOGIN_GENERIC_ERROR = '登入設定異常，請稍後再試';

/**
 * 建立 account Google login start URL。
 *
 * @returns {{ success: true, url: string } | { success: false, error: string, reason: 'missing_base_url'|'invalid_base_url' }}
 */
export function buildAccountLoginStartUrl() {
  const baseUrl = BUILD_ENV.OAUTH_SERVER_URL;
  if (!baseUrl) {
    return {
      success: false,
      error: ACCOUNT_LOGIN_GENERIC_ERROR,
      reason: 'missing_base_url',
    };
  }

  let startUrl;

  try {
    startUrl = new URL(ACCOUNT_API.GOOGLE_START, baseUrl);
  } catch {
    return {
      success: false,
      error: ACCOUNT_LOGIN_GENERIC_ERROR,
      reason: 'invalid_base_url',
    };
  }

  startUrl.searchParams.set('ext_id', chrome.runtime.id);
  startUrl.searchParams.set('callback_mode', 'bridge');

  return { success: true, url: startUrl.toString() };
}

/**
 * 取得 options advanced section deep link。
 *
 * @returns {string}
 */
export function getOptionsAdvancedUrl() {
  return chrome.runtime.getURL('options/options.html?section=advanced');
}
