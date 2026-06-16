/**
 * optionsDestinationProfiles.test.js
 *
 * Tests for Destination profile options UI.
 */

import { initOptions } from '../../../pages/options/options.js';
import { UIManager } from '../../../pages/options/UIManager.js';
import { AuthManager } from '../../../pages/options/AuthManager.js';
import { DataSourceManager } from '../../../pages/options/DataSourceManager.js';
import { StorageManager } from '../../../pages/options/StorageManager.js';
import { MigrationTool } from '../../../pages/options/MigrationTool.js';
import { BUILD_ENV } from '../../../scripts/config/env/index.js';
import Logger from '../../../scripts/utils/Logger.js';
import { sanitizeApiError } from '../../../scripts/utils/ApiErrorSanitizer.js';
import { UI_MESSAGES } from '../../../scripts/config/shared/messages.js';
import {
  flushAsyncClick,
  buildDestinationProfileDOM,
  buildChromeMock,
  buildProfileManagerMock,
} from '../../helpers/optionsTestHarness.js';

// Mocks for dependencies
jest.mock('../../../scripts/config/env/index.js', () => ({
  BUILD_ENV: {
    ENABLE_OAUTH: true,
    ENABLE_ACCOUNT: true,
    OAUTH_SERVER_URL: 'https://worker.test',
    OAUTH_CLIENT_ID: '',
    EXTENSION_API_KEY: '',
    ENABLE_ACCOUNT: false, // will be configured in beforeEach
  },
}));
jest.mock('../../../pages/options/UIManager.js');
jest.mock('../../../pages/options/AuthManager.js');
jest.mock('../../../pages/options/DataSourceManager.js');
jest.mock('../../../pages/options/StorageManager.js');
jest.mock('../../../pages/options/MigrationTool.js');
jest.mock('../../../scripts/utils/Logger.js', () => ({
  __esModule: true,
  default: require('../../helpers/loggerMock.js').createLoggerMock(),
}));
jest.mock('../../../scripts/auth/accountSession.js', () => ({
  getAccountProfile: jest.fn(),
  getAccountAccessToken: jest.fn(),
  clearAccountSession: jest.fn().mockResolvedValue(),
}));

jest.mock('../../../scripts/destinations/ProfileManager.js', () => ({
  ProfileManager: jest.fn().mockImplementation(() => ({
    listProfiles: jest.fn().mockResolvedValue([{ id: 'default' }]),
    getDestinationEntitlement: jest
      .fn()
      .mockResolvedValue({ maxProfiles: 2, accountSignedIn: true, source: 'test' }),
    ensureMigratedDefaultProfile: jest.fn().mockResolvedValue([{ id: 'default' }]),
    createProfile: jest.fn().mockResolvedValue({ id: 'profile-2' }),
    getProfile: jest.fn().mockResolvedValue({
      id: 'default',
      name: 'Default',
      notionDataSourceId: 'source-1',
      notionDataSourceType: 'database',
    }),
    updateProfile: jest.fn(),
    deleteProfile: jest.fn().mockResolvedValue([{ id: 'default' }]),
  })),
}));

describe('Destination profile options UI', () => {
  const { ProfileManager } = require('../../../scripts/destinations/ProfileManager.js');
  const {
    getAccountProfile,
    getAccountAccessToken,
  } = require('../../../scripts/auth/accountSession.js');
  let mockUiInstance = null;

  beforeEach(() => {
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
    const service = buildProfileManagerMock({
      getDestinationEntitlement: jest.fn().mockRejectedValue(entitlementError),
    });
    ProfileManager.mockImplementationOnce(() => service);

    initOptions();
    await flushAsyncClick();

    expect(document.querySelector('.destination-profile-title').textContent).toBe('Default');
    expect(Logger.warn).toHaveBeenCalledWith('讀取保存目標權限失敗', {
      action: 'renderDestinationProfiles',
      error: sanitizeApiError(entitlementError, 'destinationProfileEntitlement'),
    });
  });

  it('render 應在 profile list 讀取失敗時使用空列表並記錄警告', async () => {
    const listError = new Error('list failed');
    const service = buildProfileManagerMock({
      listProfiles: jest.fn().mockRejectedValue(listError),
    });
    ProfileManager.mockImplementationOnce(() => service);

    initOptions();
    await flushAsyncClick();

    expect(document.querySelector('.destination-profile-row')).toBeNull();
    expect(Logger.warn).toHaveBeenCalledWith('讀取保存目標列表失敗', {
      action: 'renderDestinationProfiles',
      error: sanitizeApiError(listError, 'destinationProfileList'),
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
      updateProfile: jest.fn().mockResolvedValue({ id: 'default', name: 'Inbox' }),
      createProfile: jest.fn(),
      deleteProfile: jest.fn(),
    };
    ProfileManager.mockImplementationOnce(() => service);

    initOptions();
    await flushAsyncClick();

    document.querySelector('button[data-action="rename"]').click();
    await flushAsyncClick();
    const input = document.querySelector('input[data-role="destination-profile-name-edit"]');
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
      createProfile: jest.fn(),
      deleteProfile: jest.fn(),
    };
    ProfileManager.mockImplementationOnce(() => service);

    initOptions();
    await flushAsyncClick();

    document.querySelector('button[data-action="rename"]').click();
    await flushAsyncClick();
    const input = document.querySelector('input[data-role="destination-profile-name-edit"]');
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
    const service = buildProfileManagerMock();
    ProfileManager.mockImplementationOnce(() => service);

    initOptions();
    await flushAsyncClick();

    document.querySelector('#database-id').value = 'invalid';
    document.querySelector('#add-destination-profile').click();
    await flushAsyncClick();

    expect(service.createProfile).not.toHaveBeenCalled();
    expect(mockUiInstance.showStatus).toHaveBeenCalledWith(
      expect.stringContaining('ID 格式無效'),
      'error'
    );
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

  it('保存目標套用與刪除按鈕應呼叫對應 service flow', async () => {
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

    document.querySelector('button[data-action="edit"]').click();
    await flushAsyncClick();

    expect(document.querySelector('#database-id').value).toBe('target-page-id');
    expect(document.querySelector('#database-type').value).toBe('page');
    expect(mockUiInstance.showStatus).toHaveBeenCalledWith(
      UI_MESSAGES.OPTIONS.DESTINATION.APPLY_SUCCESS('Second'),
      'info'
    );

    document.querySelector('button[data-action="delete"][data-profile-id="profile-2"]').click();
    await flushAsyncClick();

    expect(service.deleteProfile).toHaveBeenCalledWith('profile-2');
    expect(service.listProfiles).toHaveBeenCalledTimes(2);
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
});
