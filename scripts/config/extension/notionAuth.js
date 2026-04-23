/**
 * Notion OAuth endpoint paths。
 *
 * 供 Background 與 extension pages 共用，
 * Content Scripts MUST NOT import 此模組。
 */

export const NOTION_OAUTH = Object.freeze({
  TOKEN_ENDPOINT: '/v1/oauth/notion/token',
  REFRESH_ENDPOINT: '/v1/oauth/notion/refresh',
});
