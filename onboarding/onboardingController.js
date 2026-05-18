/**
 * Onboarding wizard controller
 *
 * 純邏輯模組，與 DOM 互動但不持有 module-level state，
 * 便於 jest 在 jsdom 環境下注入自製 root 與 mock storage 進行單元測試。
 *
 * Entry script (onboarding.js) 將 document 作為 root 傳入並接線 click handler。
 */

import { ONBOARDING_COMPLETED_KEY } from '../scripts/config/shared/storage.js';
import { initiateNotionOAuth } from '../scripts/auth/notionOAuthInitiator.js';
import {
  exchangeNotionOAuthCode,
  saveNotionOAuthToken,
} from '../scripts/auth/notionOAuthCompleter.js';
import { RUNTIME_ACTIONS } from '../scripts/config/shared/runtimeActions.js';
import { BUILD_ENV } from '../scripts/config/env/index.js';

export const TOTAL_STEPS = 6;
export { ONBOARDING_COMPLETED_KEY } from '../scripts/config/shared/storage.js';

/**
 * 顯示指定步驟，隱藏其他 section，並更新進度圓點的 active 狀態。
 *
 * @param {ParentNode} root - 包含 section 與 progress-dot 的 DOM 根節點
 * @param {number} step - 目標步驟（會 clamp 到 [1, TOTAL_STEPS]）
 * @returns {number} 實際套用的步驟數
 */
export function showStep(root, step) {
  const target = Math.min(Math.max(Math.trunc(step) || 1, 1), TOTAL_STEPS);
  const sections = root.querySelectorAll('section[data-step]');
  sections.forEach(section => {
    section.hidden = Number(section.dataset.step) !== target;
  });
  const dots = root.querySelectorAll('.progress-dot');
  dots.forEach(dot => {
    dot.classList.toggle('active', Number(dot.dataset.dot) === target);
  });
  return target;
}

/**
 * 讀取當前可見 section 的步驟數；無可見 section 時回傳 1。
 *
 * @param {ParentNode} root
 * @returns {number}
 */
export function getCurrentStep(root) {
  const visible = root.querySelector('section[data-step]:not([hidden])');
  if (!visible) {
    return 1;
  }
  return Number(visible.dataset.step) || 1;
}

/**
 * 前進一步；已在最後一步時保持不變。
 *
 * @param {ParentNode} root
 * @returns {number} 前進後的步驟數
 */
export function nextStep(root) {
  return showStep(root, getCurrentStep(root) + 1);
}

/**
 * 跳到最後一步（完成頁）。
 *
 * @param {ParentNode} root
 * @returns {number}
 */
export function skipToEnd(root) {
  return showStep(root, TOTAL_STEPS);
}

/**
 * 將 onboardingCompleted 寫入 storage 為 true。
 *
 * @param {{ set: (items: object) => Promise<void> }} storage
 *   chrome.storage.local 形狀的物件；caller 由頁面層注入便於測試。
 * @returns {Promise<void>}
 */
export async function markCompleted(storage) {
  await storage.set({ [ONBOARDING_COMPLETED_KEY]: true });
}

/**
 * 檢查 chrome.storage.local 是否已存在有效的 Notion OAuth token。
 *
 * @param {{ get: (key: string) => Promise<object> }} storage
 * @returns {Promise<boolean>}
 */
export async function isNotionConnected(storage) {
  const result = await storage.get('notionOAuthToken');
  return Boolean(result?.notionOAuthToken);
}

/**
 * 串起 OAuth 三步：launchWebAuthFlow → 後端交換 token → 落地 storage。
 *
 * caller 持有 UI 狀態（按鈕 loading、錯誤訊息），這裡只負責流程編排。
 * 任一步驟拋錯都會直接 reject，由 caller 處理 retry / skip。
 *
 * @returns {Promise<import('../scripts/auth/notionOAuthCompleter.js').NotionOAuthTokenData>}
 */
export async function runNotionOAuthFlow() {
  const { code, redirectUri } = await initiateNotionOAuth();
  const tokenData = await exchangeNotionOAuthCode({ code, redirectUri });
  await saveNotionOAuthToken(tokenData);
  return tokenData;
}

/**
 * 從 Notion search 回傳的 database 物件取出純文字標題；缺欄位時回傳「（未命名）」。
 *
 * @param {object} db - Notion search result item with object === 'database'
 * @returns {string}
 */
export function extractDatabaseTitle(db) {
  const titleParts = db?.title;
  if (Array.isArray(titleParts) && titleParts.length > 0) {
    const first = titleParts[0];
    return first?.plain_text || first?.text?.content || '（未命名）';
  }
  return '（未命名）';
}

/**
 * 透過 chrome.runtime.sendMessage 呼叫 SEARCH_NOTION，回傳已過濾為 database 的列表。
 *
 * @param {{ sendMessage: (message: object) => Promise<object> }} deps
 *   sendMessage 由 caller 注入；可 wrap chrome.runtime.sendMessage 並轉成 Promise。
 * @returns {Promise<Array<{ id: string, title: string }>>}
 * @throws {Error} 後端回 success: false、無 response、或 sendMessage 拋錯時
 */
export async function fetchNotionDatabases({ sendMessage }) {
  const response = await sendMessage({
    action: RUNTIME_ACTIONS.SEARCH_NOTION,
    searchParams: { filter: { property: 'object', value: 'database' } },
  });
  if (!response) {
    throw new Error('SEARCH_NOTION 沒有回傳 response');
  }
  if (!response.success) {
    throw new Error(response.error || 'SEARCH_NOTION 失敗');
  }
  const results = response.data?.results;
  if (!Array.isArray(results)) {
    return [];
  }
  return results
    .filter(item => item?.object === 'database')
    .map(db => ({ id: db.id, title: extractDatabaseTitle(db) }));
}

/**
 * 將選中的 database id 寫入 chrome.storage.local 的 notionDataSourceId。
 *
 * @param {{ storage: { set: (items: object) => Promise<void> }, dataSourceId: string }} params
 * @returns {Promise<void>}
 */
export async function selectDataSource({ storage, dataSourceId }) {
  if (typeof dataSourceId !== 'string' || !dataSourceId.trim()) {
    throw new Error('dataSourceId 不可為空');
  }
  await storage.set({ notionDataSourceId: dataSourceId });
}

/**
 * 檢查 Save to Notion 帳號功能是否啟用（feature flag）。
 *
 * @returns {boolean}
 */
export function isAccountFeatureEnabled() {
  return Boolean(BUILD_ENV.ENABLE_ACCOUNT);
}

/**
 * 檢查 chrome.storage.local 是否已有 account session（透過 accountEmail 判斷）。
 * 與 scripts/auth/accountSession.js 的 getAccountProfile() 同一語意。
 *
 * @param {{ get: (key: string) => Promise<object> }} storage
 * @returns {Promise<boolean>}
 */
export async function isAccountLoggedIn(storage) {
  const result = await storage.get('accountEmail');
  return Boolean(result?.accountEmail);
}
