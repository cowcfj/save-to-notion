/* global chrome */

import { ACCOUNT_API } from '../config/extension/accountApi.js';
import { BUILD_ENV } from '../config/env/index.js';

const ACCOUNT_LOGIN_GENERIC_ERROR = '登入設定異常，請稍後再試';

function removeTrailingSlashes(value) {
  let endIndex = value.length;
  while (endIndex > 0 && value[endIndex - 1] === '/') {
    endIndex -= 1;
  }
  return value.slice(0, endIndex);
}

function removeLeadingSlashes(value) {
  let startIndex = 0;
  while (startIndex < value.length && value[startIndex] === '/') {
    startIndex += 1;
  }
  return value.slice(startIndex);
}

/**
 * 建立 account API URL，保留 OAUTH_SERVER_URL 可能包含的 path prefix。
 *
 * @param {string} baseUrl
 * @param {string} endpointPath
 * @returns {string}
 * @throws {Error} OAUTH_SERVER_URL 缺失或格式無效
 */
export function buildAccountApiUrl(baseUrl, endpointPath) {
  if (typeof baseUrl !== 'string' || !baseUrl.trim()) {
    throw new Error('OAUTH_SERVER_URL is required');
  }

  let parsedBaseUrl;
  try {
    parsedBaseUrl = new URL(baseUrl.trim());
  } catch {
    throw new Error('Invalid OAUTH_SERVER_URL: must be an absolute URL');
  }

  if (parsedBaseUrl.search || parsedBaseUrl.hash) {
    throw new Error('Invalid OAUTH_SERVER_URL: must not include query or hash');
  }

  const normalizedBaseUrl = removeTrailingSlashes(parsedBaseUrl.toString());
  const normalizedEndpointPath = removeLeadingSlashes(String(endpointPath));
  return `${normalizedBaseUrl}/${normalizedEndpointPath}`;
}

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
    startUrl = new URL(buildAccountApiUrl(baseUrl, ACCOUNT_API.GOOGLE_START));
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
