/**
 * Content-safe runtime 錯誤訊息
 *
 * 供 content/highlighter 路徑直接引用，避免把完整 aggregate action registry 打進 bundle。
 */
export const RUNTIME_ERROR_MESSAGES = Object.freeze({
  EXTENSION_UNAVAILABLE: '無法連接擴展',
});
