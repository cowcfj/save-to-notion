/**
 * optionsController.test.js
 *
 * Tests for pure helper functions and saveSettings in the main options controller.
 */

import {
  saveSettings,
  formatTitle,
  setupTemplatePreview,
  cleanDatabaseId,
} from '../../../pages/options/options.js';
import { UI_MESSAGES } from '../../../scripts/config/shared/messages.js';
import { DATA_SOURCE_KEYS } from '../../../scripts/config/shared/storage.js';

// Mocks for dependencies
jest.mock('../../../scripts/config/env/index.js', () => ({
  BUILD_ENV: {
    ENABLE_OAUTH: true,
    ENABLE_ACCOUNT: true,
    OAUTH_SERVER_URL: 'https://worker.test',
    OAUTH_CLIENT_ID: '',
    EXTENSION_API_KEY: '',
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
    updateProfile: jest.fn().mockResolvedValue({ id: 'default' }),
    deleteProfile: jest.fn().mockResolvedValue([{ id: 'default' }]),
  })),
}));

jest.mock('../../../scripts/destinations/ProfileStore.js', () => ({
  LocalDestinationProfileRepository: jest.fn(),
  AccountGatedDestinationEntitlementProvider: jest.fn(),
  DESTINATION_PROFILE_ERRORS: {
    LIMIT_REACHED: '已達目的地數量上限',
  },
  DESTINATION_PROFILE_ERROR_CODES: {
    LIMIT_REACHED: 'DESTINATION_LIMIT_REACHED',
  },
}));

describe('optionsController', () => {
  describe('formatTitle', () => {
    it('should replace variables in template', () => {
      const template = '{title} - {date}';
      const variables = { title: 'Test Page', date: '2023-12-25' };
      const result = formatTitle(template, variables);
      expect(result).toBe('Test Page - 2023-12-25');
    });

    it('should keep original key if variable not found', () => {
      const template = '{unknown}';
      const result = formatTitle(template, {});
      expect(result).toBe('{unknown}');
    });
  });

  describe('setupTemplatePreview', () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <button id="preview-template"></button>
        <input id="title-template" value="{title}" />
        <div id="template-preview" class="hidden"></div>
      `;
    });

    it('should setup event listener and show preview', () => {
      setupTemplatePreview();

      const button = document.querySelector('#preview-template');
      button.click();

      const previewDiv = document.querySelector('#template-preview');
      expect(previewDiv.classList.contains('hidden')).toBe(false);
      expect(previewDiv.textContent).toContain(UI_MESSAGES.OPTIONS.TEMPLATES.PREVIEW_RESULT_LABEL);
      expect(previewDiv.textContent).toContain(UI_MESSAGES.OPTIONS.TEMPLATES.PREVIEW_SAMPLE_TITLE);
    });
  });

  describe('cleanDatabaseId', () => {
    it('應移除連字符', () => {
      expect(cleanDatabaseId('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(
        'a1b2c3d4e5f67890abcdef1234567890'
      );
    });

    it('應從 URL 中提取 ID（帶連字符）', () => {
      const url = 'https://www.notion.so/workspace/a1b2c3d4-e5f6-7890-abcd-ef1234567890?v=123';
      expect(cleanDatabaseId(url)).toBe('a1b2c3d4e5f67890abcdef1234567890');
    });

    it('應從 URL 中提取 ID（無連字符）', () => {
      const url = 'https://www.notion.so/workspace/a1b2c3d4e5f67890abcdef1234567890?v=123';
      expect(cleanDatabaseId(url)).toBe('a1b2c3d4e5f67890abcdef1234567890');
    });

    it('應從帶 hash fragment 的 URL 中提取 ID', () => {
      const url = 'https://www.notion.so/workspace/a1b2c3d4e5f67890abcdef1234567890#block';
      expect(cleanDatabaseId(url)).toBe('a1b2c3d4e5f67890abcdef1234567890');
    });

    it('應處理已清理的 ID', () => {
      expect(cleanDatabaseId('a1b2c3d4e5f67890abcdef1234567890')).toBe(
        'a1b2c3d4e5f67890abcdef1234567890'
      );
    });

    it('應處理帶空格的輸入', () => {
      expect(cleanDatabaseId('  a1b2c3d4-e5f6-7890-abcd-ef1234567890  ')).toBe(
        'a1b2c3d4e5f67890abcdef1234567890'
      );
    });

    it('應拒絕無效格式', () => {
      expect(cleanDatabaseId('invalid-id')).toBe('');
      expect(cleanDatabaseId('12345')).toBe('');
      expect(cleanDatabaseId('')).toBe('');
      expect(cleanDatabaseId(null)).toBe('');
    });

    it('應拒絕非十六進制字符', () => {
      expect(cleanDatabaseId('g1b2c3d4e5f67890abcdef1234567890')).toBe('');
      expect(cleanDatabaseId('a1b2c3d4-e5f6-7890-abcd-zzzzzzzzzzzz')).toBe('');
    });
  });

  describe('saveSettings', () => {
    let mockUi = null;
    let mockAuth = null;
    let mockSet = null;
    let mockLocalSet = null;
    let mockSyncRemove = null;

    beforeEach(() => {
      document.body.innerHTML = `
        <input id="api-key" value="key_123" />
        <input id="database-id" value="a1b2c3d4e5f67890abcdef1234567890" />
        <input id="title-template" value="{title}" />
        <input type="checkbox" id="add-source" checked />
        <input type="checkbox" id="add-timestamp" />
        <input id="database-type" value="page" />
        <select id="highlight-style">
          <option value="background" selected>背景顏色</option>
          <option value="text">文字顏色</option>
          <option value="underline">底線</option>
        </select>

        <select id="ui-zoom-level">
          <option value="1">中 (100%)</option>
          <option value="1.1">大 (110%)</option>
        </select>
      `;

      mockUi = { showStatus: jest.fn() };
      mockAuth = { currentAuthMode: 'manual', checkAuthStatus: jest.fn() };
      mockSet = jest.fn().mockResolvedValue();
      mockLocalSet = jest.fn().mockResolvedValue();
      mockSyncRemove = jest.fn().mockResolvedValue();

      globalThis.chrome = {
        storage: {
          local: { set: mockLocalSet },
          sync: { set: mockSet, remove: mockSyncRemove },
        },
      };
    });

    afterEach(() => {
      jest.clearAllMocks();
      delete globalThis.chrome;
    });

    it('應儲存設定並更新狀態', async () => {
      const { ProfileManager } = require('../../../scripts/destinations/ProfileManager.js');
      await saveSettings(mockUi, mockAuth);
      const serviceInstance = ProfileManager.mock.results.at(-1).value;

      expect(mockLocalSet).toHaveBeenCalledWith(
        expect.objectContaining({
          notionDatabaseId: 'a1b2c3d4e5f67890abcdef1234567890',
          notionDataSourceId: 'a1b2c3d4e5f67890abcdef1234567890',
          notionDataSourceType: 'page',
        })
      );
      expect(serviceInstance.updateProfile).toHaveBeenCalledWith(
        'default',
        expect.objectContaining({
          notionDataSourceId: 'a1b2c3d4e5f67890abcdef1234567890',
          notionDataSourceType: 'page',
        })
      );

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          notionApiKey: 'key_123',
          titleTemplate: '{title}',
          addSource: true,
          addTimestamp: false,
          uiZoomLevel: '1',
          highlightStyle: 'background',
        })
      );

      expect(mockSyncRemove).toHaveBeenCalledWith(DATA_SOURCE_KEYS);

      expect(mockUi.showStatus).toHaveBeenCalledWith(
        expect.stringContaining('成功'),
        'success',
        'status'
      );
      expect(mockAuth.checkAuthStatus).toHaveBeenCalled();
    });

    it('應在 storage 寫入前更新 default profile，避免 storage/profile split-brain', async () => {
      const { ProfileManager } = require('../../../scripts/destinations/ProfileManager.js');
      let profileUpdated = false;
      mockLocalSet.mockImplementation(async () => {
        expect(profileUpdated).toBe(true);
      });
      mockSet.mockImplementation(async () => {
        expect(profileUpdated).toBe(true);
      });
      mockSyncRemove.mockImplementation(async () => {
        expect(profileUpdated).toBe(true);
      });
      ProfileManager.mockImplementationOnce(() => ({
        ensureMigratedDefaultProfile: jest.fn().mockResolvedValue([{ id: 'default' }]),
        updateProfile: jest.fn(async () => {
          profileUpdated = true;
          return { id: 'default' };
        }),
      }));

      await saveSettings(mockUi, mockAuth);

      expect(profileUpdated).toBe(true);
    });

    it('chrome.storage 寫入失敗時應 rollback default profile 且 UI 顯示錯誤', async () => {
      const { ProfileManager } = require('../../../scripts/destinations/ProfileManager.js');
      const updateProfile = jest.fn().mockResolvedValue({ id: 'default' });
      ProfileManager.mockImplementationOnce(() => ({
        ensureMigratedDefaultProfile: jest.fn().mockResolvedValue([
          {
            id: 'default',
            notionDataSourceId: 'old-source',
            notionDataSourceType: 'database',
          },
        ]),
        updateProfile,
      }));
      mockLocalSet.mockRejectedValueOnce(new Error('storage failed'));

      await saveSettings(mockUi, mockAuth);

      expect(updateProfile).toHaveBeenCalledWith('default', {
        notionDataSourceId: 'old-source',
        notionDataSourceType: 'database',
      });
      expect(mockUi.showStatus).toHaveBeenCalledWith(
        expect.stringContaining('失敗'),
        'error',
        'status'
      );
    });

    it('default profile 更新失敗時不應寫入 storage 且 UI 顯示錯誤', async () => {
      const { ProfileManager } = require('../../../scripts/destinations/ProfileManager.js');
      const updateProfile = jest.fn().mockRejectedValue(new Error('profile failed'));
      ProfileManager.mockImplementationOnce(() => ({
        ensureMigratedDefaultProfile: jest.fn().mockResolvedValue([
          {
            id: 'default',
            notionDataSourceId: 'old-source',
            notionDataSourceType: 'database',
          },
        ]),
        updateProfile,
      }));

      await saveSettings(mockUi, mockAuth);

      expect(updateProfile).toHaveBeenCalledWith('default', {
        notionDataSourceId: 'a1b2c3d4e5f67890abcdef1234567890',
        notionDataSourceType: 'page',
      });
      expect(mockLocalSet).not.toHaveBeenCalled();
      expect(mockSet).not.toHaveBeenCalled();
      expect(mockSyncRemove).not.toHaveBeenCalled();
      expect(mockUi.showStatus).toHaveBeenCalledWith(
        expect.stringContaining('失敗'),
        'error',
        'status'
      );
    });

    it('should validate empty API key if not in OAuth mode', async () => {
      document.querySelector('#api-key').value = '';
      mockAuth.currentAuthMode = 'manual';
      await saveSettings(mockUi, mockAuth);
      expect(mockUi.showStatus).toHaveBeenCalledWith(
        expect.stringContaining('API Key'),
        'error',
        'status'
      );
      expect(mockSet).not.toHaveBeenCalled();
    });

    it('should allow empty API key if in OAuth mode', async () => {
      document.querySelector('#api-key').value = '';
      mockAuth.currentAuthMode = 'oauth';
      await saveSettings(mockUi, mockAuth);
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          notionApiKey: '',
        })
      );
    });

    it('should validate empty Database ID', async () => {
      document.querySelector('#database-id').value = '';
      await saveSettings(mockUi, mockAuth);
      expect(mockUi.showStatus).toHaveBeenCalledWith(
        expect.stringContaining('ID'),
        'error',
        'status'
      );
      expect(mockSet).not.toHaveBeenCalled();
    });

    it('應處理儲存失敗', async () => {
      mockSet.mockRejectedValueOnce(new Error('Storage error'));
      await saveSettings(mockUi, mockAuth);
      expect(mockUi.showStatus).toHaveBeenCalledWith(
        expect.stringContaining('失敗'),
        'error',
        'status'
      );
    });

    it('應處理 local.set 儲存失敗', async () => {
      mockLocalSet.mockRejectedValueOnce(new Error('Storage error'));
      await saveSettings(mockUi, mockAuth);
      expect(mockUi.showStatus).toHaveBeenCalledWith(
        expect.stringContaining('失敗'),
        'error',
        'status'
      );
    });

    it('輸入為空時應將 notionDataSourceType 回退為 database', async () => {
      document.querySelector('#database-type').value = '';
      await saveSettings(mockUi, mockAuth);

      expect(mockLocalSet).toHaveBeenCalledWith(
        expect.objectContaining({
          notionDataSourceType: 'database',
        })
      );
    });

    it('無效值時應將 notionDataSourceType 回退為 database', async () => {
      document.querySelector('#database-type').value = 'invalid';
      await saveSettings(mockUi, mockAuth);

      expect(mockLocalSet).toHaveBeenCalledWith(
        expect.objectContaining({
          notionDataSourceType: 'database',
        })
      );
    });

    it('should save highlightStyle when element exists', async () => {
      document.querySelector('#highlight-style').value = 'text';
      await saveSettings(mockUi, mockAuth);

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          highlightStyle: 'text',
        })
      );
    });

    it('當元素存在時應儲存 highlightContentStyle', async () => {
      const highlightContentStyle = document.createElement('input');
      highlightContentStyle.id = 'highlight-content-style';
      highlightContentStyle.value = 'inline';
      document.body.append(highlightContentStyle);

      await saveSettings(mockUi, mockAuth);

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          highlightContentStyle: 'inline',
        })
      );
    });

    it('should save default highlightStyle (background)', async () => {
      await saveSettings(mockUi, mockAuth);

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          highlightStyle: 'background',
        })
      );
    });

    it('should save underline highlightStyle', async () => {
      document.querySelector('#highlight-style').value = 'underline';
      await saveSettings(mockUi, mockAuth);

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          highlightStyle: 'underline',
        })
      );
    });

    it('should save uiZoomLevel', async () => {
      document.querySelector('#ui-zoom-level').value = '1.1';
      await saveSettings(mockUi, mockAuth);

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          uiZoomLevel: '1.1',
        })
      );
    });

    it('當元素存在時應儲存 floatingRailPosition 與 floatingRailSize', async () => {
      const positionSelect = document.createElement('select');
      positionSelect.id = 'floating-rail-position';
      ['top', 'middle', 'bottom'].forEach(value => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        positionSelect.append(option);
      });
      positionSelect.value = 'top';

      const sizeSelect = document.createElement('select');
      sizeSelect.id = 'floating-rail-size';
      ['small', 'medium', 'large'].forEach(value => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        sizeSelect.append(option);
      });
      sizeSelect.value = 'small';

      document.body.append(positionSelect, sizeSelect);

      await saveSettings(mockUi, mockAuth);

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          floatingRailPosition: 'top',
          floatingRailSize: 'small',
        })
      );
    });

    it('元素缺失時不應寫入 floatingRailPosition / floatingRailSize 欄位', async () => {
      await saveSettings(mockUi, mockAuth);

      const syncPayload = mockSet.mock.calls.at(-1)[0];
      expect(syncPayload).not.toHaveProperty('floatingRailPosition');
      expect(syncPayload).not.toHaveProperty('floatingRailSize');
    });
  });
});
