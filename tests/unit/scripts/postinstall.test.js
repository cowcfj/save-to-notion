/**
 * @jest-environment node
 */

describe('scripts/postinstall.js', () => {
  const projectRoot = '/mock-root/notion-smart-clipper';
  const targetPath = `${projectRoot}/scripts/config/env.js`;
  const templatePath = `${projectRoot}/scripts/config/env.example.js`;

  function loadPostinstall({ envExists, templateExists = true, copyError = null }) {
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
    const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(projectRoot);

    jest.resetModules();
    jest.doMock('node:fs', () => ({
      existsSync: existsSyncMock,
      copyFileSync: copyFileSyncMock,
    }));
    jest.doMock('node:path', () => ({
      join: joinMock,
    }));

    jest.isolateModules(() => {
      require('../../../scripts/postinstall.js');
    });

    return {
      joinMock,
      existsSyncMock,
      copyFileSyncMock,
      consoleInfoSpy,
      consoleWarnSpy,
      consoleErrorSpy,
      cwdSpy,
    };
  }

  afterEach(() => {
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
      consoleInfoSpy,
      consoleWarnSpy,
      consoleErrorSpy,
      cwdSpy,
    } = loadPostinstall({
      envExists: false,
    });

    expect(cwdSpy).toHaveBeenCalled();
    expect(joinMock).toHaveBeenNthCalledWith(1, projectRoot, 'scripts', 'config', 'env.js');
    expect(joinMock).toHaveBeenNthCalledWith(2, projectRoot, 'scripts', 'config', 'env.example.js');
    expect(existsSyncMock).toHaveBeenNthCalledWith(1, targetPath);
    expect(existsSyncMock).toHaveBeenNthCalledWith(2, templatePath);
    expect(copyFileSyncMock).toHaveBeenCalledWith(templatePath, targetPath);
    expect(consoleInfoSpy).toHaveBeenCalledWith('已從 env.example.js 建立 scripts/config/env.js');
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  test('當 env.js 已存在時不應複製也不應輸出提示', () => {
    const { existsSyncMock, copyFileSyncMock, consoleInfoSpy, consoleWarnSpy, consoleErrorSpy } =
      loadPostinstall({
        envExists: true,
      });

    expect(existsSyncMock).toHaveBeenCalledWith(targetPath);
    expect(copyFileSyncMock).not.toHaveBeenCalled();
    expect(consoleInfoSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  test('當 template 不存在時應跳過複製並輸出警告', () => {
    const { copyFileSyncMock, consoleInfoSpy, consoleWarnSpy, consoleErrorSpy } = loadPostinstall({
      envExists: false,
      templateExists: false,
    });

    expect(copyFileSyncMock).not.toHaveBeenCalled();
    expect(consoleInfoSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '找不到範本檔 env.example.js，已跳過建立 scripts/config/env.js'
    );
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  test('當複製失敗時應輸出錯誤細節', () => {
    const copyError = new Error('disk full');
    const { consoleInfoSpy, consoleWarnSpy, consoleErrorSpy } = loadPostinstall({
      envExists: false,
      templateExists: true,
      copyError,
    });

    expect(consoleInfoSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith('建立 scripts/config/env.js 失敗：', copyError);
  });
});
