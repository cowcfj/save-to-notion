/**
 * 偏好設定控制共享 Helper 模組。
 * 提供單選鈕群組 (Radio Group) 和 Notion 同步樣式值的 DOM 共享 Helper。
 */

/**
 * 儲存上一次啟用的螢光筆內容樣式所使用的儲存金鑰。
 *
 * @type {string}
 */
export const HIGHLIGHT_CONTENT_STYLE_LAST_ENABLED_KEY = 'highlightContentStyleLastEnabled';

/**
 * 啟用的螢光筆內容樣式值清單。
 *
 * @type {readonly string[]}
 */
export const HIGHLIGHT_CONTENT_STYLE_VALUES = Object.freeze(['COLOR_SYNC', 'COLOR_TEXT', 'BOLD']);

/**
 * 判斷指定的值是否為啟用的螢光筆內容樣式值。
 *
 * @param {any} value - 待檢查的值。
 * @returns {boolean} 如果是啟用的樣式值則回傳 true，否則回傳 false。
 */
export function isEnabledHighlightContentStyle(value) {
  return HIGHLIGHT_CONTENT_STYLE_VALUES.includes(value);
}

/**
 * 解析螢光筆內容樣式值，若符合啟用樣式則回傳，否則回傳預設值 'COLOR_SYNC'。
 *
 * @param {any} value - 待解析的樣式值。
 * @returns {string} 啟用的樣式值（預設為 'COLOR_SYNC'）。
 */
export function resolveEnabledHighlightContentStyle(value) {
  return isEnabledHighlightContentStyle(value) ? value : 'COLOR_SYNC';
}

/**
 * 查詢並回傳指定名稱之單選鈕群組中目前被選取的值。
 *
 * @param {string} name - 單選鈕群組的 name 屬性。
 * @returns {string|null} 目前被選取的值，若無選取則回傳 null.
 */
export function getRadioGroupValue(name) {
  return document.querySelector(`input[type="radio"][name="${name}"]:checked`)?.value ?? null;
}

/**
 * 設定指定名稱之單選鈕群組的選取狀態。
 * 如果傳入的 value 有對應的 input，則選取該 input 並回傳其值。
 * 否則嘗試使用 defaultValue 選取。
 * 若均無法選取，則回傳 null。
 *
 * @param {string} name - 單選鈕群組的 name 屬性。
 * @param {string|null|undefined} value - 欲設定的選取值。
 * @param {string} [defaultValue] - 預設的選取值（選填）。
 * @returns {string|null} 實際選取的值，若均無對應選項則回傳 null。
 */
export function setRadioGroupValue(name, value, defaultValue) {
  const nextValue = value ?? defaultValue;
  const input = document.querySelector(`input[type="radio"][name="${name}"][value="${nextValue}"]`);
  if (input) {
    input.checked = true;
    return input.value;
  }

  const fallback = document.querySelector(
    `input[type="radio"][name="${name}"][value="${defaultValue}"]`
  );
  if (fallback) {
    fallback.checked = true;
    return fallback.value;
  }

  return null;
}

/**
 * 設定指定名稱之單選鈕群組的啟用或停用狀態。
 *
 * @param {string} name - 單選鈕群組的 name 屬性。
 * @param {boolean} disabled - 是否停用（true 為停用，false 為啟用）。
 * @returns {void}
 */
export function setRadioGroupDisabled(name, disabled) {
  document.querySelectorAll(`input[type="radio"][name="${name}"]`).forEach(input => {
    input.disabled = Boolean(disabled);
  });
}
