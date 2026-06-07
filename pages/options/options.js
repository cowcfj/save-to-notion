/* global chrome */
import { applyStaticOptionMessages } from './staticOptionMessages.js';
import { setupDebugLogExport } from './debugLogExportUI.js';
import { initAccountUI, renderAccountUI } from './accountUI.js';
export { applyStaticOptionMessages } from './staticOptionMessages.js';

import { UIManager } from './UIManager.js';
import { AuthManager } from './AuthManager.js';
import { DataSourceManager } from './DataSourceManager.js';
import { StorageManager } from './StorageManager.js';
import { MigrationTool } from './MigrationTool.js';
import { AuthMode } from '../../scripts/config/extension/authMode.js';
import { BUILD_ENV } from '../../scripts/config/env/index.js';
import { UI_MESSAGES, ERROR_MESSAGES } from '../../scripts/config/shared/messages.js';
import { UI_ICONS } from '../../scripts/config/shared/ui.js';
import { RUNTIME_ACTIONS } from '../../scripts/config/shared/runtimeActions.js';
import { injectIcons } from '../../scripts/utils/uiUtils.js';
import Logger from '../../scripts/utils/Logger.js';

import { sanitizeApiError } from '../../scripts/utils/ApiErrorSanitizer.js';
import { ErrorHandler, ErrorTypes } from '../../scripts/utils/ErrorHandler.js';
import { DATA_SOURCE_KEYS } from '../../scripts/config/shared/storage.js';
import { refreshCloudSyncCard } from './DriveCloudSyncController.js';
import {
  AccountGatedDestinationEntitlementProvider,
  DESTINATION_PROFILE_ERROR_CODES,
  LocalDestinationProfileRepository,
} from '../../scripts/destinations/ProfileStore.js';
import { ProfileManager } from '../../scripts/destinations/ProfileManager.js';

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
const NOTION_ID_LENGTH = 32;
const NOTION_UUID_SEGMENT_LENGTH = 36;
const NOTION_ID_SEGMENT_LENGTHS = new Set([NOTION_ID_LENGTH, NOTION_UUID_SEGMENT_LENGTH]);
const NOTION_ID_HEX_DIGITS = new Set('0123456789abcdefABCDEF'.split(''));
let destinationProfilesUIController = null;

function normalizeDestinationProfileName(value) {
  return typeof value === 'string'
    ? value.trim().slice(0, DESTINATION_PROFILE_NAME_MAX_LENGTH)
    : '';
}

function resolveDestinationTargetInputId() {
  return cleanDatabaseId(
    document.querySelector(DESTINATION_TARGET_FIELD_SELECTORS.ID)?.value || ''
  );
}

function resolveDestinationTargetInputType() {
  const rawType = document.querySelector(DESTINATION_TARGET_FIELD_SELECTORS.TYPE)?.value;
  return rawType === 'page' ? 'page' : 'database';
}

function resolveNewDestinationProfileName(nameInput) {
  const explicitName = normalizeDestinationProfileName(nameInput?.value || '');
  return (
    explicitName || UI_MESSAGES.OPTIONS.DESTINATION.DEFAULT_NAME(Date.now().toString().slice(-4))
  );
}

function clearDestinationProfileNameInput(nameInput) {
  if (nameInput) {
    nameInput.value = '';
  }
}

function resolveCreateDestinationProfileErrorMessage(error) {
  return error?.code === DESTINATION_PROFILE_ERROR_CODES.LIMIT_REACHED
    ? UI_MESSAGES.OPTIONS.DESTINATION.CREATE_LIMIT_REACHED
    : UI_MESSAGES.OPTIONS.DESTINATION.CREATE_FAILED;
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

  if (!targetItem) {
    return false;
  }

  if (!targetExists) {
    return false;
  }

  for (const nav of navItems) {
    nav.classList.remove('active');
    nav.setAttribute('aria-selected', 'false');
  }
  targetItem.classList.add('active');
  targetItem.setAttribute('aria-selected', 'true');

  for (const section of sections) {
    if (section.id === targetSectionId) {
      section.classList.add('active');
      section.setAttribute('aria-hidden', 'false');
    } else {
      section.classList.remove('active');
      section.setAttribute('aria-hidden', 'true');
    }
  }

  return true;
}

/**
 * 建立 Options 頁面的各個管理器
 *
 * @returns {object} 包含各管理器的對象
 */
function createOptionsPageManagers() {
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

  return { ui, auth, dataSource, storage, migration };
}

/**
 * 當禁用 OAuth 時隱藏對應的控制元件
 */
function hideOAuthControlsWhenDisabled() {
  if (!BUILD_ENV.ENABLE_OAUTH) {
    const oauthConnectBtn = document.querySelector('#oauth-connect-button');
    const oauthDisconnectBtn = document.querySelector('#oauth-disconnect-button');
    if (oauthConnectBtn) {
      oauthConnectBtn.classList.add('hidden');
    }
    if (oauthDisconnectBtn) {
      oauthDisconnectBtn.classList.add('hidden');
    }
  }
}

/**
 * 按順序初始化各個管理器
 *
 * @param {object} managers - 包含管理器實例的對象
 * @param {UIManager} managers.ui
 * @param {AuthManager} managers.auth
 * @param {DataSourceManager} managers.dataSource
 * @param {StorageManager} managers.storage
 * @param {MigrationTool} managers.migration
 */
function initializeOptionsManagers({ ui, auth, dataSource, storage, migration }) {
  ui.init();
  hideOAuthControlsWhenDisabled();
  auth.init({
    loadDataSources: dataSource.loadDataSources.bind(dataSource),
  });
  dataSource.init();
  storage.init();
  migration.init();
}

/**
 * 重新整理保存目標 UI
 *
 * @param {UIManager} ui
 */
function refreshDestinationProfilesUI(ui) {
  initDestinationProfilesUI(ui).catch(error => {
    const safeError = sanitizeApiError(error, 'initDestinationProfilesUI');
    Logger.warn('初始化保存目標 UI 失敗', {
      action: 'initDestinationProfilesUI',
      error: safeError,
    });
  });
}

/**
 * 綁定 Options 頁面的 Chrome runtime 訊息監聽器
 *
 * @param {object} params
 * @param {AuthManager} params.auth
 * @param {UIManager} params.ui
 */
function bindOptionsRuntimeMessages({ auth, ui }) {
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
        renderAccountUI().catch(() => {});
        refreshDestinationProfilesUI(ui);
        break;
      }
      case RUNTIME_ACTIONS.DRIVE_SYNC_STATUS_UPDATED: {
        refreshCloudSyncCard().catch(() => {});
        break;
      }
      default: {
        break;
      }
    }
  });
}

/**
 * 綁定保存按鈕事件
 *
 * @param {UIManager} ui
 * @param {AuthManager} auth
 */
function bindOptionsSaveButtons(ui, auth) {
  const saveButton = document.querySelector('#save-button');
  if (saveButton) {
    saveButton.addEventListener('click', () => saveSettings(ui, auth, 'status'));
  }

  const saveTemplatesButton = document.querySelector('#save-templates-button');
  if (saveTemplatesButton) {
    saveTemplatesButton.addEventListener('click', () => saveSettings(ui, auth, 'template-status'));
  }
}

/**
 * 初始化介面縮放偏好設定
 */
function initializeZoomPreference() {
  const zoomSelect = document.querySelector('#ui-zoom-level');
  if (zoomSelect) {
    chrome.storage.sync.get(['uiZoomLevel'], result => {
      const zoom = String(result.uiZoomLevel || '1');
      document.body.style.zoom = zoom;
      zoomSelect.value = zoom;
    });

    zoomSelect.addEventListener('change', () => {
      document.body.style.zoom = zoomSelect.value;
    });
  }
}

/**
 * 初始化高亮與 Notion 同步樣式偏好設定
 */
function initializeHighlightContentStylePreference() {
  const highlightContentStyleSelect = document.querySelector('#highlight-content-style');
  if (highlightContentStyleSelect) {
    chrome.storage.sync.get({ highlightContentStyle: 'COLOR_SYNC' }, result => {
      highlightContentStyleSelect.value = result.highlightContentStyle;
    });
  }
}

/**
 * Options Page Main Controller
 * 負責協調各个模組，處理全域事件與設置保存
 */
export function initOptions() {
  applyStaticOptionMessages();

  // 1. 初始化各管理器
  injectIcons(UI_ICONS); // Inject SVG sprites (Shared System)
  const managers = createOptionsPageManagers();

  // 2. 注入依賴並啟動
  initializeOptionsManagers(managers);
  refreshDestinationProfilesUI(managers.ui);

  // 3. 初始狀態檢查
  managers.auth.checkAuthStatus();

  // 4. 全域事件監聽與初始化
  bindOptionsRuntimeMessages(managers);
  initAccountUI();

  // 5. 全域事件監聽：儲存使用量更新 (由 MigrationTool 觸發)
  document.addEventListener('storageUsageUpdate', () => {
    managers.storage.updateStorageUsage();
  });

  // 6. 保存設置與其它邏輯
  bindOptionsSaveButtons(managers.ui, managers.auth);
  setupTemplatePreview();
  setupSidebarNavigation();
  displayAppVersion();
  setupDebugLogExport();

  // 7. 偏好設定初始化
  initializeZoomPreference();
  initializeHighlightContentStylePreference();
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
    ui.showStatus(UI_MESSAGES.OPTIONS.DESTINATION.PROFILE_NAME_REQUIRED, 'error');
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
      titleInput.value =
        draftProfileName || profile.name || UI_MESSAGES.OPTIONS.DESTINATION.DEFAULT_PROFILE_NAME;
      titleInput.maxLength = DESTINATION_PROFILE_NAME_MAX_LENGTH;
      titleInput.setAttribute(
        'aria-label',
        UI_MESSAGES.OPTIONS.DESTINATION.PROFILE_NAME_ARIA_LABEL
      );
      titleEdit.append(titleInput);
      content.append(titleEdit);
    } else {
      const title = document.createElement('p');
      title.className = 'destination-profile-title';
      title.textContent = profile.name || UI_MESSAGES.OPTIONS.DESTINATION.DEFAULT_PROFILE_NAME;
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
          text: UI_MESSAGES.OPTIONS.DESTINATION.ACTION_SAVE_NAME,
        }),
        createDestinationActionButton({
          action: DESTINATION_PROFILE_ACTIONS.CANCEL_NAME,
          profileId: profile.id,
          text: UI_MESSAGES.OPTIONS.DESTINATION.ACTION_CANCEL_NAME,
        })
      );
      return actions;
    }

    actions.append(
      createDestinationActionButton({
        action: DESTINATION_PROFILE_ACTIONS.RENAME,
        profileId: profile.id,
        text: UI_MESSAGES.OPTIONS.DESTINATION.ACTION_RENAME,
      }),
      createDestinationActionButton({
        action: DESTINATION_PROFILE_ACTIONS.EDIT,
        profileId: profile.id,
        text: UI_MESSAGES.OPTIONS.DESTINATION.ACTION_APPLY,
      })
    );

    if (canDeleteProfile) {
      actions.append(
        createDestinationActionButton({
          action: DESTINATION_PROFILE_ACTIONS.DELETE,
          profileId: profile.id,
          text: UI_MESSAGES.OPTIONS.DESTINATION.ACTION_DELETE,
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
      limitMessage = UI_MESSAGES.OPTIONS.DESTINATION.LIMIT_ACCOUNT_SIGN_IN;
    } else if (limitReached) {
      limitMessage = UI_MESSAGES.OPTIONS.DESTINATION.LIMIT_PAID_PLAN;
    }
    status.textContent = limitMessage;
    addButton.title = limitMessage;
  };

  const renderDestinationProfiles = async () => {
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

  const enterDestinationProfileNameEdit = async profileId => {
    const profile = await service.getProfile(profileId);
    editingProfileId = profile.id;
    draftProfileName = profile.name || UI_MESSAGES.OPTIONS.DESTINATION.DEFAULT_PROFILE_NAME;
    await renderDestinationProfiles();
    list.querySelector(`input[data-role="${DESTINATION_PROFILE_NAME_EDIT_ROLE}"]`)?.focus?.();
  };

  const cancelDestinationProfileNameEdit = async () => {
    editingProfileId = null;
    draftProfileName = '';
    await renderDestinationProfiles();
  };

  const saveDestinationProfileName = async profileId => {
    const input = list.querySelector(`input[data-role="${DESTINATION_PROFILE_NAME_EDIT_ROLE}"]`);
    const nextName = normalizeDestinationProfileName(input?.value || '');
    if (!nextName) {
      showNameError();
      return;
    }
    await service.updateProfile(profileId, { name: nextName });
    editingProfileId = null;
    draftProfileName = '';
    await renderDestinationProfiles();
  };

  const applyDestinationProfileToForm = async profileId => {
    const profile = await service.getProfile(profileId);
    document.querySelector(DESTINATION_TARGET_FIELD_SELECTORS.ID).value =
      profile.notionDataSourceId;
    document.querySelector(DESTINATION_TARGET_FIELD_SELECTORS.TYPE).value =
      profile.notionDataSourceType;
    ui.showStatus(UI_MESSAGES.OPTIONS.DESTINATION.APPLY_SUCCESS(profile.name), 'info');
  };

  const deleteDestinationProfile = async profileId => {
    await service.deleteProfile(profileId);
    await renderDestinationProfiles();
  };

  const createDestinationProfileFromForm = async () => {
    try {
      const databaseId = resolveDestinationTargetInputId();
      if (!databaseId) {
        ui.showStatus(UI_MESSAGES.SETTINGS.INVALID_ID, 'error');
        return;
      }
      await service.createProfile({
        name: resolveNewDestinationProfileName(nameInput),
        notionDataSourceId: databaseId,
        notionDataSourceType: resolveDestinationTargetInputType(),
      });
      clearDestinationProfileNameInput(nameInput);
      await renderDestinationProfiles();
    } catch (error) {
      const safeError = sanitizeApiError(error, 'createDestinationProfile');
      Logger.warn('新增保存目標失敗', {
        action: 'createDestinationProfile',
        error: safeError,
      });
      ui.showStatus(resolveCreateDestinationProfileErrorMessage(error), 'error');
    }
  };

  const destinationProfileActionHandlers = {
    [DESTINATION_PROFILE_ACTIONS.RENAME]: enterDestinationProfileNameEdit,
    [DESTINATION_PROFILE_ACTIONS.CANCEL_NAME]: cancelDestinationProfileNameEdit,
    [DESTINATION_PROFILE_ACTIONS.SAVE_NAME]: saveDestinationProfileName,
    [DESTINATION_PROFILE_ACTIONS.EDIT]: applyDestinationProfileToForm,
    [DESTINATION_PROFILE_ACTIONS.DELETE]: deleteDestinationProfile,
  };

  list.addEventListener('click', async event => {
    try {
      const button = event.target?.closest?.('button[data-action]');
      if (!button) {
        return;
      }
      const profileId = button.dataset.profileId;
      const action = button.dataset.action;
      const handler = destinationProfileActionHandlers[action];
      if (handler) {
        await handler(profileId);
      }
    } catch (error) {
      const safeError = sanitizeApiError(error, 'destinationProfileAction');
      Logger.warn('保存目標操作失敗', {
        action: 'destinationProfileAction',
        error: safeError,
      });
      ui.showStatus(UI_MESSAGES.OPTIONS.DESTINATION.ACTION_FAILED, 'error');
    }
  });

  addButton.addEventListener('click', createDestinationProfileFromForm);

  destinationProfilesUIController = { list, addButton, render: renderDestinationProfiles };
  await service.ensureMigratedDefaultProfile();
  await renderDestinationProfiles();
}

document.addEventListener('DOMContentLoaded', initOptions);

function hasMissingSidebarNavigationElements(navItems, sections) {
  if (navItems.length === 0) {
    return true;
  }
  return sections.length === 0;
}

function activateInitialSidebarSection(navItems, sections) {
  const initialSection = new URLSearchParams(globalThis.location.search).get('section');
  if (!initialSection) {
    return;
  }

  if (activateSidebarSection(initialSection, navItems, sections)) {
    return;
  }

  Logger.warn(ERROR_MESSAGES.TECHNICAL.NAV_TARGET_NOT_FOUND, {
    action: 'setupSidebarNavigation',
    targetId: initialSection,
  });
}

/**
 * 設置側邊欄導航
 */
function setupSidebarNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const sections = document.querySelectorAll('.settings-section');

  if (hasMissingSidebarNavigationElements(navItems, sections)) {
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

  activateInitialSidebarSection(navItems, sections);
}

function isPotentialNotionIdSegment(segment) {
  return NOTION_ID_SEGMENT_LENGTHS.has(segment?.length);
}

function stripNotionUrlSuffix(value) {
  const suffixIndexes = [value.indexOf('#'), value.indexOf('?')].filter(index => index >= 0);
  const endIndex = suffixIndexes.length > 0 ? Math.min(...suffixIndexes) : value.length;
  return value.slice(0, endIndex);
}

function extractCandidateNotionIdSegment(value) {
  return stripNotionUrlSuffix(value).split('/').at(-1);
}

function hasValidNotionIdFormat(value) {
  if (value.length !== NOTION_ID_LENGTH) {
    return false;
  }
  return Array.from(value).every(character => NOTION_ID_HEX_DIGITS.has(character));
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
  const lastPathPart = extractCandidateNotionIdSegment(cleaned);

  if (isPotentialNotionIdSegment(lastPathPart)) {
    cleaned = lastPathPart;
  }

  // 移除所有連字符
  cleaned = cleaned.replaceAll('-', '');

  // 驗證格式：應該是 32 字符的十六進制字符串
  if (!hasValidNotionIdFormat(cleaned)) {
    return '';
  }

  return cleaned;
}

/**
 * 讀取表單所有欄位值
 *
 * @returns {object} 表單欄位值對象
 */
function readOptionsFormValues() {
  const apiKey = document.querySelector('#api-key').value.trim();
  const rawDatabaseId = document.querySelector('#database-id').value;
  const titleTemplate = document.querySelector('#title-template').value;
  const addSource = document.querySelector('#add-source').checked;
  const addTimestamp = document.querySelector('#add-timestamp').checked;
  const typeInput = document.querySelector('#database-type');
  const uiZoomLevel = document.querySelector('#ui-zoom-level')?.value;

  // 標註樣式
  const highlightStyleEl = document.querySelector('#highlight-style');
  const highlightContentStyleEl = document.querySelector('#highlight-content-style');

  // Floating Rail 設定
  const floatingRailCheckbox = document.querySelector('#floating-rail-enabled');
  const floatingRailPositionSelect = document.querySelector('#floating-rail-position');
  const floatingRailSizeSelect = document.querySelector('#floating-rail-size');

  return {
    apiKey,
    rawDatabaseId,
    titleTemplate,
    addSource,
    addTimestamp,
    rawDataSourceType: typeInput?.value,
    uiZoomLevel,
    highlightStyle: highlightStyleEl ? highlightStyleEl.value : undefined,
    highlightContentStyle: highlightContentStyleEl ? highlightContentStyleEl.value : undefined,
    floatingRailEnabled: floatingRailCheckbox ? floatingRailCheckbox.checked : undefined,
    floatingRailPosition: floatingRailPositionSelect ? floatingRailPositionSelect.value : undefined,
    floatingRailSize: floatingRailSizeSelect ? floatingRailSizeSelect.value : undefined,
  };
}

/**
 * 驗證表單輸入值
 *
 * @param {object} formValues
 * @param {string} formValues.apiKey
 * @param {string} formValues.rawDatabaseId
 * @param {AuthManager} auth
 * @param {UIManager} ui
 * @param {string} statusId
 * @returns {object} { success: boolean, databaseId?: string }
 */
function validateOptionsFormValues({ apiKey, rawDatabaseId }, auth, ui, statusId) {
  // 驗證 API Key，但如果是在 OAuth 模式下就忽略 API Key 檢查
  if (!apiKey && auth.currentAuthMode !== AuthMode.OAUTH) {
    ui.showStatus(UI_MESSAGES.SETTINGS.KEY_INPUT_REQUIRED, 'error', statusId);
    return { success: false };
  }

  // 清理並驗證 Database ID
  const databaseId = cleanDatabaseId(rawDatabaseId);
  if (!databaseId) {
    ui.showStatus(UI_MESSAGES.SETTINGS.INVALID_ID, 'error', statusId);
    return { success: false };
  }

  return { success: true, databaseId };
}

/**
 * 解析並正規化資料來源類型
 *
 * @param {string} rawDataSourceType
 * @returns {string} 'database' | 'page'
 */
function resolveDataSourceType(rawDataSourceType) {
  const allowedDataSourceTypes = ['database', 'page'];
  return allowedDataSourceTypes.includes(rawDataSourceType) ? rawDataSourceType : 'database';
}

/**
 * 構建儲存設置對象
 *
 * @param {object} formValues
 * @param {string} databaseId
 * @returns {object} { localSettings, syncSettings, dataSourceType }
 */
function buildOptionsStorageSettings(formValues, databaseId) {
  const [dataSourceIdKey, databaseIdKey, dataSourceTypeKey] = DATA_SOURCE_KEYS;
  const dataSourceType = resolveDataSourceType(formValues.rawDataSourceType);

  const localSettings = {
    // 為了兼容性，同時保存兩種 ID 格式
    [databaseIdKey]: databaseId,
    [dataSourceIdKey]: databaseId, // 統一存到兩個欄位，確保兼容
    [dataSourceTypeKey]: dataSourceType,
  };

  const syncSettings = {
    notionApiKey: formValues.apiKey,
    titleTemplate: formValues.titleTemplate,
    addSource: formValues.addSource,
    addTimestamp: formValues.addTimestamp,
    uiZoomLevel: formValues.uiZoomLevel || '1',
  };

  if (formValues.highlightStyle !== undefined) {
    syncSettings.highlightStyle = formValues.highlightStyle;
  }
  if (formValues.highlightContentStyle !== undefined) {
    syncSettings.highlightContentStyle = formValues.highlightContentStyle;
  }
  if (formValues.floatingRailEnabled !== undefined) {
    syncSettings.floatingRailEnabled = formValues.floatingRailEnabled;
  }
  if (formValues.floatingRailPosition !== undefined) {
    syncSettings.floatingRailPosition = formValues.floatingRailPosition;
  }
  if (formValues.floatingRailSize !== undefined) {
    syncSettings.floatingRailSize = formValues.floatingRailSize;
  }

  return { localSettings, syncSettings, dataSourceType };
}

/**
 * 擷取預設保存目標設定的初始狀態（用於錯誤時還原）
 *
 * @param {DestinationProfileService} destinationProfileService
 * @returns {Promise<object>}
 */
async function captureDefaultDestinationProfileState(destinationProfileService) {
  const profiles = await destinationProfileService.ensureMigratedDefaultProfile();
  const originalProfile = profiles[0] || {};
  const defaultProfileId = originalProfile.id || 'default';
  const originalDataSourceId = originalProfile.notionDataSourceId ?? null;
  const originalDataSourceType = originalProfile.notionDataSourceType ?? 'database';
  return {
    defaultProfileId,
    originalDataSourceId,
    originalDataSourceType,
    hasOriginalProfileState: true,
  };
}

/**
 * 持久化選項設置
 *
 * @param {object} params
 * @param {DestinationProfileService} params.destinationProfileService
 * @param {string} params.defaultProfileId
 * @param {string} params.databaseId
 * @param {string} params.dataSourceType
 * @param {object} params.localSettings
 * @param {object} params.syncSettings
 * @returns {Promise<void>}
 */
async function persistOptionsSettings({
  destinationProfileService,
  defaultProfileId,
  databaseId,
  dataSourceType,
  localSettings,
  syncSettings,
}) {
  await destinationProfileService.updateProfile(defaultProfileId, {
    notionDataSourceId: databaseId,
    notionDataSourceType: dataSourceType,
  });

  await Promise.all([
    chrome.storage.local.set(localSettings),
    chrome.storage.sync.set(syncSettings),
    chrome.storage.sync.remove(DATA_SOURCE_KEYS),
  ]);
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
  const formValues = readOptionsFormValues();

  const validation = validateOptionsFormValues(formValues, auth, ui, statusId);
  if (!validation.success) {
    return;
  }
  const { databaseId } = validation;

  const { localSettings, syncSettings, dataSourceType } = buildOptionsStorageSettings(
    formValues,
    databaseId
  );

  let destinationProfileService = null;
  let defaultProfileId = 'default';
  let originalDataSourceId = null;
  let originalDataSourceType = 'database';
  let hasOriginalProfileState = false;

  try {
    destinationProfileService = createDestinationProfileService();
    const originalState = await captureDefaultDestinationProfileState(destinationProfileService);
    defaultProfileId = originalState.defaultProfileId;
    originalDataSourceId = originalState.originalDataSourceId;
    originalDataSourceType = originalState.originalDataSourceType;
    hasOriginalProfileState = originalState.hasOriginalProfileState;

    await persistOptionsSettings({
      destinationProfileService,
      defaultProfileId,
      databaseId,
      dataSourceType,
      localSettings,
      syncSettings,
    });

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
        title: UI_MESSAGES.OPTIONS.TEMPLATES.PREVIEW_SAMPLE_TITLE,
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
      strong.textContent = UI_MESSAGES.OPTIONS.TEMPLATES.PREVIEW_RESULT_LABEL;
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
