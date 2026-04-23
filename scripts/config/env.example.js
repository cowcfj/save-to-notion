/**
 * 環境配置範本 Façade
 * 保持向後相容：匯出 runtime 偵測函數 + BUILD_ENV 範本值
 * 供測試與 postinstall 流程使用
 */

export * from './env/runtime.js';
export * from './env/build.example.js';
