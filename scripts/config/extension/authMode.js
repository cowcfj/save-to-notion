/**
 * 認證模式枚舉。
 *
 * 供 Background 與 extension pages 共用，
 * Content Scripts MUST NOT import 此模組。
 */
export const AuthMode = Object.freeze({
  OAUTH: 'oauth',
  MANUAL: 'manual',
});
