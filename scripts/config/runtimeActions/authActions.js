/**
 * Authentication 專用 runtime actions.
 *
 * Wire values MUST stay aligned with scripts/background/handlers/notionHandlers.js
 * and pages/options/accountUI.js.
 */
export const AUTH_ACTIONS = Object.freeze({
  OAUTH_SUCCESS: 'oauth_success',
  OAUTH_FAILED: 'oauth_failed',
  REFRESH_OAUTH_TOKEN: 'refreshOAuthToken',
  ACCOUNT_SESSION_UPDATED: 'account_session_updated',
  ACCOUNT_SESSION_CLEARED: 'account_session_cleared',
});
