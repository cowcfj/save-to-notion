/**
 * Onboarding entry script
 *
 * 首次安裝後由 background.handleExtensionInstall() 開啟的 onboarding tab 載入。
 * 接線 DOM 事件、初始化第一步、進入完成頁時寫入 onboardingCompleted 旗標。
 *
 * 純邏輯位於 onboardingController.js 便於 jest 單元測試。
 */

/* global chrome */

import Logger from '../../scripts/utils/Logger.js';
import {
  TOTAL_STEPS,
  showStep,
  nextStep,
  skipToEnd,
  markCompleted,
  isNotionConnected,
  runNotionOAuthFlow,
  fetchNotionDatabases,
  selectDataSource,
  isAccountFeatureEnabled,
  isAccountLoggedIn,
} from './onboardingController.js';
import { startAccountLogin } from '../../scripts/auth/accountLoginInitiator.js';

const root = document.querySelector('#onboarding-root');
const ERROR_SCOPE_CONNECT_NOTION = 'connect-notion';
const ERROR_SCOPE_FETCH_DATABASES = 'fetch-databases';
const ERROR_SCOPE_LOGIN_ACCOUNT = 'login-account';
const STEP3_CONFIRM_SELECTOR = '[data-step3-confirm]';
const ARIA_CHECKED = 'aria-checked';

let selectedDatabaseId = null;

/**
 * 格式化錯誤訊息，優先使用錯誤內容本身，次之使用 defaultText
 *
 * @param {any} error 錯誤物件、字串或其他值
 * @param {string} [defaultText] 預設訊息
 * @returns {string} 格式化後的字串
 */
function formatError(error, defaultText = null) {
  // 若 error 本身就是非空字串，直接回傳
  if (typeof error === 'string' && error) {
    return error;
  }

  // 若 error 是 Error object 且有 message，回傳 message
  if (error?.message) {
    return error.message;
  }

  // 若 error 是 null/undefined，回傳 defaultText 或通用訊息
  if (error == null) {
    return defaultText || '未知錯誤';
  }

  // 其他情況：回傳 defaultText 或嘗試轉字串
  return defaultText || String(error);
}

/**
 * 檢查 storage 變更是否代表已完成 account 登入
 *
 * @param {object} changes Storage 變更
 * @param {string} areaName 儲存區域名稱
 * @returns {boolean}
 */
function hasCompletedAccountLogin(changes, areaName) {
  return areaName === 'local' && Boolean(changes.accountEmail?.newValue);
}

/**
 * 還原步驟 4 的登入按鈕狀態與隱藏等待中文字
 *
 * @param {HTMLButtonElement} button 登入按鈕
 * @param {string} originalText 按鈕原本的文字
 */
function restoreStep4LoginButton(button, originalText) {
  button.disabled = false;
  button.textContent = originalText;
  setStep4WaitingVisible(false);
}

/**
 * 驗證 account 登入結果，若失敗則拋出錯誤
 *
 * @param {object} result 登入結果
 * @throws {Error}
 */
function assertAccountLoginStarted(result) {
  if (!result?.success) {
    throw new Error(result?.error || 'login_failed');
  }
}

function setError(scope, message) {
  const errorEl = root.querySelector(`[data-error="${CSS.escape(scope)}"]`);
  if (!errorEl) {
    return;
  }
  if (message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  } else {
    errorEl.textContent = '';
    errorEl.hidden = true;
  }
}

function setStep3State(state) {
  const containers = root.querySelectorAll('[data-step3-state]');
  containers.forEach(container => {
    container.hidden = container.dataset.step3State !== state;
  });
  const confirmButton = root.querySelector(STEP3_CONFIRM_SELECTOR);
  if (confirmButton) {
    // needs-auth 時隱藏「下一步」，僅留 skip
    confirmButton.hidden = state === 'needs-auth';
  }
}

function renderDatabaseList(databases) {
  const listEl = root.querySelector('[data-database-list]');
  if (!listEl) {
    return;
  }
  listEl.replaceChildren();
  databases.forEach(db => {
    const item = document.createElement('li');
    item.className = 'database-item';
    item.dataset.databaseId = db.id;
    item.tabIndex = 0;
    item.setAttribute('role', 'radio');
    item.setAttribute(ARIA_CHECKED, 'false');
    item.textContent = db.title;
    listEl.append(item);
  });
}

function selectDatabaseItem(item) {
  const previous = root.querySelector('.database-item.selected');
  if (previous) {
    previous.classList.remove('selected');
    previous.setAttribute(ARIA_CHECKED, 'false');
  }
  item.classList.add('selected');
  item.setAttribute(ARIA_CHECKED, 'true');
  selectedDatabaseId = item.dataset.databaseId;
  const confirmButton = root.querySelector(STEP3_CONFIRM_SELECTOR);
  if (confirmButton) {
    confirmButton.disabled = false;
  }
}

function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, response => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          reject(new Error(lastError.message || 'runtime_lasterror'));
          return;
        }
        resolve(response);
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function loadDatabasesForStep3() {
  setStep3State('loading');
  setError(ERROR_SCOPE_FETCH_DATABASES, '');
  selectedDatabaseId = null;
  const confirmButton = root.querySelector(STEP3_CONFIRM_SELECTOR);
  if (confirmButton) {
    confirmButton.disabled = true;
  }
  try {
    const databases = await fetchNotionDatabases({ sendMessage: sendRuntimeMessage });
    if (databases.length === 0) {
      setStep3State('empty');
      return;
    }
    renderDatabaseList(databases);
    setStep3State('list');
  } catch (error) {
    Logger.warn('[Onboarding] 拉取 database 列表失敗', {
      action: 'fetchNotionDatabases',
      result: 'failed',
      error: formatError(error),
    });
    setError(
      ERROR_SCOPE_FETCH_DATABASES,
      `載入失敗：${formatError(error, '未知錯誤')}，請重試或稍後再說`
    );
    setStep3State('error');
  }
}

async function handleStep2Entered() {
  setError(ERROR_SCOPE_CONNECT_NOTION, '');
  try {
    if (await isNotionConnected(chrome.storage.local)) {
      const advanced = nextStep(root);
      await handleStepEntered(advanced);
    }
  } catch (error) {
    Logger.warn('[Onboarding] 偵測 Notion 授權狀態失敗', {
      action: 'isNotionConnected',
      result: 'failed',
      error: formatError(error),
    });
  }
}

async function handleStep3Entered() {
  let connected = false;
  try {
    connected = await isNotionConnected(chrome.storage.local);
  } catch (error) {
    Logger.warn('[Onboarding] 偵測 Notion 授權狀態失敗', {
      action: 'isNotionConnected',
      result: 'failed',
      error: formatError(error),
    });
  }
  if (!connected) {
    setStep3State('needs-auth');
    return;
  }
  await loadDatabasesForStep3();
}

async function handleStep4Entered() {
  setError(ERROR_SCOPE_LOGIN_ACCOUNT, '');
  setStep4WaitingVisible(false);
  if (!isAccountFeatureEnabled()) {
    const advanced = nextStep(root);
    await handleStepEntered(advanced);
    return;
  }
  try {
    if (await isAccountLoggedIn(chrome.storage.local)) {
      const advanced = nextStep(root);
      await handleStepEntered(advanced);
    }
  } catch (error) {
    Logger.warn('[Onboarding] 偵測 account 登入狀態失敗', {
      action: 'isAccountLoggedIn',
      result: 'failed',
      error: formatError(error),
    });
  }
}

async function handleStepCompleted() {
  try {
    await markCompleted(chrome.storage.local);
  } catch (error) {
    Logger.warn('[Onboarding] 寫入完成旗標失敗', {
      action: 'markCompleted',
      result: 'failed',
      error: formatError(error),
    });
  }
}

async function handleStepEntered(step) {
  switch (step) {
    case 2: {
      await handleStep2Entered();
      return;
    }
    case 3: {
      await handleStep3Entered();
      return;
    }
    case 4: {
      await handleStep4Entered();
      return;
    }
    case TOTAL_STEPS: {
      await handleStepCompleted();
      return;
    }
    // default: step 1, 5 不需 side effect
  }
}

async function handleConnectNotion(button) {
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = '連接中...';
  setError(ERROR_SCOPE_CONNECT_NOTION, '');
  try {
    await runNotionOAuthFlow();
    const step = nextStep(root);
    await handleStepEntered(step);
  } catch (error) {
    Logger.warn('[Onboarding] Notion OAuth 連接失敗', {
      action: 'runNotionOAuthFlow',
      result: 'failed',
      error: formatError(error),
    });
    setError(
      ERROR_SCOPE_CONNECT_NOTION,
      `連接失敗：${formatError(error, '未知錯誤')}，請重試或稍後再說`
    );
    button.disabled = false;
    button.textContent = originalText;
  }
}

async function handleConfirmDatabase(button) {
  if (!selectedDatabaseId) {
    return;
  }
  const originalDisabled = button.disabled;
  button.disabled = true;
  try {
    await selectDataSource({
      storage: chrome.storage.local,
      dataSourceId: selectedDatabaseId,
    });
    const step = nextStep(root);
    await handleStepEntered(step);
  } catch (error) {
    Logger.warn('[Onboarding] 寫入 notionDataSourceId 失敗', {
      action: 'selectDataSource',
      result: 'failed',
      error: formatError(error),
    });
    setError(ERROR_SCOPE_FETCH_DATABASES, `儲存失敗：${formatError(error, '未知錯誤')}，請重試`);
    setStep3State('error');
    button.disabled = originalDisabled;
  }
}

function setStep4WaitingVisible(visible) {
  const waitingEl = root.querySelector('[data-step4-state="waiting"]');
  if (waitingEl) {
    waitingEl.hidden = !visible;
  }
}

async function handleLoginAccount(button) {
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = '登入中...';
  setError(ERROR_SCOPE_LOGIN_ACCOUNT, '');

  const restoreButton = () => restoreStep4LoginButton(button, originalText);
  const onChanged = async (changes, areaName) => {
    if (!hasCompletedAccountLogin(changes, areaName)) {
      return;
    }
    chrome.storage.onChanged.removeListener(onChanged);
    setStep4WaitingVisible(false);
    const step = nextStep(root);
    await handleStepEntered(step);
  };
  chrome.storage.onChanged.addListener(onChanged);

  try {
    const result = await startAccountLogin();
    assertAccountLoginStarted(result);
    setStep4WaitingVisible(true);
  } catch (error) {
    chrome.storage.onChanged.removeListener(onChanged);
    Logger.warn('[Onboarding] account 登入觸發失敗', {
      action: 'startAccountLogin',
      result: 'failed',
      error: formatError(error),
    });
    setError(
      ERROR_SCOPE_LOGIN_ACCOUNT,
      `登入失敗：${formatError(error, '未知錯誤')}，請重試或稍後再說`
    );
    restoreButton();
  }
}

/**
 * Onboarding click action 對應表
 */
const ACTION_HANDLERS = {
  next: async () => {
    const step = nextStep(root);
    await handleStepEntered(step);
  },
  skip: async () => {
    const step = skipToEnd(root);
    await handleStepEntered(step);
  },
  'connect-notion': async trigger => {
    await handleConnectNotion(trigger);
  },
  'login-account': async trigger => {
    await handleLoginAccount(trigger);
  },
  'confirm-database': async trigger => {
    await handleConfirmDatabase(trigger);
  },
  'retry-databases': async () => {
    await loadDatabasesForStep3();
  },
  finish: () => {
    window.close();
  },
};

/**
 * 處理 onboarding 按鈕點擊的分發
 *
 * @param {MouseEvent} event 點擊事件
 */
async function handleOnboardingClick(event) {
  const { target } = event;
  if (!(target instanceof Element)) {
    return;
  }

  const databaseItem = target.closest('.database-item[data-database-id]');
  if (databaseItem) {
    selectDatabaseItem(databaseItem);
    return;
  }
  const trigger = target.closest('[data-action]');
  if (!trigger) {
    return;
  }
  const action = trigger.dataset.action;
  const handler = ACTION_HANDLERS[action];
  if (handler) {
    await handler(trigger);
  }
}

function bindActions() {
  root.addEventListener('click', handleOnboardingClick);
}

showStep(root, 1);
bindActions();
Logger.ready('[Onboarding] entry loaded', { action: 'onboarding_init', result: 'success' });
