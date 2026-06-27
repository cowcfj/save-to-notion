/**
 * @jest-environment jsdom
 */
/**
 * optionsDestinationProfiles.test.js
 *
 * Tests for Destination profile options UI.
 */

import { sanitizeApiError } from '../../../scripts/utils/ApiErrorSanitizer.js';
import { UI_MESSAGES } from '../../../scripts/config/shared/messages.js';
import {
  flushAsyncClick,
  buildDestinationProfileDOM,
  buildChromeMock,
  buildProfileManagerMock,
} from './optionsTestHarness.js';
import {
  mockAuthManager as AuthManager,
  mockBuildEnv as BUILD_ENV,
  mockDataSourceManager as DataSourceManager,
  mockGetAccountAccessToken as getAccountAccessToken,
  mockGetAccountProfile as getAccountProfile,
  mockLogger as Logger,
  mockMigrationTool as MigrationTool,
  mockProfileManager as ProfileManager,
  mockStorageManager as StorageManager,
  mockUIManager as UIManager,
  resetOptionsBootstrapMocks,
} from './optionsBootstrapTestSetup.js';

let initOptions;

beforeAll(async () => {
  const optionsModule = await import('../../../pages/options/options.js');
  initOptions = optionsModule.initOptions;
});

function expectDestinationProfileRenderWarning(message, error, context) {
  expect(Logger.warn).toHaveBeenCalledWith(message, {
    action: 'renderDestinationProfiles',
    error: sanitizeApiError(error, context),
  });
}

async function changeProfileSwitch(profileId, checked) {
  const input = document.querySelector(`input[data-profile-id="${profileId}"]`);
  input.checked = checked;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await flushAsyncClick();
  return input;
}

async function renderDestinationProfilesWithService(service) {
  ProfileManager.mockImplementationOnce(() => service);
  initOptions();
  await flushAsyncClick();
}

async function renderDestinationProfileRenameEditor(service) {
  await renderDestinationProfilesWithService(service);
  document.querySelector('button[data-action="rename"]').click();
  await flushAsyncClick();
  return document.querySelector('input[data-role="destination-profile-name-edit"]');
}

async function expectDestinationProfilesReadFailure({
  methodName,
  error,
  renderAssertion,
  warningMessage,
  warningContext,
}) {
  const service = buildProfileManagerMock({
    [methodName]: jest.fn().mockRejectedValue(error),
  });
  await renderDestinationProfilesWithService(service);

  renderAssertion();
  expectDestinationProfileRenderWarning(warningMessage, error, warningContext);
}

describe('Destination profile options UI', () => {
  let mockUiInstance = null;

  beforeEach(() => {
    resetOptionsBootstrapMocks();
    jest.useFakeTimers();
    BUILD_ENV.ENABLE_ACCOUNT = false;
    buildDestinationProfileDOM();
    globalThis.chrome = buildChromeMock();
    mockUiInstance = { init: jest.fn(), showStatus: jest.fn() };
    UIManager.mockImplementation(() => mockUiInstance);
    AuthManager.mockImplementation(() => ({ init: jest.fn(), checkAuthStatus: jest.fn() }));
    DataSourceManager.mockImplementation(() => ({ init: jest.fn(), loadDataSources: jest.fn() }));
    StorageManager.mockImplementation(() => ({ init: jest.fn(), updateStorageUsage: jest.fn() }));
    MigrationTool.mockImplementation(() => ({ init: jest.fn() }));
    getAccountProfile.mockReset();
    getAccountAccessToken.mockReset();
    getAccountProfile.mockResolvedValue(null);
    getAccountAccessToken.mockResolvedValue(null);
    ProfileManager.mockClear();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    delete globalThis.chrome;
    BUILD_ENV.ENABLE_ACCOUNT = true;
    jest.clearAllMocks();
  });

  async function expectCreateProfileValidationFailure({
    name,
    notionDataSourceId,
    expectedStatusMessage,
    service = buildProfileManagerMock({
      createProfile: jest.fn(),
    }),
  }) {
    ProfileManager.mockImplementationOnce(() => service);
    initOptions();
    await flushAsyncClick();

    document.querySelector('#destination-profile-name').value = name;
    document.querySelector('#database-id').value = notionDataSourceId;
    document.querySelector('#add-destination-profile').click();
    await flushAsyncClick();

    expect(service.createProfile).not.toHaveBeenCalled();
    expect(mockUiInstance.showStatus).toHaveBeenCalledWith(expectedStatusMessage, 'error');
  }

  it('未登入且已達上限時，新增保存目標按鈕應 disabled 並顯示原因', async () => {
    ProfileManager.mockImplementationOnce(() => ({
      ensureMigratedDefaultProfile: jest.fn().mockResolvedValue([{ id: 'default' }]),
      listProfiles: jest.fn().mockResolvedValue([
        {
          id: 'default',
          name: 'Default',
          color: '#2563eb',
          notionDataSourceId: 'source-1',
          notionDataSourceType: 'database',
        },
      ]),
      getDestinationEntitlement: jest.fn().mockResolvedValue({
        maxProfiles: 1,
        accountSignedIn: false,
        source: 'test',
      }),
      getProfile: jest.fn().mockResolvedValue({
        id: 'default',
        name: 'Default',
        notionDataSourceId: 'source-1',
        notionDataSourceType: 'database',
      }),
      updateProfile: jest.fn(),
      createProfile: jest.fn(),
      deleteProfile: jest.fn(),
    }));

    initOptions();
    await flushAsyncClick();

    const addButton = document.querySelector('#add-destination-profile');
    const status = document.querySelector('#destination-profile-status');
    expect(addButton.disabled).toBe(true);
    expect(addButton.getAttribute('aria-describedby')).toBe('destination-profile-status');
    expect(addButton.title).toBe(UI_MESSAGES.OPTIONS.DESTINATION.LIMIT_ACCOUNT_SIGN_IN);
    expect(status.textContent).toBe(UI_MESSAGES.OPTIONS.DESTINATION.LIMIT_ACCOUNT_SIGN_IN);
  });

  it('render 應在 entitlement 讀取失敗時仍渲染 profiles 並記錄警告', async () => {
    const entitlementError = new Error('entitlement failed');
    expect.hasAssertions();

    await expectDestinationProfilesReadFailure({
      methodName: 'getDestinationEntitlement',
      error: entitlementError,
      renderAssertion: () => {
        expect(document.querySelector('.destination-profile-title').textContent).toBe('Default');
      },
      warningMessage: '讀取保存目標權限失敗',
      warningContext: 'destinationProfileEntitlement',
    });
  });

  it('render 應在 profile list 讀取失敗時使用空列表並記錄警告', async () => {
    const listError = new Error('list failed');
    expect.hasAssertions();

    await expectDestinationProfilesReadFailure({
      methodName: 'listProfiles',
      error: listError,
      renderAssertion: () => {
        expect(document.querySelector('.destination-profile-row')).toBeNull();
      },
      warningMessage: '讀取保存目標列表失敗',
      warningContext: 'destinationProfileList',
    });
  });

  it('已達付費方案上限時應顯示付費方案提示', async () => {
    const profiles = [
      {
        id: 'default',
        name: 'Default',
        color: '#2563eb',
        notionDataSourceId: 'source-1',
        notionDataSourceType: 'database',
      },
      {
        id: 'profile-2',
        name: 'Second',
        color: '#7c3aed',
        notionDataSourceId: 'source-2',
        notionDataSourceType: 'page',
      },
    ];
    const service = buildProfileManagerMock({
      profiles,
      getDestinationEntitlement: jest.fn().mockResolvedValue({
        maxProfiles: 2,
        accountSignedIn: true,
        source: 'test',
      }),
    });
    ProfileManager.mockImplementationOnce(() => service);

    initOptions();
    await flushAsyncClick();

    const addButton = document.querySelector('#add-destination-profile');
    const status = document.querySelector('#destination-profile-status');
    expect(addButton.disabled).toBe(true);
    expect(addButton.title).toBe(UI_MESSAGES.OPTIONS.DESTINATION.LIMIT_PAID_PLAN);
    expect(status.textContent).toBe(UI_MESSAGES.OPTIONS.DESTINATION.LIMIT_PAID_PLAN);
  });

  it('點擊保存目標列表非按鈕元素時不應呼叫 action service', async () => {
    const service = buildProfileManagerMock();
    ProfileManager.mockImplementationOnce(() => service);

    initOptions();
    await flushAsyncClick();

    document.querySelector('.destination-profile-title').click();
    await flushAsyncClick();

    expect(service.getProfile).not.toHaveBeenCalled();
    expect(service.updateProfile).not.toHaveBeenCalled();
    expect(service.deleteProfile).not.toHaveBeenCalled();
  });

  it('只有一個保存目標時不應渲染刪除按鈕', async () => {
    const service = buildProfileManagerMock();
    ProfileManager.mockImplementationOnce(() => service);

    initOptions();
    await flushAsyncClick();

    expect(document.querySelector('button[data-action="delete"]')).toBeNull();
  });

  it('重新命名保存目標時應 trim 名稱並呼叫 updateProfile', async () => {
    const service = buildProfileManagerMock({
      updateProfile: jest.fn().mockResolvedValue({ id: 'default', name: 'Inbox' }),
    });

    const input = await renderDestinationProfileRenameEditor(service);
    input.value = '  Inbox  ';
    document.querySelector('button[data-action="save-name"]').click();
    await flushAsyncClick();

    expect(service.updateProfile).toHaveBeenCalledWith('default', { name: 'Inbox' });
  });

  it('取消重新命名保存目標時應回復顯示模式且不呼叫 updateProfile', async () => {
    const service = buildProfileManagerMock();
    ProfileManager.mockImplementationOnce(() => service);

    initOptions();
    await flushAsyncClick();

    document.querySelector('button[data-action="rename"]').click();
    await flushAsyncClick();
    expect(
      document.querySelector('input[data-role="destination-profile-name-edit"]')
    ).not.toBeNull();

    document.querySelector('button[data-action="cancel-name"]').click();
    await flushAsyncClick();

    expect(service.updateProfile).not.toHaveBeenCalled();
    expect(document.querySelector('input[data-role="destination-profile-name-edit"]')).toBeNull();
    expect(document.querySelector('.destination-profile-title').textContent).toBe('Default');
  });

  it('重新命名保存目標為空白時應顯示錯誤且不呼叫 updateProfile', async () => {
    const service = buildProfileManagerMock({
      updateProfile: jest.fn(),
    });

    const input = await renderDestinationProfileRenameEditor(service);
    input.value = '   ';
    document.querySelector('button[data-action="save-name"]').click();
    await flushAsyncClick();

    expect(service.updateProfile).not.toHaveBeenCalled();
    expect(mockUiInstance.showStatus).toHaveBeenCalledWith(
      expect.stringContaining('名稱'),
      'error'
    );
  });

  it('新增保存目標超過上限時應顯示錯誤且保留輸入', async () => {
    const service = {
      ensureMigratedDefaultProfile: jest.fn().mockResolvedValue([{ id: 'default' }]),
      listProfiles: jest.fn().mockResolvedValue([
        {
          id: 'default',
          name: 'Default',
          color: '#2563eb',
          notionDataSourceId: 'source-1',
          notionDataSourceType: 'database',
        },
      ]),
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
      createProfile: jest.fn().mockRejectedValue(
        Object.assign(new Error('Storage layer translated message'), {
          code: 'DESTINATION_LIMIT_REACHED',
        })
      ),
      deleteProfile: jest.fn(),
    };
    ProfileManager.mockImplementationOnce(() => service);

    initOptions();
    await flushAsyncClick();

    const nameInput = document.querySelector('#destination-profile-name');
    nameInput.value = '  Team Inbox  ';
    document.querySelector('#add-destination-profile').click();
    await flushAsyncClick();

    expect(service.createProfile).toHaveBeenCalledWith({
      name: 'Team Inbox',
      notionDataSourceId: 'a1b2c3d4e5f67890abcdef1234567890',
      notionDataSourceType: 'page',
    });
    expect(mockUiInstance.showStatus).toHaveBeenCalledWith(
      UI_MESSAGES.OPTIONS.DESTINATION.CREATE_LIMIT_REACHED,
      'error'
    );
    expect(nameInput.value).toBe('  Team Inbox  ');
  });

  it('新增保存目標上游只回傳舊版中文 message 時應顯示通用錯誤', async () => {
    const service = buildProfileManagerMock({
      createProfile: jest.fn().mockRejectedValue(new Error('已達目的地數量上限')),
    });
    ProfileManager.mockImplementationOnce(() => service);

    initOptions();
    await flushAsyncClick();

    const nameInput = document.querySelector('#destination-profile-name');
    nameInput.value = '  Team Inbox  ';
    document.querySelector('#add-destination-profile').click();
    await flushAsyncClick();

    expect(mockUiInstance.showStatus).toHaveBeenCalledWith(
      UI_MESSAGES.OPTIONS.DESTINATION.CREATE_FAILED,
      'error'
    );
  });

  it('新增保存目標遇到一般錯誤時應顯示通用錯誤且記錄警告', async () => {
    const createError = new Error('Storage unavailable');
    const service = buildProfileManagerMock({
      createProfile: jest.fn().mockRejectedValue(createError),
    });
    ProfileManager.mockImplementationOnce(() => service);

    initOptions();
    await flushAsyncClick();

    const nameInput = document.querySelector('#destination-profile-name');
    nameInput.value = '  Team Inbox  ';
    document.querySelector('#add-destination-profile').click();
    await flushAsyncClick();

    expect(Logger.warn).toHaveBeenCalledWith('新增保存目標失敗', {
      action: 'createDestinationProfile',
      error: sanitizeApiError(createError, 'createDestinationProfile'),
    });
    expect(Logger.warn).not.toHaveBeenCalledWith(
      '新增保存目標失敗',
      expect.objectContaining({ error: createError })
    );
    expect(mockUiInstance.showStatus).toHaveBeenCalledWith(
      UI_MESSAGES.OPTIONS.DESTINATION.CREATE_FAILED,
      'error'
    );
    expect(nameInput.value).toBe('  Team Inbox  ');
  });

  it('新增保存目標時若 Notion ID 無效應顯示錯誤且不呼叫 createProfile', async () => {
    expect.hasAssertions();

    await expectCreateProfileValidationFailure({
      name: 'Work',
      notionDataSourceId: 'invalid',
      expectedStatusMessage: expect.stringContaining('ID 格式無效'),
    });
  });

  it('新增保存目標成功時應清空名稱輸入並重新渲染列表', async () => {
    const service = buildProfileManagerMock();
    ProfileManager.mockImplementationOnce(() => service);

    initOptions();
    await flushAsyncClick();

    const nameInput = document.querySelector('#destination-profile-name');
    nameInput.value = '  Database Inbox  ';
    document.querySelector('#database-type').value = 'database';
    document.querySelector('#add-destination-profile').click();
    await flushAsyncClick();

    expect(service.createProfile).toHaveBeenCalledWith({
      name: 'Database Inbox',
      notionDataSourceId: 'a1b2c3d4e5f67890abcdef1234567890',
      notionDataSourceType: 'database',
    });
    expect(nameInput.value).toBe('');
    expect(service.listProfiles).toHaveBeenCalledTimes(2);
  });

  it('新增保存目標名稱為空白時應顯示錯誤且不呼叫 createProfile', async () => {
    expect.hasAssertions();

    await expectCreateProfileValidationFailure({
      name: '   ',
      notionDataSourceId: 'a1b2c3d4e5f67890abcdef1234567890',
      expectedStatusMessage: UI_MESSAGES.OPTIONS.DESTINATION.PROFILE_NAME_REQUIRED,
    });
  });

  it('新增保存目標成功後不應自動啟用該保存目標', async () => {
    const service = buildProfileManagerMock({
      createProfile: jest.fn().mockResolvedValue({ id: 'profile-2' }),
      setActiveProfile: jest.fn(),
    });
    ProfileManager.mockImplementationOnce(() => service);

    initOptions();
    await flushAsyncClick();

    document.querySelector('#destination-profile-name').value = 'Research';
    document.querySelector('#database-id').value = 'a1b2c3d4e5f67890abcdef1234567890';
    document.querySelector('#database-type').value = 'database';
    document.querySelector('#add-destination-profile').click();
    await flushAsyncClick();

    expect(service.createProfile).toHaveBeenCalledWith({
      name: 'Research',
      notionDataSourceId: 'a1b2c3d4e5f67890abcdef1234567890',
      notionDataSourceType: 'database',
    });
    expect(service.setActiveProfile).not.toHaveBeenCalled();
  });

  it('保存目標啟用開關與刪除按鈕應呼叫對應 service flow', async () => {
    const profiles = [
      {
        id: 'default',
        name: 'Default',
        color: '#2563eb',
        notionDataSourceId: 'source-1',
        notionDataSourceType: 'database',
      },
      {
        id: 'profile-2',
        name: 'Second',
        color: '#7c3aed',
        notionDataSourceId: 'target-page-id',
        notionDataSourceType: 'page',
      },
    ];
    const service = buildProfileManagerMock({
      profiles,
      getProfile: jest.fn().mockResolvedValue({
        id: 'profile-2',
        name: 'Second',
        notionDataSourceId: 'target-page-id',
        notionDataSourceType: 'page',
      }),
    });
    ProfileManager.mockImplementationOnce(() => service);

    initOptions();
    await flushAsyncClick();

    const input = document.querySelector('input[data-profile-id="profile-2"]');
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncClick();

    expect(service.setActiveProfile).toHaveBeenCalledWith('profile-2');
    expect(mockUiInstance.showStatus).toHaveBeenCalledWith(
      UI_MESSAGES.OPTIONS.DESTINATION.ACTIVATED('Second'),
      'success'
    );

    document.querySelector('button[data-action="delete"][data-profile-id="profile-2"]').click();
    await flushAsyncClick();

    expect(service.deleteProfile).toHaveBeenCalledWith('profile-2');
    expect(service.listProfiles).toHaveBeenCalledTimes(3);
  });

  it('刪除保存目標失敗時應顯示錯誤而不是留下 unhandled rejection', async () => {
    const profiles = [
      {
        id: 'default',
        name: 'Default',
        color: '#2563eb',
        notionDataSourceId: 'source-1',
        notionDataSourceType: 'database',
      },
      {
        id: 'profile-2',
        name: 'Second',
        color: '#7c3aed',
        notionDataSourceId: 'source-2',
        notionDataSourceType: 'page',
      },
    ];
    const deleteError = new Error('delete failed');
    const service = buildProfileManagerMock({
      profiles,
      deleteProfile: jest.fn().mockRejectedValue(deleteError),
    });
    ProfileManager.mockImplementationOnce(() => service);

    initOptions();
    await flushAsyncClick();

    document.querySelector('button[data-action="delete"][data-profile-id="profile-2"]').click();
    await flushAsyncClick();

    expect(mockUiInstance.showStatus).toHaveBeenCalledWith(
      UI_MESSAGES.OPTIONS.DESTINATION.ACTION_FAILED,
      'error'
    );
    expect(Logger.warn).toHaveBeenCalledWith('保存目標操作失敗', {
      action: 'destinationProfileAction',
      error: sanitizeApiError(deleteError, 'destinationProfileAction'),
    });
  });

  it('保存目標 action 失敗時應走 unified destinationProfileAction 錯誤路徑', async () => {
    const renameError = new Error('get profile failed');
    const service = buildProfileManagerMock({
      getProfile: jest.fn().mockRejectedValue(renameError),
    });
    ProfileManager.mockImplementationOnce(() => service);

    initOptions();
    await flushAsyncClick();

    document.querySelector('button[data-action="rename"]').click();
    await flushAsyncClick();

    expect(mockUiInstance.showStatus).toHaveBeenCalledWith(
      UI_MESSAGES.OPTIONS.DESTINATION.ACTION_FAILED,
      'error'
    );
    expect(Logger.warn).toHaveBeenCalledWith('保存目標操作失敗', {
      action: 'destinationProfileAction',
      error: sanitizeApiError(renameError, 'destinationProfileAction'),
    });
  });

  describe('destination profile radio-as-switch', () => {
    const twoProfiles = [
      {
        id: 'default',
        name: 'Default',
        color: '#2563eb',
        notionDataSourceId: 'A',
        notionDataSourceType: 'database',
      },
      {
        id: 'p2',
        name: 'Second',
        color: '#16a34a',
        notionDataSourceId: 'B',
        notionDataSourceType: 'page',
      },
    ];

    async function renderDestinationSwitchesWithSecondProfileActive() {
      const service = buildProfileManagerMock({ profiles: twoProfiles });
      service.getActiveProfile.mockResolvedValue(twoProfiles[1]); // p2 active
      await renderDestinationProfilesWithService(service);
      return service;
    }

    it('renders one radio input per profile inside role=radio rows', async () => {
      const service = buildProfileManagerMock({ profiles: twoProfiles });
      await renderDestinationProfilesWithService(service);
      expect(document.querySelectorAll('input[name="active-destination"]')).toHaveLength(2);
      expect(document.querySelectorAll('.destination-profile-row[role="radio"]')).toHaveLength(2);
    });

    it('checks the row matching activeProfileId', async () => {
      await renderDestinationSwitchesWithSecondProfileActive();
      const checked = document.querySelector('input[name="active-destination"]:checked');
      expect(checked.dataset.profileId).toBe('p2');
    });

    it('calls setActiveProfile when a non-active switch is toggled on', async () => {
      const service = await renderDestinationSwitchesWithSecondProfileActive();

      await changeProfileSwitch('default', true);

      expect(service.setActiveProfile).toHaveBeenCalledWith('default');
    });

    it('ignores clicks on the currently active switch', async () => {
      const service = await renderDestinationSwitchesWithSecondProfileActive();
      const activeInput = document.querySelector('input[data-profile-id="p2"]');

      activeInput.click();
      await flushAsyncClick();

      expect(activeInput.checked).toBe(true);
      expect(service.setActiveProfile).not.toHaveBeenCalled();
    });

    it('delegates deletion to service.deleteProfile without reassigning at the UI layer', async () => {
      const profiles = [
        {
          id: 'default',
          name: 'Default',
          notionDataSourceId: 'A',
          notionDataSourceType: 'database',
        },
        { id: 'p2', name: 'Second', notionDataSourceId: 'B', notionDataSourceType: 'page' },
      ];
      const service = buildProfileManagerMock({ profiles });
      service.getActiveProfile.mockResolvedValue(profiles[1]); // p2 active
      service.deleteProfile.mockResolvedValue([profiles[0]]); // 刪 p2 後剩 default
      await renderDestinationProfilesWithService(service);

      document.querySelector('button[data-action="delete"][data-profile-id="p2"]').click();
      await flushAsyncClick();

      expect(service.deleteProfile).toHaveBeenCalledWith('p2');
      expect(service.setActiveProfile).not.toHaveBeenCalled();
    });
  });
});
