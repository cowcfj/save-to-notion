/**
 * Sidepanel Actions
 */

/**
 * @typedef {object} OpenSidePanelRequest
 * @property {'OPEN_SIDE_PANEL'} action
 * @property {number} [tabId]
 */

/**
 * @typedef {object} OpenSidePanelResponse
 * @property {boolean} success
 * @property {string} [error]
 */

export const SIDEPANEL_ACTIONS = {
  /**
   * Request: {@link OpenSidePanelRequest}
   * Response: {@link OpenSidePanelResponse}
   *
   * @type {OpenSidePanelRequest['action']}
   */
  OPEN_SIDE_PANEL: 'OPEN_SIDE_PANEL',
};
