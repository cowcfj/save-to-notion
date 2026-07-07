/**
 * Runtime 環境檢測模組
 * 提供安全的環境檢測功能，無需依賴 window 或 document
 *
 * 注意：
 * 1. 此模組在 Content Script 和 Background Script 中都可安全使用
 * 2. 環境檢測使用 typeof 檢查，避免 ReferenceError
 * 3. isDevelopment() 使用模組層級快取以減少重複 manifest 讀取
 */

/* global chrome */

let _cachedIsDevelopment = null;
let _cachedRuntimeId = null;
let _cachedManifestReader = null;

function resolveExtensionOrigin() {
  const extensionBaseUrl = chrome?.runtime?.getURL?.('');
  if (!extensionBaseUrl) {
    return null;
  }

  try {
    return new URL(extensionBaseUrl).origin;
  } catch {
    return null;
  }
}

function resolveCurrentOrigin() {
  const currentOrigin = globalThis.location?.origin;
  return typeof currentOrigin === 'string' && currentOrigin.length > 0 ? currentOrigin : null;
}

function resolveRuntimeCacheInputs() {
  const runtime = typeof chrome === 'undefined' ? null : chrome?.runtime;
  return {
    runtimeId: runtime?.id ?? null,
    manifestReader: runtime?.getManifest ?? null,
  };
}

function isDevelopmentCacheValid(runtimeId, manifestReader) {
  return (
    _cachedIsDevelopment !== null &&
    runtimeId === _cachedRuntimeId &&
    manifestReader === _cachedManifestReader
  );
}

function cacheDevelopmentResult(isDevelopmentValue, runtimeId, manifestReader) {
  _cachedIsDevelopment = isDevelopmentValue;
  _cachedRuntimeId = runtimeId;
  _cachedManifestReader = manifestReader;
  return _cachedIsDevelopment;
}

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
 * 僅在具備 DOM 且當前頁面來源不同於 extension origin 時返回 true
 *
 * @returns {boolean} 是否在 Content Script 環境中
 */
export function isContentContext() {
  if (!isExtensionContext() || globalThis.window === undefined) {
    return false;
  }

  const protocol = globalThis.location?.protocol;
  if (protocol === 'chrome-extension:') {
    return false;
  }

  const extensionOrigin = resolveExtensionOrigin();
  const currentOrigin = resolveCurrentOrigin();
  return extensionOrigin && currentOrigin ? currentOrigin !== extensionOrigin : true;
}

/**
 * 檢測當前是否具備 CommonJS 模組語意（非完整 Node.js runtime 判斷）
 * 條件：typeof module !== 'undefined'、module.exports 存在且 globalThis.window 不存在
 *
 * @returns {boolean} 是否為 CommonJS-like 環境
 */
export function isCommonJSEnvironment() {
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
  const { runtimeId, manifestReader } = resolveRuntimeCacheInputs();
  if (isDevelopmentCacheValid(runtimeId, manifestReader)) {
    return _cachedIsDevelopment;
  }

  if (!isExtensionContext()) {
    return cacheDevelopmentResult(false, runtimeId, manifestReader);
  }

  try {
    const manifest = chrome.runtime.getManifest();
    const versionString = manifest.version_name || manifest.version || '';
    return cacheDevelopmentResult(/dev/i.test(versionString), runtimeId, manifestReader);
  } catch (error) {
    // Logger Bootstrap 限制：此函數在 Logger.initDebugState() 執行過程中被調用，
    // 若此處使用 Logger，將形成循環依賴。必須使用 console 作為降級輸出。
    // skipcq: JS-0002
    console.error('[環境檢測] 無法讀取 manifest:', error);
    return cacheDevelopmentResult(false, runtimeId, manifestReader);
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
    isCommonJS: isCommonJSEnvironment(),
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
  get IS_COMMONJS() {
    return isCommonJSEnvironment();
  },
  get IS_DEV() {
    return isDevelopment();
  },
  get IS_PROD() {
    return isProduction();
  },
});
