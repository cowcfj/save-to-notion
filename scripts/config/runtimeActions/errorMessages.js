/**
 * Content-safe runtime 錯誤訊息
 *
 * 供 content/highlighter 路徑直接引用，避免把完整 aggregate action registry 打進 bundle。
 */
export const RUNTIME_ERROR_MESSAGES = Object.freeze({
  EXTENSION_UNAVAILABLE: '無法連接擴展',
  FLOATING_RAIL_NOT_INITIALIZED: '浮動側欄尚未初始化',
  FLOATING_RAIL_INIT_FAILED: '浮動側欄初始化失敗',
  FLOATING_RAIL_SHOW_METHOD_MISSING: '浮動側欄缺少 show() 方法',
  FLOATING_RAIL_ACTIVATE_METHOD_MISSING: '浮動側欄缺少 activateHighlighting() 方法',
  FLOATING_RAIL_ACTION_FAILED: '浮動側欄操作失敗',
});
