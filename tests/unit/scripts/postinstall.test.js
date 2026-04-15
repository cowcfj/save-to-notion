/**
 * @jest-environment node
 */

describe('scripts/postinstall.js', () => {
  const projectRoot = '/mock-root/notion-smart-clipper';
  const targetPath = `${projectRoot}/scripts/config/env.js`;
  const templatePath = `${projectRoot}/scripts/config/env.example.js`;

  function loadPostinstall({
    envExists,
    templateExists = true,
    copyError = null,
    envContent = 'export const BUILD_ENV = Object.freeze({});',
  }) {
    process.exitCode = undefined;
    const joinMock = jest.fn((...parts) => parts.join('/'));
    const existsSyncMock = jest.fn(filePath => {
      if (filePath === targetPath) {
        return envExists;
      }

      if (filePath === templatePath) {
        return templateExists;
      }

      return false;
    });
    const copyFileSyncMock = jest.fn(() => {
      if (copyError) {
        throw copyError;
      }
    });
    const readFileSyncMock = jest.fn(() => envContent);
    const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(projectRoot);

    jest.resetModules();
    jest.doMock('node:fs', () => ({
      existsSync: existsSyncMock,
      copyFileSync: copyFileSyncMock,
      readFileSync: readFileSyncMock,
    }));
    jest.doMock('node:path', () => ({
      join: joinMock,
    }));

    let thrownError = null;
    jest.isolateModules(() => {
      try {
        require('../../../scripts/postinstall.js');
      } catch (error) {
        thrownError = error;
      }
    });

    return {
      joinMock,
      existsSyncMock,
      copyFileSyncMock,
      readFileSyncMock,
      consoleInfoSpy,
      consoleWarnSpy,
      consoleErrorSpy,
      cwdSpy,
      thrownError,
    };
  }

  afterEach(() => {
    process.exitCode = undefined;
    jest.restoreAllMocks();
    jest.resetModules();
    jest.unmock('node:fs');
    jest.unmock('node:path');
  });

  test('當 env.js 不存在且 template 存在時應從 template 複製並輸出成功訊息', () => {
    const {
      joinMock,
      existsSyncMock,
      copyFileSyncMock,
      readFileSyncMock,
      consoleInfoSpy,
      consoleWarnSpy,
      consoleErrorSpy,
      cwdSpy,
      thrownError,
    } = loadPostinstall({
      envExists: false,
    });

    expect(thrownError).toBeNull();
    expect(cwdSpy).toHaveBeenCalled();
    expect(joinMock).toHaveBeenNthCalledWith(1, projectRoot, 'scripts', 'config', 'env.js');
    expect(joinMock).toHaveBeenNthCalledWith(2, projectRoot, 'scripts', 'config', 'env.example.js');
    expect(existsSyncMock).toHaveBeenNthCalledWith(1, targetPath);
    expect(existsSyncMock).toHaveBeenNthCalledWith(2, templatePath);
    expect(copyFileSyncMock).toHaveBeenCalledWith(templatePath, targetPath);
    expect(readFileSyncMock).toHaveBeenCalledWith(targetPath, 'utf8');
    expect(consoleInfoSpy).toHaveBeenCalledWith('已從 env.example.js 建立 scripts/config/env.js');
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  test('當 env.js 已存在時應驗證 BUILD_ENV 匯出而不複製', () => {
    const envContent = `export const BUILD_ENV = Object.freeze({
  OAUTH_CLIENT_ID: 'configured-client-id',
});`;
    const {
      existsSyncMock,
      copyFileSyncMock,
      readFileSyncMock,
      consoleInfoSpy,
      consoleWarnSpy,
      consoleErrorSpy,
      thrownError,
    } = loadPostinstall({
      envExists: true,
      envContent,
    });

    expect(thrownError).toBeNull();
    expect(existsSyncMock).toHaveBeenCalledWith(targetPath);
    expect(readFileSyncMock).toHaveBeenCalledWith(targetPath, 'utf8');
    expect(copyFileSyncMock).not.toHaveBeenCalled();
    expect(consoleInfoSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  test('當 env.js 的 OAUTH_CLIENT_ID 為空且格式與範本不同時仍應輸出警告', () => {
    const envContent = `export const BUILD_ENV = Object.freeze({
  OAUTH_CLIENT_ID:'',
});`;
    const { consoleWarnSpy, thrownError } = loadPostinstall({
      envExists: true,
      envContent,
    });

    expect(thrownError).toBeNull();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '\u001B[33m⚠️  scripts/config/env.js 中 OAUTH_CLIENT_ID 尚未設定。' +
        '若需測試 OAuth，請參考 README.md 填入你的 Notion Client ID。\u001B[0m'
    );
  });

  test('當 env.js 缺少 OAUTH_CLIENT_ID key 時仍應輸出警告', () => {
    const envContent = `export const BUILD_ENV = Object.freeze({
  ENABLE_OAUTH: false,
});`;
    const { consoleWarnSpy, thrownError } = loadPostinstall({
      envExists: true,
      envContent,
    });

    expect(thrownError).toBeNull();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '\u001B[33m⚠️  scripts/config/env.js 中 OAUTH_CLIENT_ID 尚未設定。' +
        '若需測試 OAuth，請參考 README.md 填入你的 Notion Client ID。\u001B[0m'
    );
  });

  test('當 template 不存在時應拋出錯誤中止安裝', () => {
    const { copyFileSyncMock, thrownError } = loadPostinstall({
      envExists: false,
      templateExists: false,
    });

    expect(copyFileSyncMock).not.toHaveBeenCalled();
    expect(thrownError).toBeInstanceOf(Error);
    expect(thrownError.message).toContain('找不到 env.example.js');
  });

  test('當複製失敗時應拋出錯誤中止安裝', () => {
    const copyError = new Error('disk full');
    const { thrownError } = loadPostinstall({
      envExists: false,
      templateExists: true,
      copyError,
    });

    expect(thrownError).toBeInstanceOf(Error);
    expect(thrownError.message).toContain('建立 scripts/config/env.js 失敗');
    expect(thrownError.message).toContain('disk full');
  });
});
