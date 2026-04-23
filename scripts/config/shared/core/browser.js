/**
 * 瀏覽器限制配置
 * 受限協議列表（擴展無法注入腳本的頁面）
 * 用於 InjectionService 和 saveHandlers 的前置檢查
 */

export const RESTRICTED_PROTOCOLS = [
  'chrome:',
  'edge:',
  'about:',
  'data:',
  'chrome-extension:',
  'view-source:',
  'file:',
];
