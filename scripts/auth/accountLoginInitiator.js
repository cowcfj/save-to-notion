/**
 * Account Login Initiator
 *
 * 抽自 popup/popupActions.js 的 startAccountLogin，作為 onboarding 與 popup 共用入口。
 * 純粹的 trigger module，不涉及 UI 狀態管理。
 */

/* global chrome */

import Logger from '../utils/Logger.js';
import { UI_MESSAGES } from '../config/shared/messages.js';
import { buildAccountLoginStartUrl } from './accountLogin.js';

/**
 * 啟動 account Google login flow。
 *
 * 構建 worker login URL 並以新 tab 開啟，由 worker callback bridge 與
 * scripts/background/handlers/accountAuthHandler.js 處理後續 ticket → auth.html 重導。
 *
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function startAccountLogin() {
  const startUrlResult = buildAccountLoginStartUrl();
  if (!startUrlResult.success) {
    return { success: false, error: startUrlResult.error };
  }

  try {
    await chrome.tabs.create({ url: startUrlResult.url });
    return { success: true };
  } catch (error) {
    Logger.warn('startAccountLogin failed', {
      action: 'startAccountLogin',
      error,
    });
    return { success: false, error: UI_MESSAGES.ACCOUNT.LOGIN_PAGE_OPEN_FAILED };
  }
}
