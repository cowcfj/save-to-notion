function registerHighlighterMocks({ jest, mockManager, mockStorage }) {
  const managerModuleMock = {
    HighlightManager: jest.fn(() => mockManager),
  };
  const storageModuleMock = {
    HighlightStorage: jest.fn(() => mockStorage),
    RestoreManager: jest.fn(() => mockStorage),
  };
  const styleManagerModuleMock = {
    StyleManager: jest.fn(() => ({})),
  };
  const interactionModuleMock = {
    HighlightInteraction: jest.fn(() => ({})),
  };
  const migrationModuleMock = {
    HighlightMigration: jest.fn(() => ({})),
  };
  const toastModuleMock = {
    Toast: jest.fn(() => ({})),
  };
  const urlUtilsModuleMock = {
    normalizeUrl: jest.fn(url => url),
  };

  jest.unstable_mockModule(
    '../../../scripts/highlighter/core/HighlightManager.js',
    () => managerModuleMock
  );
  jest.unstable_mockModule(
    '../../../scripts/highlighter/core/HighlightStorage.js',
    () => storageModuleMock
  );
  jest.unstable_mockModule(
    '../../../scripts/highlighter/core/StyleManager.js',
    () => styleManagerModuleMock
  );
  jest.unstable_mockModule(
    '../../../scripts/highlighter/core/HighlightInteraction.js',
    () => interactionModuleMock
  );
  jest.unstable_mockModule(
    '../../../scripts/highlighter/core/HighlightMigration.js',
    () => migrationModuleMock
  );
  jest.unstable_mockModule('../../../scripts/highlighter/ui/Toast.js', () => toastModuleMock);
  jest.unstable_mockModule('../../../scripts/utils/urlUtils.js', () => urlUtilsModuleMock);
  jest.doMock('../../../scripts/highlighter/core/HighlightManager.js', () => managerModuleMock);
  jest.doMock('../../../scripts/highlighter/core/HighlightStorage.js', () => storageModuleMock);
  jest.doMock('../../../scripts/highlighter/core/StyleManager.js', () => styleManagerModuleMock);
  jest.doMock(
    '../../../scripts/highlighter/core/HighlightInteraction.js',
    () => interactionModuleMock
  );
  jest.doMock(
    '../../../scripts/highlighter/core/HighlightMigration.js',
    () => migrationModuleMock
  );
  jest.doMock('../../../scripts/highlighter/ui/Toast.js', () => toastModuleMock);
  jest.doMock('../../../scripts/utils/urlUtils.js', () => urlUtilsModuleMock);
}

module.exports = { registerHighlighterMocks };
