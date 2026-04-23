/**
 * Auth & Account Actions
 */

/**
 * @typedef {object} OAuthSuccessRequest
 * @property {'oauth_success'} action
 */

/**
 * @typedef {object} OAuthSuccessResponse
 * @property {boolean} [success]
 */

/**
 * @typedef {object} OAuthFailedRequest
 * @property {'oauth_failed'} action
 */

/**
 * @typedef {object} OAuthFailedResponse
 * @property {boolean} [success]
 */

/**
 * @typedef {object} AccountSessionUpdatedRequest
 * @property {'account_session_updated'} action
 * @property {string} userId
 * @property {string} email
 */

/**
 * @typedef {object} AccountSessionUpdatedResponse
 * @property {boolean} [success]
 */

/**
 * @typedef {object} AccountSessionClearedRequest
 * @property {'account_session_cleared'} action
 */

/**
 * @typedef {object} AccountSessionClearedResponse
 * @property {boolean} [success]
 */

export const AUTH_ACTIONS = {
  /**
   * Request: {@link OAuthSuccessRequest}
   * Response: {@link OAuthSuccessResponse}
   *
   * @type {OAuthSuccessRequest['action']}
   */
  OAUTH_SUCCESS: 'oauth_success',
  /**
   * Request: {@link OAuthFailedRequest}
   * Response: {@link OAuthFailedResponse}
   *
   * @type {OAuthFailedRequest['action']}
   */
  OAUTH_FAILED: 'oauth_failed',
  REFRESH_OAUTH_TOKEN: 'refreshOAuthToken',
  /**
   * Request: {@link AccountSessionUpdatedRequest}
   * Response: {@link AccountSessionUpdatedResponse}
   *
   * @type {AccountSessionUpdatedRequest['action']}
   */
  ACCOUNT_SESSION_UPDATED: 'account_session_updated',
  /**
   * Request: {@link AccountSessionClearedRequest}
   * Response: {@link AccountSessionClearedResponse}
   *
   * @type {AccountSessionClearedRequest['action']}
   */
  ACCOUNT_SESSION_CLEARED: 'account_session_cleared',
};
