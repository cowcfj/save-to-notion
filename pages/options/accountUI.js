/* global chrome */
import { BUILD_ENV } from '../../scripts/config/env/index.js';
import { UI_MESSAGES } from '../../scripts/config/shared/messages.js';
import { RUNTIME_ACTIONS } from '../../scripts/config/shared/runtimeActions.js';
import { buildAccountLoginStartUrl } from '../../scripts/auth/accountLogin.js';
import { resolveAccountDisplayProfile } from '../../scripts/utils/accountDisplayUtils.js';
import Logger from '../../scripts/utils/Logger.js';
import {
  getAccountAccessToken,
  getAccountProfile,
  clearAccountSession,
} from '../../scripts/auth/accountSession.js';
import { initCloudSyncController, showCloudSyncLoadingState } from './DriveCloudSyncController.js';

const UI_CLASS_STATUS_MSG = 'status-message';
const ACCOUNT_STATUS_SELECTOR = '#account-status';

function setElementHidden(element, hidden) {
  element?.classList.toggle('hidden', hidden);
}

function setOptionalTextContent(element, text) {
  if (element) {
    element.textContent = text;
  }
}

function showProfileAvatar(avatarImgEl, avatarFallbackEl, avatarUrl) {
  if (avatarImgEl) {
    avatarImgEl.src = avatarUrl;
    avatarImgEl.alt = UI_MESSAGES.ACCOUNT.AVATAR_ALT;
    avatarImgEl.classList.remove('hidden');
  }
  setElementHidden(avatarFallbackEl, true);
}

function showProfileAvatarFallback(avatarImgEl, avatarFallbackEl, avatarFallbackInitial) {
  if (avatarImgEl) {
    avatarImgEl.removeAttribute('src');
  }
  setElementHidden(avatarImgEl, true);
  setOptionalTextContent(avatarFallbackEl, avatarFallbackInitial);
  setElementHidden(avatarFallbackEl, false);
}

/**
 * 更新 Profile DOM 的顯示內容
 *
 * @param {object|null} profile
 */
function updateProfileDOM(profile) {
  const nameEl = document.querySelector('#profile-display-name');
  const emailEl = document.querySelector('#profile-email');
  const avatarImgEl = document.querySelector('#profile-avatar-img');
  const avatarFallbackEl = document.querySelector('#profile-avatar-fallback');

  if (!profile) {
    return;
  }

  const { email, displayLabel, avatarFallbackInitial } = resolveAccountDisplayProfile(profile);

  setOptionalTextContent(nameEl, displayLabel);
  setOptionalTextContent(emailEl, email);

  if (profile.avatarUrl) {
    showProfileAvatar(avatarImgEl, avatarFallbackEl, profile.avatarUrl);
  } else {
    showProfileAvatarFallback(avatarImgEl, avatarFallbackEl, avatarFallbackInitial);
  }
}

/**
 * 更新進階功能卡片的鎖定狀態（僅管理 AI Assistance card）
 *
 * @param {boolean} isLocked
 */
function updateLockedFeatures(isLocked) {
  // Cloud Sync card 由 DriveCloudSyncController 管理，不在此處處理
  const aiCard = document.querySelector('#ai-assistant-card');

  if (!aiCard) {
    return;
  }

  aiCard.classList.toggle('locked-feature', isLocked);

  const lockedMsg = aiCard.querySelector('.locked-message');
  if (lockedMsg) {
    lockedMsg.textContent = isLocked
      ? UI_MESSAGES.ACCOUNT.LOCKED_LOGIN_REQUIRED
      : UI_MESSAGES.ACCOUNT.LOCKED_COMING_SOON;
  }
}

/**
 * 根據登入狀態切換元件顯示
 *
 * @param {boolean} isActive
 * @param {object|null} profile
 */
function updateAccountLoginState(isActive, profile) {
  const loggedOutEl = document.querySelector('#account-logged-out');
  const loggedInEl = document.querySelector('#account-logged-in');

  if (isActive) {
    setElementHidden(loggedOutEl, true);
    setElementHidden(loggedInEl, false);

    if (profile) {
      updateProfileDOM(profile);
    }
    updateLockedFeatures(false);
  } else {
    // 未登入狀態
    setElementHidden(loggedOutEl, false);
    setElementHidden(loggedInEl, true);

    updateLockedFeatures(true);
  }
}

/**
 * 更新狀態訊息
 *
 * @param {boolean} isTransientRefreshError
 */
function updateAccountStatusMessage(isTransientRefreshError) {
  const statusEl = document.querySelector(ACCOUNT_STATUS_SELECTOR);

  if (!statusEl) {
    return;
  }

  if (isTransientRefreshError) {
    statusEl.textContent = UI_MESSAGES.ACCOUNT.TRANSIENT_REFRESH_ERROR;
    statusEl.className = `${UI_CLASS_STATUS_MSG} error`;
  } else if (statusEl.textContent === UI_MESSAGES.ACCOUNT.TRANSIENT_REFRESH_ERROR) {
    statusEl.textContent = '';
    statusEl.className = UI_CLASS_STATUS_MSG;
  }
}

/**
 * 根據 storage 中的 account profile 更新 account card UI。
 * 可被 account_session_updated 、account_session_cleared 訊息以及 initAccountUI 呼叫。
 *
 * @returns {Promise<void>}
 */
export async function renderAccountUI() {
  const profile = await getAccountProfile();
  let accessToken = null;
  let isTransientRefreshError = false;

  try {
    accessToken = await getAccountAccessToken();
  } catch {
    // Transient refresh failure（network error / 5xx）— 有 profile 時保留 logged-in
    isTransientRefreshError = Boolean(profile);
  }

  const isLoggedIn = Boolean(profile && accessToken);
  const isActive = isLoggedIn || isTransientRefreshError;

  updateAccountLoginState(isActive, profile);
  updateAccountStatusMessage(isTransientRefreshError);

  await initCloudSyncController(isActive, {
    transientAuthError: isTransientRefreshError,
  });
}

/**
 * 當帳號功能被禁用時隱藏相關 UI
 *
 * @param {object} params
 * @param {Element} params.accountCard
 * @param {Element} params.advancedTab
 * @param {Element} params.advancedSection
 * @returns {boolean} 是否隱藏成功
 */
function hideAccountUIWhenDisabled({ accountCard, advancedTab, advancedSection }) {
  if (!BUILD_ENV.ENABLE_ACCOUNT) {
    accountCard.classList.add('hidden');
    if (advancedTab) {
      advancedTab.classList.add('hidden');
    }
    if (advancedSection) {
      advancedSection.classList.add('hidden');
    }
    return true;
  }
  return false;
}

/**
 * 顯示帳號卡片
 *
 * @param {Element} accountCard
 */
function showAccountCard(accountCard) {
  accountCard.classList.remove('hidden');
}

/**
 * 設定帳號狀態訊息與樣式
 *
 * @param {Element} statusEl
 * @param {string} message
 * @param {string} type - 'success' | 'error' | ''
 */
function setAccountStatus(statusEl, message, type) {
  if (!statusEl) {
    return;
  }
  statusEl.textContent = message;
  statusEl.className = type ? `${UI_CLASS_STATUS_MSG} ${type}` : UI_CLASS_STATUS_MSG;
}

/**
 * 延遲清除帳號狀態訊息
 *
 * @param {Element} statusEl
 * @param {number} [timeoutMs=3000]
 */
function clearAccountStatusLater(statusEl, timeoutMs = 3000) {
  if (!statusEl) {
    return;
  }
  setTimeout(() => {
    setAccountStatus(statusEl, '', '');
  }, timeoutMs);
}

/**
 * 綁定登入按鈕事件
 */
function bindAccountLoginButton() {
  const loginBtn = document.querySelector('#account-login-button');
  if (!loginBtn) {
    return;
  }

  loginBtn.addEventListener('click', () => {
    const statusEl = document.querySelector(ACCOUNT_STATUS_SELECTOR);
    const startUrlResult = buildAccountLoginStartUrl();
    if (!startUrlResult.success) {
      const errorMessage = 'Account login failed';
      Logger.error(errorMessage, {
        action: 'initAccountUI',
        result: startUrlResult.result || 'failed',
        reason: startUrlResult.reason,
      });
      setAccountStatus(statusEl, startUrlResult.error, 'error');
      return;
    }
    chrome.tabs.create({ url: startUrlResult.url });
  });
}

/**
 * 綁定登出按鈕事件
 */
function bindAccountLogoutButton() {
  const logoutBtn = document.querySelector('#account-logout-button');
  if (!logoutBtn) {
    return;
  }

  logoutBtn.addEventListener('click', async () => {
    const statusEl = document.querySelector(ACCOUNT_STATUS_SELECTOR);
    try {
      await clearAccountSession();
      chrome.runtime
        .sendMessage({
          action: RUNTIME_ACTIONS.ACCOUNT_SESSION_CLEARED,
        })
        .catch(() => {});
      await renderAccountUI();
      setAccountStatus(statusEl, UI_MESSAGES.ACCOUNT.LOGOUT_SUCCESS, 'success');
      clearAccountStatusLater(statusEl, 3000);
    } catch (error) {
      Logger.error('Account logout failed', { action: 'logout', result: 'failure', error });
      setAccountStatus(statusEl, UI_MESSAGES.ACCOUNT.LOGOUT_FAILED, 'error');
    }
  });
}

/**
 * 初始化 account UI。
 *
 * - 若 BUILD_ENV.ENABLE_ACCOUNT === false，隱藏整個 advanced tab 與對應 section
 * - 設置登入 / 登出按鈕的事件監聽
 * - 讀取目前登入狀態並更新 UI
 */
export function initAccountUI() {
  const accountCard = document.querySelector('#account-card');
  const advancedTab = document.querySelector('#tab-advanced');
  const advancedSection = document.querySelector('#section-advanced');

  if (!accountCard) {
    return;
  }

  // feature flag 檢查與隱藏
  if (hideAccountUIWhenDisabled({ accountCard, advancedTab, advancedSection })) {
    return;
  }

  // 顯示 account card
  showAccountCard(accountCard);

  // 綁定按鈕
  bindAccountLoginButton();
  bindAccountLogoutButton();

  showCloudSyncLoadingState(UI_MESSAGES.CLOUD_SYNC.LOADING_ACCOUNT_STATUS);

  // 讀取目前登入狀態
  renderAccountUI().catch(() => {});
}
