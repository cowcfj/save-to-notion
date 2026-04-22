/**
 * 環境檢測與配置模組
 * 提供安全的環境檢測功能，無需依賴 window 或 document
 *
 * 注意：
 * 1. 此模組在 Content Script 和 Background Script 中都可安全使用
 * 2. 環境檢測使用 typeof 檢查，避免 ReferenceError
 * 3. 所有函數都是純函數，無副作用
 */

/* global chrome */

/**
 * 檢測當前是否為擴充功能環境
 *
 * @returns {boolean} 是否在擴充功能環境中
 */
export function isExtensionContext() {
  return Boolean(typeof chrome !== 'undefined' && chrome?.runtime?.id);
}

/**
 * 檢測當前是否為 Background Script 環境
 * Service Worker 環境通常沒有 window 對象
 *
 * @returns {boolean} 是否在 Background Script 環境中
 */
export function isBackgroundContext() {
  return isExtensionContext() && globalThis.window === undefined;
}

/**
 * 檢測當前是否為 Content Script 環境
 * Content Script 有 window 對象
 *
 * @returns {boolean} 是否在 Content Script 環境中
 */
export function isContentContext() {
  return isExtensionContext() && globalThis.window !== undefined;
}

/**
 * 檢測當前是否為 Node.js 測試環境
 *
 * @returns {boolean} 是否在 Node.js 環境中
 */
export function isNodeEnvironment() {
  return Boolean(
    typeof module !== 'undefined' && module.exports && globalThis.window === undefined
  );
}

/**
 * 檢測當前是否為開發模式
 * 通過檢查 manifest.json 的 version_name 是否包含 'dev'
 *
 * @returns {boolean} 是否為開發模式
 */
export function isDevelopment() {
  if (!isExtensionContext()) {
    return false;
  }

  try {
    const manifest = chrome.runtime.getManifest();
    const versionString = manifest.version_name || manifest.version || '';
    return /dev/i.test(versionString);
  } catch (error) {
    // Logger Bootstrap 限制：此函數在 Logger.initDebugState() 執行過程中被調用，
    // 若此處使用 Logger，將形成循環依賴。必須使用 console 作為降級輸出。
    // skipcq: JS-0002
    console.error('[環境檢測] 無法讀取 manifest:', error);
    return false;
  }
}

/**
 * 檢測當前是否為生產模式
 *
 * @returns {boolean} 是否為生產模式
 */
export function isProduction() {
  return !isDevelopment();
}

/**
 * 獲取當前環境信息
 *
 * @returns {object} 環境信息對象
 */
export function getEnvironment() {
  return {
    isExtension: isExtensionContext(),
    isBackground: isBackgroundContext(),
    isContent: isContentContext(),
    isNode: isNodeEnvironment(),
    isDevelopment: isDevelopment(),
    isProduction: isProduction(),
  };
}

/**
 * 根據環境選擇配置值
 *
 * @param {any} devValue - 開發環境值
 * @param {any} prodValue - 生產環境值
 * @returns {any} 選擇的配置值
 * @example
 * const logLevel = selectByEnvironment('DEBUG', 'WARN');
 */
export function selectByEnvironment(devValue, prodValue) {
  return isDevelopment() ? devValue : prodValue;
}

/**
 * 環境常量（只讀）
 */
export const ENV = Object.freeze({
  get IS_EXTENSION() {
    return isExtensionContext();
  },
  get IS_BACKGROUND() {
    return isBackgroundContext();
  },
  get IS_CONTENT() {
    return isContentContext();
  },
  get IS_NODE() {
    return isNodeEnvironment();
  },
  get IS_DEV() {
    return isDevelopment();
  },
  get IS_PROD() {
    return isProduction();
  },
});

// ==========================================
// 建置環境配置 (Build Environment Config)
// ==========================================

/**
 * 建置環境配置
 * 此物件為所有 OAuth 相關配置的「單一真理來源 (Single Source of Truth)」。
 * - 本地開發：由 postinstall 自動從 env.example.js 複製，預設值為 OAuth 關閉。
 * - CI/CD 生產：由 GitHub Actions 腳本基於 env.example.js 動態生成並注入 Secrets。
 *
 * @see docs/specs/BUILD_ENVIRONMENT_STRATEGY_SPEC.md
 */
export const BUILD_ENV = Object.freeze({
  // 控制 UI 是否渲染 OAuth 登入區塊，以及 AuthManager 是否啟動 OAuth 流程
  ENABLE_OAUTH: false,
  // 控制 UI 是否渲染 Cloudflare account 登入區塊
  ENABLE_ACCOUNT: false,
  // 後端 Token 代理伺服器位址（末尾不可帶斜線，否則會產生雙斜線導致 API 路由失敗）
  OAUTH_SERVER_URL: '',
  // Notion Public Integration Client ID
  OAUTH_CLIENT_ID: '',
  // 用於驗證 /refresh 請求，須與 Cloudflare Worker 的 EXTENSION_API_KEY binding 一致
  EXTENSION_API_KEY: '',
});
// Trigger release please pipeline
