/**
 * @jest-environment node
 */

describe('scripts/postinstall.js', () => {
  const projectRoot = '/mock-root/notion-smart-clipper';

  function loadPostinstall({ envExists }) {
    const joinMock = jest.fn((...parts) => parts.join('/'));
    const existsSyncMock = jest.fn(() => envExists);
    const copyFileSyncMock = jest.fn();
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

  test('當 env.js 不存在時應從 template 複製並輸出提示', () => {
    const { joinMock, existsSyncMock, copyFileSyncMock, consoleErrorSpy, cwdSpy } = loadPostinstall(
      {
        envExists: false,
      }
    );

    expect(cwdSpy).toHaveBeenCalled();
    expect(joinMock).toHaveBeenNthCalledWith(1, projectRoot, 'scripts', 'config', 'env.js');
    expect(joinMock).toHaveBeenNthCalledWith(2, projectRoot, 'scripts', 'config', 'env.example.js');
    expect(existsSyncMock).toHaveBeenCalledWith(`${projectRoot}/scripts/config/env.js`);
    expect(copyFileSyncMock).toHaveBeenCalledWith(
      `${projectRoot}/scripts/config/env.example.js`,
      `${projectRoot}/scripts/config/env.js`
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith('Created scripts/config/env.js from template');
  });

  test('當 env.js 已存在時不應複製也不應輸出提示', () => {
    const { existsSyncMock, copyFileSyncMock, consoleErrorSpy } = loadPostinstall({
      envExists: true,
    });

    expect(existsSyncMock).toHaveBeenCalledWith(`${projectRoot}/scripts/config/env.js`);
    expect(copyFileSyncMock).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
