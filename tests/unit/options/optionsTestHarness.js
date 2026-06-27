/**
 * Options unit-test helpers that must run inside the tests/unit/options ESM boundary.
 */

export function appendSaveFormFields() {
  document.body.innerHTML += `
    <input id="api-key" value="key_123" />
    <input id="database-id" value="a1b2c3d4e5f67890abcdef1234567890" />
    <input id="title-template" value="{title}" />
    <input type="checkbox" id="add-source" checked />
    <input type="checkbox" id="add-timestamp" />
    <input id="database-type" value="database" />
  `;
}

export async function flushAsyncClick() {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
  }
}

export async function waitForLoggerWarn(Logger, message) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await Promise.resolve();
    const call = Logger.warn.mock.calls.find(([loggedMessage]) => loggedMessage === message);
    if (call) {
      return call;
    }
  }
  return null;
}

export function buildOptionsShellDOM(extraMarkup = '') {
  document.body.innerHTML = `
    <div id="app-version"></div>
    ${extraMarkup}
  `;
}

export function buildNavigationDOM({ activeSection = 'general', includeAdvanced = true } = {}) {
  let markup = `
    <div id="app-version"></div>
    <div class="nav-links">
      <button class="nav-item ${activeSection === 'general' ? 'active' : ''}" data-section="general" id="tab-general" aria-selected="${activeSection === 'general' ? 'true' : 'false'}"></button>
  `;
  if (includeAdvanced) {
    markup += `
      <button id="tab-advanced" class="nav-item ${activeSection === 'advanced' ? 'active' : ''}" data-section="advanced" aria-selected="${activeSection === 'advanced' ? 'true' : 'false'}"></button>
    `;
  }
  markup += `
    </div>
    <section id="section-general" class="settings-section ${activeSection === 'general' ? 'active' : ''}" aria-hidden="${activeSection === 'general' ? 'false' : 'true'}"></section>
  `;
  if (includeAdvanced) {
    markup += `
      <section id="section-advanced" class="settings-section ${activeSection === 'advanced' ? 'active' : ''}" aria-hidden="${activeSection === 'advanced' ? 'false' : 'true'}"></section>
    `;
  }
  document.body.innerHTML = markup;
}

export function buildAccountCardDOM() {
  document.body.innerHTML = `
    <div id="app-version"></div>
    <div class="nav-links">
      <button class="nav-item" data-section="general" id="tab-general"></button>
      <button id="tab-advanced" class="nav-item" data-section="advanced"></button>
    </div>
    <div id="section-general" class="settings-section"></div>
    <div id="section-advanced" class="settings-section">
      <div id="account-card" style="display: none">
        <div id="account-logged-out"></div>
        <div id="account-logged-in" style="display: none">
          <span id="profile-display-name"></span>
          <span id="profile-email"></span>
          <img id="profile-avatar-img" />
          <div id="profile-avatar-fallback"></div>
        </div>
        <button id="account-login-button"></button>
        <button id="account-logout-button"></button>
        <p id="account-status" class="status-message"></p>
      </div>
      <div id="cloud-sync-card" class="card locked-feature" style="display: none">
        <div id="drive-state-logged-out" style="display: none">
          <p id="drive-logged-out-description"></p>
          <button id="drive-login-prompt-button" type="button"></button>
        </div>
        <div id="drive-state-disconnected" style="display: none">
          <button id="drive-connect-button" type="button"></button>
        </div>
        <div id="drive-state-connected" style="display: none">
          <div id="drive-connected-email"></div>
          <div id="drive-last-upload-text"></div>
          <select id="drive-frequency-select"></select>
          <output id="drive-auto-sync-status">
            <span id="drive-auto-sync-status-text"></span>
          </output>
          <button id="drive-upload-button" type="button"></button>
          <button id="drive-download-button" type="button"></button>
          <button id="drive-disconnect-button" type="button"></button>
        </div>
        <div id="drive-state-conflict" style="display: none">
          <button id="drive-conflict-download-button" type="button"></button>
          <button id="drive-conflict-force-upload-button" type="button"></button>
        </div>
        <div id="drive-error-banner" style="display: none">
          <div id="drive-error-code"></div>
          <div id="drive-error-time"></div>
        </div>
        <p id="drive-source-warning" hidden></p>
        <div id="drive-loading-overlay" style="display: none">
          <div id="drive-loading-text"></div>
        </div>
        <p id="drive-sync-status" class="status-message"></p>
      </div>
      <div id="ai-assistant-card" class="card locked-feature"><span class="locked-message"></span></div>
    </div>
  `;
}

export function buildChromeMock(overrides = {}) {
  const getEmptySyncStorage = jest.fn((_keys, cb) => {
    const result = {};
    cb?.(result);
    return Promise.resolve(result);
  });

  return {
    runtime: {
      id: 'ext_id_123',
      onMessage: { addListener: jest.fn() },
      sendMessage: jest.fn().mockResolvedValue(),
      getManifest: jest.fn(() => ({ version: '1.0.0' })),
    },
    storage: {
      local: { get: jest.fn().mockResolvedValue({}), remove: jest.fn().mockResolvedValue() },
      sync: {
        get: getEmptySyncStorage,
        set: jest.fn(),
        remove: jest.fn().mockResolvedValue(),
      },
    },
    tabs: { create: jest.fn() },
    ...overrides,
  };
}

export function buildDestinationProfileDOM() {
  document.body.innerHTML = `
    <div id="app-version"></div>
    <button class="nav-item" data-section="general"></button>
    <div id="section-general" class="settings-section"></div>
    <input id="database-id" value="a1b2c3d4e5f67890abcdef1234567890" />
    <input id="database-type" value="page" />
    <input id="destination-profile-name" value="" />
    <div id="destination-profile-list"></div>
    <button id="add-destination-profile" type="button"></button>
    <p id="destination-profile-status" class="help-text"></p>
  `;
}

export function buildProfileManagerMock(overrides = {}) {
  const profiles = overrides.profiles || [
    {
      id: 'default',
      name: 'Default',
      color: '#2563eb',
      notionDataSourceId: 'source-1',
      notionDataSourceType: 'database',
    },
  ];

  return {
    ensureMigratedDefaultProfile: jest.fn().mockResolvedValue(profiles),
    listProfiles: jest.fn().mockResolvedValue(profiles),
    getDestinationEntitlement: jest.fn().mockResolvedValue({
      maxProfiles: 2,
      accountSignedIn: true,
      source: 'test',
    }),
    getProfile: jest.fn().mockResolvedValue({
      id: 'default',
      name: 'Default',
      notionDataSourceId: 'source-1',
      notionDataSourceType: 'database',
    }),
    updateProfile: jest.fn(),
    createProfile: jest.fn().mockResolvedValue({ id: 'profile-2' }),
    getActiveProfile: jest.fn().mockResolvedValue(profiles[0]),
    setActiveProfile: jest.fn().mockResolvedValue(profiles[0]),
    deleteProfile: jest.fn().mockResolvedValue(profiles),
    ...overrides,
  };
}

export async function clickAndFlush(selector) {
  const el = document.querySelector(selector);
  if (el) {
    el.click();
  }
  await flushAsyncClick();
}

export function mockSignedInAccountProfile(
  getAccountAccessToken,
  getAccountProfile,
  overrides = {}
) {
  getAccountAccessToken.mockResolvedValue('token_123');
  getAccountProfile.mockResolvedValue({
    displayName: 'Test User',
    email: 'user@example.com',
    avatarUrl: 'https://avatar.test',
    ...overrides,
  });
}

export function buildOptionsPreferenceDOM() {
  document.body.innerHTML = `
    <div id="app-version"></div>
    <button class="nav-item" data-section="general"></button>
    <section id="section-general" class="settings-section"></section>
    <p id="status" class="status-message"></p>
    <button id="preview-template"></button>
    <input id="title-template" value="{title}" />
    <button id="save-title-template-button"></button>
    <div id="template-preview"></div>
    <p id="template-status" class="status-message"></p>
    <fieldset id="ui-zoom-level-group">
      <input type="radio" name="uiZoomLevel" value="1" checked />
      <input type="radio" name="uiZoomLevel" value="1.1" />
    </fieldset>
    <input id="floating-rail-enabled" type="checkbox" role="switch" aria-checked="true" checked />
    <fieldset id="floating-rail-position-group">
      <input type="radio" name="floatingRailPosition" value="top" />
      <input type="radio" name="floatingRailPosition" value="middle" checked />
      <input type="radio" name="floatingRailPosition" value="bottom" />
    </fieldset>
    <fieldset id="floating-rail-size-group">
      <input type="radio" name="floatingRailSize" value="large" checked />
      <input type="radio" name="floatingRailSize" value="small" />
    </fieldset>
    <input id="add-source" type="checkbox" role="switch" aria-checked="true" checked />
    <input id="add-timestamp" type="checkbox" role="switch" aria-checked="true" checked />
    <fieldset id="highlight-style-group">
      <input type="radio" name="highlightStyle" value="background" checked />
      <input type="radio" name="highlightStyle" value="text" />
      <input type="radio" name="highlightStyle" value="underline" />
    </fieldset>
    <input id="highlight-content-style-enabled" type="checkbox" role="switch" aria-checked="true" checked />
    <fieldset id="highlight-content-style-group">
      <input type="radio" name="highlightContentStyle" value="COLOR_SYNC" checked />
      <input type="radio" name="highlightContentStyle" value="COLOR_TEXT" />
      <input type="radio" name="highlightContentStyle" value="BOLD" />
    </fieldset>
  `;
}
