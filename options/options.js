/* global chrome */
import { UIManager } from './UIManager.js';
import { AuthManager } from './AuthManager.js';
import { DataSourceManager } from './DataSourceManager.js';
import { StorageManager } from './StorageManager.js';
import { MigrationTool } from './MigrationTool.js';
import { AuthMode } from '../scripts/config/extension/authMode.js';
import { BUILD_ENV } from '../scripts/config/env/index.js';
import { UI_MESSAGES, ERROR_MESSAGES } from '../scripts/config/shared/messages.js';
import { UI_ICONS } from '../scripts/config/icons.js';
import { RUNTIME_ACTIONS } from '../scripts/config/shared/runtimeActions.js';
import { buildAccountLoginStartUrl } from '../scripts/auth/accountLogin.js';
import { resolveAccountDisplayProfile } from '../scripts/utils/accountDisplayUtils.js';
import { injectIcons } from '../scripts/utils/uiUtils.js';
import Logger from '../scripts/utils/Logger.js';

import { sanitizeApiError, validateLogExportData } from '../scripts/utils/securityUtils.js';
import { ErrorHandler, ErrorTypes } from '../scripts/utils/ErrorHandler.js';
import { DATA_SOURCE_KEYS } from '../scripts/config/shared/storage.js';
import {
  getAccountAccessToken,
  getAccountProfile,
  clearAccountSession,
} from '../scripts/auth/accountSession.js';
import {
  initCloudSyncController,
  refreshCloudSyncCard,
  showCloudSyncLoadingState,
} from './DriveCloudSyncController.js';
import {
  AccountGatedDestinationEntitlementProvider,
  LocalDestinationProfileRepository,
} from '../scripts/destinations/ProfileStore.js';
import { ProfileManager } from '../scripts/destinations/ProfileManager.js';

const UI_CLASS_STATUS_MSG = 'status-message';
const DESTINATION_PROFILE_NAME_MAX_LENGTH = 40;
const DESTINATION_PROFILE_NAME_EDIT_ROLE = 'destination-profile-name-edit';
const DESTINATION_PROFILE_ACTIONS = {
  RENAME: 'rename',
  CANCEL_NAME: 'cancel-name',
  SAVE_NAME: 'save-name',
  EDIT: 'edit',
  DELETE: 'delete',
};
const DESTINATION_TARGET_FIELD_SELECTORS = {
  ID: '#database-id',
  TYPE: '#database-type',
};
const BUTTON_SECONDARY_CLASS = 'btn-secondary';
const DEFAULT_DESTINATION_ENTITLEMENT = {
  maxProfiles: 1,
  accountSignedIn: false,
  source: 'fallback',
};
let destinationProfilesUIController = null;

function normalizeDestinationProfileName(value) {
  return typeof value === 'string'
    ? value.trim().slice(0, DESTINATION_PROFILE_NAME_MAX_LENGTH)
    : '';
}

function createDestinationProfileService() {
  return new ProfileManager({
    repository: new LocalDestinationProfileRepository(),
    entitlementProvider: new AccountGatedDestinationEntitlementProvider(),
  });
}

function activateSidebarSection(sectionName, navItems, sections) {
  const targetSectionId = `section-${sectionName}`;
  const targetItem = Array.from(navItems).find(item => item.dataset.section === sectionName);
  const targetExists = Array.from(sections).some(section => section.id === targetSectionId);

  if (!targetItem || !targetExists) {
    return false;
  }

  navItems.forEach(nav => {
    nav.classList.remove('active');
    nav.setAttribute('aria-selected', 'false');
  });
  targetItem.classList.add('active');
  targetItem.setAttribute('aria-selected', 'true');

  sections.forEach(section => {
    if (section.id === targetSectionId) {
      section.classList.add('active');
      section.setAttribute('aria-hidden', 'false');
    } else {
      section.classList.remove('active');
      section.setAttribute('aria-hidden', 'true');
    }
  });

  return true;
}

/**
 * Options Page Main Controller
 * 負責協調各个模組，處理全域事件與設置保存
 */
export function initOptions() {
  // 1. 初始化各管理器
  injectIcons(UI_ICONS); // Inject SVG sprites (Shared System)
  const ui = new UIManager();

  const auth = new AuthManager(ui);
  const dataSource = new DataSourceManager(ui, async () => {
    const activeAuth = await AuthManager.getActiveNotionToken();
    if (activeAuth?.token) {
      return activeAuth.token;
    }
    return document.querySelector('#api-key')?.value || '';
  });
  const storage = new StorageManager(ui);
  const migration = new MigrationTool(ui);

  // 2. 注入依賴並啟動
  ui.init();

  // OAuth 功能開關：OSS 版本隱藏 OAuth UI
  if (!BUILD_ENV.ENABLE_OAUTH) {
    const oauthConnectBtn = document.querySelector('#oauth-connect-button');
    const oauthDisconnectBtn = document.querySelector('#oauth-disconnect-button');
    if (oauthConnectBtn) {
      oauthConnectBtn.style.display = 'none';
    }
    if (oauthDisconnectBtn) {
      oauthDisconnectBtn.style.display = 'none';
    }
  }

  // AuthManager 需要 DataSourceManager 來載入資料來源列表
  auth.init({
    loadDataSources: dataSource.loadDataSources.bind(dataSource),
  });

  dataSource.init();
  storage.init();
  migration.init();
  initDestinationProfilesUI(ui).catch(error => {
    const safeError = sanitizeApiError(error, 'initDestinationProfilesUI');
    Logger.warn('初始化保存目標 UI 失敗', {
      action: 'initDestinationProfilesUI',
      error: safeError,
    });
  });

  // 3. 初始狀態檢查
  auth.checkAuthStatus();

  // 4. 全域事件監聽：OAuth 回調
  chrome.runtime.onMessage.addListener(request => {
    switch (request.action) {
      case RUNTIME_ACTIONS.OAUTH_SUCCESS: {
        auth.checkAuthStatus();
        ui.showStatus(UI_MESSAGES.AUTH.NOTIFY_SUCCESS, 'success');
        break;
      }
      case RUNTIME_ACTIONS.OAUTH_FAILED: {
        ui.showStatus(UI_MESSAGES.AUTH.NOTIFY_ERROR, 'error');
        break;
      }
      case RUNTIME_ACTIONS.ACCOUNT_SESSION_UPDATED:
      case RUNTIME_ACTIONS.ACCOUNT_SESSION_CLEARED: {
        // account session 已更新或清除，重新讀取 profile 刷新 UI
        renderAccountUI().catch(() => {});
        initDestinationProfilesUI(ui).catch(error => {
          const safeError = sanitizeApiError(error, 'initDestinationProfilesUI');
          Logger.warn('初始化保存目標 UI 失敗', {
            action: 'initDestinationProfilesUI',
            error: safeError,
          });
        });
        break;
      }
      case RUNTIME_ACTIONS.DRIVE_SYNC_STATUS_UPDATED: {
        // Drive 同步狀態已更新，刷新 Cloud Sync card
        refreshCloudSyncCard().catch(() => {});
        break;
      }
      default: {
        break;
      }
    }
  });

  // 4.1 初始化 account UI（與 Notion OAuth UI 完整分開）
  initAccountUI();

  // 5. 全域事件監聽：儲存使用量更新 (由 MigrationTool 觸發)
  document.addEventListener('storageUsageUpdate', () => {
    storage.updateStorageUsage();
  });

  // 6. 保存設置邏輯
  const saveButton = document.querySelector('#save-button');
  if (saveButton) {
    saveButton.addEventListener('click', () => saveSettings(ui, auth, 'status'));
  }

  const saveTemplatesButton = document.querySelector('#save-templates-button');
  if (saveTemplatesButton) {
    saveTemplatesButton.addEventListener('click', () => saveSettings(ui, auth, 'template-status'));
  }

  // 7. 標題模板預覽邏輯
  setupTemplatePreview();

  // 8. 側邊欄導航邏輯
  setupSidebarNavigation();

  // 9. 顯示動態版本號
  displayAppVersion();

  // 10. 設置日誌導出
  setupLogExport();

  // 11. 初始化介面縮放
  const zoomSelect = document.querySelector('#ui-zoom-level');
  if (zoomSelect) {
    // 讀取設定
    chrome.storage.sync.get(['uiZoomLevel'], result => {
      const zoom = String(result.uiZoomLevel || '1');
      document.body.style.zoom = zoom;
      zoomSelect.value = zoom;
    });

    // 即時預覽
    zoomSelect.addEventListener('change', () => {
      document.body.style.zoom = zoomSelect.value;
    });
  }

  // 12. 初始化 Notion 同步樣式選單
  const highlightContentStyleSelect = document.querySelector('#highlight-content-style');
  if (highlightContentStyleSelect) {
    chrome.storage.sync.get({ highlightContentStyle: 'COLOR_SYNC' }, result => {
      highlightContentStyleSelect.value = result.highlightContentStyle;
    });
  }
}

async function initDestinationProfilesUI(ui) {
  const list = document.querySelector('#destination-profile-list');
  const addButton = document.querySelector('#add-destination-profile');
  const status = document.querySelector('#destination-profile-status');
  const nameInput = document.querySelector('#destination-profile-name');
  if (!list || !addButton) {
    return;
  }

  if (
    destinationProfilesUIController?.list === list &&
    destinationProfilesUIController?.addButton === addButton
  ) {
    await destinationProfilesUIController.render();
    return;
  }

  const service = createDestinationProfileService();
  let editingProfileId = null;
  let draftProfileName = '';
  let cachedProfiles = [];

  addButton.setAttribute('aria-describedby', 'destination-profile-status');

  const showNameError = () => {
    ui.showStatus('保存目標名稱不可為空白。', 'error');
  };

  const createDestinationActionButton = ({
    action,
    profileId,
    text,
    className = BUTTON_SECONDARY_CLASS,
  }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.dataset.action = action;
    button.dataset.profileId = profileId;
    button.textContent = text;
    return button;
  };

  const renderProfileContent = profile => {
    const content = document.createElement('div');
    if (editingProfileId === profile.id) {
      const titleEdit = document.createElement('div');
      titleEdit.className = 'destination-profile-name-edit';
      const titleInput = document.createElement('input');
      titleInput.type = 'text';
      titleInput.className = 'destination-profile-name-input';
      titleInput.dataset.role = DESTINATION_PROFILE_NAME_EDIT_ROLE;
      titleInput.value = draftProfileName || profile.name || '預設';
      titleInput.maxLength = DESTINATION_PROFILE_NAME_MAX_LENGTH;
      titleInput.setAttribute('aria-label', '保存目標名稱');
      titleEdit.append(titleInput);
      content.append(titleEdit);
    } else {
      const title = document.createElement('p');
      title.className = 'destination-profile-title';
      title.textContent = profile.name || '預設';
      content.append(title);
    }
    const meta = document.createElement('p');
    meta.className = 'destination-profile-meta';
    meta.textContent = `${profile.notionDataSourceType} · ${profile.notionDataSourceId}`;
    content.append(meta);
    return content;
  };

  const renderProfileActions = (profile, canDeleteProfile) => {
    const actions = document.createElement('div');
    actions.className = 'destination-profile-actions';
    if (editingProfileId === profile.id) {
      actions.append(
        createDestinationActionButton({
          action: DESTINATION_PROFILE_ACTIONS.SAVE_NAME,
          profileId: profile.id,
          text: '儲存',
        }),
        createDestinationActionButton({
          action: DESTINATION_PROFILE_ACTIONS.CANCEL_NAME,
          profileId: profile.id,
          text: '取消',
        })
      );
      return actions;
    }

    actions.append(
      createDestinationActionButton({
        action: DESTINATION_PROFILE_ACTIONS.RENAME,
        profileId: profile.id,
        text: '重新命名',
      }),
      createDestinationActionButton({
        action: DESTINATION_PROFILE_ACTIONS.EDIT,
        profileId: profile.id,
        text: '套用',
      })
    );

    if (canDeleteProfile) {
      actions.append(
        createDestinationActionButton({
          action: DESTINATION_PROFILE_ACTIONS.DELETE,
          profileId: profile.id,
          text: '刪除',
          className: 'btn-danger',
        })
      );
    }
    return actions;
  };

  const updateDestinationLimitState = (profiles, entitlement) => {
    const limitReached = profiles.length >= entitlement.maxProfiles;
    addButton.disabled = limitReached;
    if (!status) {
      return;
    }
    let limitMessage = '';
    if (limitReached && entitlement.maxProfiles <= 1) {
      limitMessage = '登入帳號後可建立第二個保存目標。';
    } else if (limitReached) {
      limitMessage = '更多保存目標會在付費方案開放。';
    }
    status.textContent = limitMessage;
    addButton.title = limitMessage;
  };

  const render = async () => {
    let profiles = cachedProfiles;
    let entitlement = DEFAULT_DESTINATION_ENTITLEMENT;

    try {
      profiles = await service.listProfiles();
      cachedProfiles = profiles;
    } catch (error) {
      const safeError = sanitizeApiError(error, 'destinationProfileList');
      Logger.warn('讀取保存目標列表失敗', {
        action: 'renderDestinationProfiles',
        error: safeError,
      });
    }

    try {
      entitlement = await service.getDestinationEntitlement();
    } catch (error) {
      const safeError = sanitizeApiError(error, 'destinationProfileEntitlement');
      Logger.warn('讀取保存目標權限失敗', {
        action: 'renderDestinationProfiles',
        error: safeError,
      });
    }

    list.innerHTML = '';

    for (const profile of profiles) {
      const row = document.createElement('div');
      row.className = 'destination-profile-row';
      row.style.borderLeftColor = profile.color || '#2563eb';

      const canDeleteProfile = profiles.length > 1;
      const content = renderProfileContent(profile);
      const actions = renderProfileActions(profile, canDeleteProfile);

      row.append(content, actions);
      list.append(row);
    }

    updateDestinationLimitState(profiles, entitlement);
  };

  list.addEventListener('click', async event => {
    try {
      const button = event.target?.closest?.('button[data-action]');
      if (!button) {
        return;
      }
      const profileId = button.dataset.profileId;
      const action = button.dataset.action;
      if (action === DESTINATION_PROFILE_ACTIONS.RENAME) {
        const profile = await service.getProfile(profileId);
        editingProfileId = profile.id;
        draftProfileName = profile.name || '預設';
        await render();
        list.querySelector(`input[data-role="${DESTINATION_PROFILE_NAME_EDIT_ROLE}"]`)?.focus?.();
        return;
      }
      if (action === DESTINATION_PROFILE_ACTIONS.CANCEL_NAME) {
        editingProfileId = null;
        draftProfileName = '';
        await render();
        return;
      }
      if (action === DESTINATION_PROFILE_ACTIONS.SAVE_NAME) {
        const input = list.querySelector(
          `input[data-role="${DESTINATION_PROFILE_NAME_EDIT_ROLE}"]`
        );
        const nextName = normalizeDestinationProfileName(input?.value || '');
        if (!nextName) {
          showNameError();
          return;
        }
        await service.updateProfile(profileId, { name: nextName });
        editingProfileId = null;
        draftProfileName = '';
        await render();
        return;
      }
      if (action === DESTINATION_PROFILE_ACTIONS.EDIT) {
        const profile = await service.getProfile(profileId);
        document.querySelector(DESTINATION_TARGET_FIELD_SELECTORS.ID).value =
          profile.notionDataSourceId;
        document.querySelector(DESTINATION_TARGET_FIELD_SELECTORS.TYPE).value =
          profile.notionDataSourceType;
        ui.showStatus(`已套用 ${profile.name} 到編輯欄位`, 'info');
        return;
      }
      if (action === DESTINATION_PROFILE_ACTIONS.DELETE) {
        await service.deleteProfile(profileId);
        await render();
      }
    } catch (error) {
      const safeError = sanitizeApiError(error, 'destinationProfileAction');
      Logger.warn('保存目標操作失敗', {
        action: 'destinationProfileAction',
        error: safeError,
      });
      ui.showStatus('保存目標操作失敗，請稍後再試。', 'error');
    }
  });

  addButton.addEventListener('click', async () => {
    try {
      const databaseId = cleanDatabaseId(
        document.querySelector(DESTINATION_TARGET_FIELD_SELECTORS.ID)?.value || ''
      );
      if (!databaseId) {
        ui.showStatus(UI_MESSAGES.SETTINGS.INVALID_ID, 'error');
        return;
      }
      const rawType = document.querySelector(DESTINATION_TARGET_FIELD_SELECTORS.TYPE)?.value;
      const explicitName = normalizeDestinationProfileName(nameInput?.value || '');
      await service.createProfile({
        name: explicitName || `保存目標 ${Date.now().toString().slice(-4)}`,
        notionDataSourceId: databaseId,
        notionDataSourceType: rawType === 'page' ? 'page' : 'database',
      });
      if (nameInput) {
        nameInput.value = '';
      }
      await render();
    } catch (error) {
      const safeError = sanitizeApiError(error, 'createDestinationProfile');
      Logger.warn('新增保存目標失敗', {
        action: 'createDestinationProfile',
        error: safeError,
      });
      const message =
        error?.message === '已達目的地數量上限'
          ? '已達目的地數量上限。'
          : '新增保存目標失敗，請稍後再試。';
      ui.showStatus(message, 'error');
    }
  });

  destinationProfilesUIController = { list, addButton, render };
  await service.ensureMigratedDefaultProfile();
  await render();
}

document.addEventListener('DOMContentLoaded', initOptions);

// =============================================================================
// Account UI（Cloudflare-native Google 帳號）
// 與既有 Notion OAuth UI 完整分開，禁止共用 DOM 或 storage
// =============================================================================

const ACCOUNT_STATUS_SELECTOR = '#account-status';

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

  if (nameEl) {
    nameEl.textContent = displayLabel;
  }
  if (emailEl) {
    emailEl.textContent = email;
  }

  if (profile.avatarUrl) {
    if (avatarImgEl) {
      avatarImgEl.src = profile.avatarUrl;
      avatarImgEl.alt = UI_MESSAGES.ACCOUNT.AVATAR_ALT;
      avatarImgEl.style.display = '';
    }
    if (avatarFallbackEl) {
      avatarFallbackEl.style.display = 'none';
    }
  } else {
    if (avatarImgEl) {
      avatarImgEl.removeAttribute('src');
      avatarImgEl.style.display = 'none';
    }
    if (avatarFallbackEl) {
      avatarFallbackEl.textContent = avatarFallbackInitial;
      avatarFallbackEl.style.display = 'flex';
    }
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
    if (loggedOutEl) {
      loggedOutEl.style.display = 'none';
    }
    if (loggedInEl) {
      loggedInEl.style.display = '';
    }

    if (profile) {
      updateProfileDOM(profile);
    }
    updateLockedFeatures(false);
  } else {
    // 未登入狀態
    if (loggedOutEl) {
      loggedOutEl.style.display = '';
    }
    if (loggedInEl) {
      loggedInEl.style.display = 'none';
    }

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
async function renderAccountUI() {
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
 * 初始化 account UI。
 *
 * - 若 BUILD_ENV.ENABLE_ACCOUNT === false，隱藏整個 advanced tab 與對應 section
 * - 設置登入 / 登出按鈕的事件監聽
 * - 讀取目前登入狀態並更新 UI
 */
function initAccountUI() {
  const accountCard = document.querySelector('#account-card');
  const advancedTab = document.querySelector('#tab-advanced');
  const advancedSection = document.querySelector('#section-advanced');

  if (!accountCard) {
    return;
  }

  // feature flag 檢查
  if (!BUILD_ENV.ENABLE_ACCOUNT) {
    accountCard.style.display = 'none';
    if (advancedTab) {
      advancedTab.style.display = 'none';
    }
    if (advancedSection) {
      advancedSection.style.display = 'none';
    }
    return;
  }

  // 顯示 account card
  accountCard.style.display = '';

  // 登入按鈕：開新 tab 到 /v1/account/google/start?ext_id=<chrome.runtime.id>
  const loginBtn = document.querySelector('#account-login-button');
  if (loginBtn) {
    loginBtn.addEventListener('click', () => {
      const statusEl = document.querySelector(ACCOUNT_STATUS_SELECTOR);
      const startUrlResult = buildAccountLoginStartUrl();
      if (!startUrlResult.success) {
        const errorMessage = 'Account login failed';
        Logger.error(errorMessage, {
          action: 'initAccountUI',
          reason: startUrlResult.reason,
        });
        if (statusEl) {
          statusEl.textContent = startUrlResult.error;
          statusEl.className = `${UI_CLASS_STATUS_MSG} error`;
        }
        return;
      }
      chrome.tabs.create({ url: startUrlResult.url });
    });
  }

  // 登出按鈕：local-only clear
  const logoutBtn = document.querySelector('#account-logout-button');
  if (logoutBtn) {
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
        if (statusEl) {
          statusEl.textContent = '已成功登出';
          statusEl.className = `${UI_CLASS_STATUS_MSG} success`;
          setTimeout(() => {
            statusEl.textContent = '';
            statusEl.className = UI_CLASS_STATUS_MSG;
          }, 3000);
        }
      } catch (error) {
        Logger.error('Account logout failed', { error });
        if (statusEl) {
          statusEl.textContent = '登出失敗，請重試';
          statusEl.className = `${UI_CLASS_STATUS_MSG} error`;
        }
      }
    });
  }

  showCloudSyncLoadingState(UI_MESSAGES.CLOUD_SYNC.LOADING_ACCOUNT_STATUS);

  // 讀取目前登入狀態
  renderAccountUI().catch(() => {});
}

/**
 * 設置側邊欄導航
 */
function setupSidebarNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const sections = document.querySelectorAll('.settings-section');

  if (navItems.length === 0 || sections.length === 0) {
    Logger.warn(ERROR_MESSAGES.TECHNICAL.NAV_MISSING_ITEMS, {
      action: 'setupSidebarNavigation',
      reason: 'missing_dom_elements',
    });
    return;
  }

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const sectionName = item.dataset.section;
      if (!sectionName) {
        Logger.warn(ERROR_MESSAGES.TECHNICAL.NAV_MISSING_ATTR, {
          action: 'setupSidebarNavigation',
          tagName: item.tagName,
          targetId: item.id || null,
          sectionName: item.dataset?.section || null,
        });
        return;
      }

      const targetSectionId = `section-${sectionName}`;
      // 驗證目標區塊是否存在
      const targetExists = Array.from(sections).some(section => section.id === targetSectionId);

      if (!targetExists) {
        Logger.warn(ERROR_MESSAGES.TECHNICAL.NAV_TARGET_NOT_FOUND, {
          action: 'setupSidebarNavigation',
          targetId: targetSectionId,
        });
        return;
      }

      activateSidebarSection(sectionName, navItems, sections);
    });
  });

  const initialSection = new URLSearchParams(globalThis.location.search).get('section');
  if (initialSection && !activateSidebarSection(initialSection, navItems, sections)) {
    Logger.warn(ERROR_MESSAGES.TECHNICAL.NAV_TARGET_NOT_FOUND, {
      action: 'setupSidebarNavigation',
      targetId: initialSection,
    });
  }
}

/**
 * 清理並標準化 Database/Page ID
 * - 移除 URL 前綴和查詢參數
 * - 移除連字符
 * - 提取純 32 字符的 ID
 *
 * @param {string} input - 使用者輸入的 ID 或 URL
 * @returns {string} 清理後的 ID，格式無效時返回空字符串
 */
export function cleanDatabaseId(input) {
  if (!input) {
    return '';
  }

  let cleaned = input.trim();

  // 如果是完整 URL，提取 ID 部分
  // 例如: https://www.notion.so/workspace/a1b2c3d4e5f67890abcdef1234567890?v=123
  // 使用非正則方式解析以徹底消除 ESLint 的所有正則相關警告 (Unsafe/Optimization)

  // Notion ID 可能是 32 位純字串或 36 位帶橫線的 UUID
  // 我們從路徑中尋找長度匹配的片段
  const pathParts = cleaned.split(/[#?]/)[0].split('/');
  const lastPathPart = pathParts.at(-1);

  if (lastPathPart && (lastPathPart.length === 36 || lastPathPart.length === 32)) {
    cleaned = lastPathPart;
  }

  // 移除所有連字符
  cleaned = cleaned.replaceAll('-', '');

  // 驗證格式：應該是 32 字符的十六進制字符串
  if (!/^[\da-f]{32}$/i.test(cleaned)) {
    return '';
  }

  return cleaned;
}

async function rollbackDefaultDestinationProfile({
  destinationProfileService,
  defaultProfileId,
  originalDataSourceId,
  originalDataSourceType,
  hasOriginalProfileState,
}) {
  if (!destinationProfileService || !hasOriginalProfileState) {
    return;
  }

  try {
    await destinationProfileService.updateProfile(defaultProfileId, {
      notionDataSourceId: originalDataSourceId,
      notionDataSourceType: originalDataSourceType,
    });
  } catch (rollbackError) {
    const safeRollbackError = sanitizeApiError(rollbackError, 'save_settings_profile_rollback');
    Logger.warn('還原預設保存目標失敗', {
      action: 'save_settings_profile_rollback',
      error: safeRollbackError,
    });
  }
}

/**
 * 保存設置
 *
 * @param {UIManager} ui
 * @param {AuthManager} auth
 * @param {string} [statusId='status']
 */
export async function saveSettings(ui, auth, statusId = 'status') {
  const apiKey = document.querySelector('#api-key').value.trim();
  const rawDatabaseId = document.querySelector('#database-id').value;
  const titleTemplate = document.querySelector('#title-template').value;
  const addSource = document.querySelector('#add-source').checked;
  const addTimestamp = document.querySelector('#add-timestamp').checked;
  const typeInput = document.querySelector('#database-type');
  const uiZoomLevel = document.querySelector('#ui-zoom-level')?.value;

  // 驗證 API Key，但如果是在 OAuth 模式下就忽略 API Key 檢查
  if (!apiKey && auth.currentAuthMode !== AuthMode.OAUTH) {
    ui.showStatus(UI_MESSAGES.SETTINGS.KEY_INPUT_REQUIRED, 'error', statusId);
    return;
  }

  // 清理並驗證 Database ID
  const databaseId = cleanDatabaseId(rawDatabaseId);
  if (!databaseId) {
    ui.showStatus(UI_MESSAGES.SETTINGS.INVALID_ID, 'error', statusId);
    return;
  }

  // 從集中配置取得 storage key 名稱
  const [dataSourceIdKey, databaseIdKey, dataSourceTypeKey] = DATA_SOURCE_KEYS;

  // 構建完整的設置對象
  const localSettings = {
    // 為了兼容性，同時保存兩種 ID 格式
    // notionDatabaseId 是舊版 (僅支援 Database)
    // notionDataSourceId 是新版 (支援 Page 和 Database)
    [databaseIdKey]: databaseId,
    [dataSourceIdKey]: databaseId, // 統一存到兩個欄位，確保兼容
  };

  const syncSettings = {
    notionApiKey: apiKey,
    titleTemplate,
    addSource,
    addTimestamp,
    uiZoomLevel: uiZoomLevel || '1',
  };

  // 如果類型欄位存在，一併保存並驗證
  const allowedDataSourceTypes = ['database', 'page'];
  const rawDataSourceType = typeInput?.value;
  localSettings[dataSourceTypeKey] = allowedDataSourceTypes.includes(rawDataSourceType)
    ? rawDataSourceType
    : 'database';

  // 保存標註樣式
  const highlightStyle = document.querySelector('#highlight-style');
  if (highlightStyle) {
    syncSettings.highlightStyle = highlightStyle.value;
  }

  // 保存 Notion 同步樣式
  const highlightContentStyle = document.querySelector('#highlight-content-style');
  if (highlightContentStyle) {
    syncSettings.highlightContentStyle = highlightContentStyle.value;
  }

  let destinationProfileService = null;
  let defaultProfileId = 'default';
  let originalDataSourceId = null;
  let originalDataSourceType = 'database';
  let hasOriginalProfileState = false;

  // 分離儲存至 local 與 sync（同時清除 sync 中的舊資料來源 key，防止跨裝置同步汙染）
  try {
    destinationProfileService = createDestinationProfileService();
    const profiles = await destinationProfileService.ensureMigratedDefaultProfile();
    const originalProfile = profiles[0] || {};
    defaultProfileId = originalProfile.id || 'default';
    originalDataSourceId = originalProfile.notionDataSourceId ?? null;
    originalDataSourceType = originalProfile.notionDataSourceType ?? 'database';
    hasOriginalProfileState = true;

    await destinationProfileService.updateProfile(defaultProfileId, {
      notionDataSourceId: databaseId,
      notionDataSourceType: localSettings[dataSourceTypeKey],
    });

    await Promise.all([
      chrome.storage.local.set(localSettings),
      chrome.storage.sync.set(syncSettings),
      chrome.storage.sync.remove(DATA_SOURCE_KEYS),
    ]);

    ui.showStatus(UI_MESSAGES.SETTINGS.SAVE_SUCCESS, 'success', statusId);

    // 刷新認證狀態以更新 UI
    auth.checkAuthStatus();
  } catch (error) {
    const safeMessage = sanitizeApiError(error, 'save_settings');
    const errorMessage =
      typeof safeMessage === 'string' ? safeMessage : JSON.stringify(safeMessage);
    const safeError = safeMessage instanceof Error ? safeMessage : new Error(errorMessage);
    ErrorHandler.logError({
      type: ErrorTypes.STORAGE,
      context: 'save_settings',
      originalError: safeError,
    });
    await rollbackDefaultDestinationProfile({
      destinationProfileService,
      defaultProfileId,
      originalDataSourceId,
      originalDataSourceType,
      hasOriginalProfileState,
    });

    ui.showStatus(UI_MESSAGES.SETTINGS.SAVE_FAILED, 'error', statusId);
  }
}

/**
 * 設置標題模板預覽功能
 */
export function setupTemplatePreview() {
  const previewButton = document.querySelector('#preview-template');
  const templateInput = document.querySelector('#title-template');
  const previewDiv = document.querySelector('#template-preview');

  if (previewButton && templateInput && previewDiv) {
    previewButton.addEventListener('click', () => {
      const template = templateInput.value;
      const now = new Date();

      const variables = {
        title: '範例網頁標題 - Notion Clipper',
        date: now.toLocaleDateString('zh-TW'),
        time: now.toLocaleTimeString('zh-TW'),
        datetime: now.toLocaleString('zh-TW'),
        url: 'https://example.com/article',
        domain: 'example.com',
      };

      const preview = formatTitle(template, variables);

      // 安全地構建 DOM 以防止 XSS
      previewDiv.textContent = '';
      const strong = document.createElement('strong');
      strong.textContent = '預覽結果：';
      const br = document.createElement('br');
      const previewText = document.createTextNode(preview);

      previewDiv.append(strong);
      previewDiv.append(br);
      previewDiv.append(previewText);
      previewDiv.classList.remove('hidden');
    });
  }
}

/**
 * 格式化標題
 *
 * @param {string} template
 * @param {object} variables
 * @returns {string} 格式化後的標題
 */
export function formatTitle(template, variables) {
  return template.replaceAll(/{(\w+)}/g, (match, key) => {
    return variables[key] || match;
  });
}

/**
 * 動態顯示應用程式版本號
 * 從 manifest.json 讀取版本號並顯示到側邊欄底部
 */
function displayAppVersion() {
  const versionElement = document.querySelector('#app-version');
  if (!versionElement) {
    return;
  }

  try {
    const manifest = chrome.runtime.getManifest();
    versionElement.textContent = `v${manifest.version}`;
  } catch (error) {
    // 如果無法獲取版本號，保持元素隱藏
    Logger.warn(ERROR_MESSAGES.TECHNICAL.GET_VERSION_FAILED, {
      action: 'displayAppVersion',
      error,
    });
  }
}

/**
 * 設置日誌導出
 */
function setupLogExport() {
  const exportBtn = document.querySelector('#export-logs-button');
  const statusEl = document.querySelector('#export-status');

  if (exportBtn && statusEl) {
    exportBtn.addEventListener('click', async () => {
      try {
        exportBtn.disabled = true;

        // 發送訊息給 Background
        const response = await chrome.runtime.sendMessage({
          action: RUNTIME_ACTIONS.EXPORT_DEBUG_LOGS,
          format: 'json',
        });

        if (!response) {
          throw new Error(ERROR_MESSAGES.TECHNICAL.BACKGROUND_NO_RESPONSE);
        }

        // 檢查 error 屬性 (優先處理明確的錯誤訊息)
        if (response.error) {
          throw new Error(response.error);
        }

        // 檢查 success 欄位
        if (!response.success) {
          throw new Error(ERROR_MESSAGES.TECHNICAL.LOG_EXPORT_FAILED);
        }

        // 審核要求：驗證外部輸入 (Security-First Input Validation)
        const data = response.data;

        // 使用 securityUtils 中的集中驗證邏輯
        validateLogExportData(data);

        const { filename, content, mimeType, count } = data;

        // 觸發下載
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = filename;
        document.body.append(downloadLink);
        downloadLink.click();
        downloadLink.remove();
        setTimeout(() => URL.revokeObjectURL(url), 100);

        statusEl.textContent = UI_MESSAGES.LOGS.EXPORT_SUCCESS(count);
        statusEl.className = `${UI_CLASS_STATUS_MSG} success`;

        // 3秒後清除成功訊息
        setTimeout(() => {
          statusEl.textContent = '';
          statusEl.className = UI_CLASS_STATUS_MSG;
        }, 3000);
      } catch (error) {
        Logger.error('Log export failed', {
          action: 'setupLogExport',
          error: error.message || error,
          stack: error.stack,
        });

        // 使用標準化的錯誤處理機制
        const safeReason = sanitizeApiError(error, 'export_debug_logs');
        const userFriendlyMsg = ErrorHandler.formatUserMessage(safeReason);

        // 組合最終訊息
        const errorMessage = `${UI_MESSAGES.LOGS.EXPORT_FAILED_PREFIX}${userFriendlyMsg}`;

        statusEl.textContent = errorMessage;
        statusEl.className = `${UI_CLASS_STATUS_MSG} error`;

        // 5秒後清除錯誤訊息（給用戶更多時間閱讀）
        setTimeout(() => {
          statusEl.textContent = '';
          statusEl.className = UI_CLASS_STATUS_MSG;
        }, 5000);
      } finally {
        exportBtn.disabled = false;
      }
    });
  }
}
