import { jest } from '@jest/globals';

export function createLoggerMock(overrides = {}) {
  return {
    debugEnabled: false,
    success: jest.fn(),
    start: jest.fn(),
    ready: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    getBuffer: jest.fn(() => []),
    addLogToBuffer: jest.fn(),
    ...overrides,
  };
}

export const mockBuildEnv = {
  ENABLE_OAUTH: true,
  ENABLE_ACCOUNT: true,
  OAUTH_SERVER_URL: 'https://worker.test',
  OAUTH_CLIENT_ID: '',
  EXTENSION_API_KEY: '',
};

export const mockLogger = createLoggerMock();
export const mockGetAccountProfile = jest.fn();
export const mockGetAccountAccessToken = jest.fn();
export const mockClearAccountSession = jest.fn().mockResolvedValue();
export const mockBuildAccountAuthHeaders = jest.fn().mockResolvedValue({
  Authorization: 'Bearer token',
});

export const mockUIManager = jest.fn();
export const mockAuthManager = jest.fn();
export const mockDataSourceManager = jest.fn();
export const mockStorageManager = jest.fn();
export const mockMigrationTool = jest.fn();

export const mockProfileManager = jest.fn().mockImplementation(() => ({
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
}));

export const mockProfileStoreModule = {
  LocalDestinationProfileRepository: jest.fn(),
  AccountGatedDestinationEntitlementProvider: jest.fn(),
  DESTINATION_PROFILE_ERRORS: {
    LIMIT_REACHED: '已達目的地數量上限',
  },
  DESTINATION_PROFILE_ERROR_CODES: {
    LIMIT_REACHED: 'DESTINATION_LIMIT_REACHED',
  },
};

const mockEnvModule = {
  BUILD_ENV: mockBuildEnv,
  default: {
    BUILD_ENV: mockBuildEnv,
  },
};

const mockLoggerModule = {
  __esModule: true,
  default: mockLogger,
};

const mockAccountSessionModule = {
  getAccountProfile: mockGetAccountProfile,
  getAccountAccessToken: mockGetAccountAccessToken,
  clearAccountSession: mockClearAccountSession,
  buildAccountAuthHeaders: mockBuildAccountAuthHeaders,
};

const mockProfileManagerModule = {
  ProfileManager: mockProfileManager,
};

jest.unstable_mockModule('../../../scripts/config/env/index.js', () => mockEnvModule);
jest.unstable_mockModule('../../../pages/options/UIManager.js', () => ({
  UIManager: mockUIManager,
}));
jest.unstable_mockModule('../../../pages/options/AuthManager.js', () => ({
  AuthManager: mockAuthManager,
}));
jest.unstable_mockModule('../../../pages/options/DataSourceManager.js', () => ({
  DataSourceManager: mockDataSourceManager,
}));
jest.unstable_mockModule('../../../pages/options/StorageManager.js', () => ({
  StorageManager: mockStorageManager,
}));
jest.unstable_mockModule('../../../pages/options/MigrationTool.js', () => ({
  MigrationTool: mockMigrationTool,
}));
jest.unstable_mockModule('../../../scripts/utils/Logger.js', () => mockLoggerModule);
jest.unstable_mockModule('../../../scripts/auth/accountSession.js', () => mockAccountSessionModule);
jest.unstable_mockModule(
  '../../../scripts/destinations/ProfileManager.js',
  () => mockProfileManagerModule
);
jest.unstable_mockModule(
  '../../../scripts/destinations/ProfileStore.js',
  () => mockProfileStoreModule
);

jest.mock('../../../scripts/config/env/index.js', () => mockEnvModule);
jest.mock('../../../pages/options/UIManager.js', () => ({
  UIManager: mockUIManager,
}));
jest.mock('../../../pages/options/AuthManager.js', () => ({
  AuthManager: mockAuthManager,
}));
jest.mock('../../../pages/options/DataSourceManager.js', () => ({
  DataSourceManager: mockDataSourceManager,
}));
jest.mock('../../../pages/options/StorageManager.js', () => ({
  StorageManager: mockStorageManager,
}));
jest.mock('../../../pages/options/MigrationTool.js', () => ({
  MigrationTool: mockMigrationTool,
}));
jest.mock('../../../scripts/utils/Logger.js', () => mockLoggerModule);
jest.mock('../../../scripts/auth/accountSession.js', () => mockAccountSessionModule);
jest.mock('../../../scripts/destinations/ProfileManager.js', () => mockProfileManagerModule);
jest.mock('../../../scripts/destinations/ProfileStore.js', () => mockProfileStoreModule);

export function resetOptionsBootstrapMocks() {
  Object.assign(mockBuildEnv, {
    ENABLE_OAUTH: true,
    ENABLE_ACCOUNT: true,
    OAUTH_SERVER_URL: 'https://worker.test',
    OAUTH_CLIENT_ID: '',
    EXTENSION_API_KEY: '',
  });
  mockGetAccountProfile.mockReset();
  mockGetAccountAccessToken.mockReset();
  mockClearAccountSession.mockReset();
  mockClearAccountSession.mockResolvedValue();
  mockBuildAccountAuthHeaders.mockReset();
  mockBuildAccountAuthHeaders.mockResolvedValue({
    Authorization: 'Bearer token',
  });
  mockUIManager.mockReset();
  mockUIManager.mockImplementation(() => ({
    init: jest.fn(),
    showStatus: jest.fn(),
  }));
  mockAuthManager.mockReset();
  mockAuthManager.mockImplementation(() => ({
    init: jest.fn(),
    checkAuthStatus: jest.fn(),
  }));
  mockDataSourceManager.mockReset();
  mockDataSourceManager.mockImplementation(() => ({
    init: jest.fn(),
    loadDataSources: jest.fn(),
  }));
  mockStorageManager.mockReset();
  mockStorageManager.mockImplementation(() => ({
    init: jest.fn(),
    updateStorageUsage: jest.fn(),
  }));
  mockMigrationTool.mockReset();
  mockMigrationTool.mockImplementation(() => ({
    init: jest.fn(),
  }));
  mockProfileManager.mockClear();
}

resetOptionsBootstrapMocks();
