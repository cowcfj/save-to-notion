/**
 * @jest-environment node
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

describe('scripts/config/generateBuildEnv.js', () => {
  let generateBuildEnvSource;
  let validateGeneratedEnvSource;
  let writeBuildEnvFile;

  beforeEach(() => {
    jest.resetModules();
    ({
      generateBuildEnvSource,
      validateGeneratedEnvSource,
      writeBuildEnvFile,
    } = require('../../../scripts/config/generateBuildEnv.js'));
  });

  test('應使用安全字串序列化產生可解析且唯讀的 BUILD_ENV', () => {
    const prodServerUrl = String.raw`https://oauth.example.com/worker?note=it\'s-ready`;
    const prodClientId = String.raw`client-id-with-'quote'\\slash`;
    const extensionApiKey = String.raw`key-'with'\\slashes`;
    const template = `
      export const BUILD_ENV = Object.freeze({
        ENABLE_OAUTH: false,
        OAUTH_SERVER_URL: '',
        OAUTH_CLIENT_ID: '',
        EXTENSION_API_KEY: '',
      });
    `;

    const output = generateBuildEnvSource(template, {
      prodServerUrl,
      prodClientId,
      extensionApiKey,
    });

    expect(output).toContain(`OAUTH_SERVER_URL: ${JSON.stringify(prodServerUrl)}`);
    expect(output).toContain(`OAUTH_CLIENT_ID: ${JSON.stringify(prodClientId)}`);
    expect(output).toContain(`EXTENSION_API_KEY: ${JSON.stringify(extensionApiKey)}`);

    expect(validateGeneratedEnvSource(output)).toEqual({
      ENABLE_OAUTH: true,
      OAUTH_SERVER_URL: prodServerUrl,
      OAUTH_CLIENT_ID: prodClientId,
      EXTENSION_API_KEY: extensionApiKey,
    });
  });

  test('當必要 BUILD_ENV 欄位未被替換時應拋出明確錯誤', () => {
    const invalidOutput = `
      export const BUILD_ENV = Object.freeze({
        ENABLE_OAUTH: true,
        OAUTH_SERVER_URL: '',
        OAUTH_CLIENT_ID: 'client-id',
        EXTENSION_API_KEY: 'api-key',
      });
    `;

    expect(() => validateGeneratedEnvSource(invalidOutput)).toThrow(
      'Generated env.js validation failed: OAUTH_SERVER_URL is missing or empty'
    );
  });

  test('寫入檔案後應重新驗證輸出內容', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'generate-build-env-'));
    const templatePath = path.join(tempDir, 'env.example.js');
    const targetPath = path.join(tempDir, 'env.js');

    // eslint-disable-next-line security/detect-non-literal-fs-filename -- 測試使用的暫存路徑由本測試建立
    fs.writeFileSync(
      templatePath,
      `
        export const BUILD_ENV = Object.freeze({
          ENABLE_OAUTH: false,
          OAUTH_SERVER_URL: '',
          OAUTH_CLIENT_ID: '',
          EXTENSION_API_KEY: '',
        });
      `
    );

    const result = writeBuildEnvFile({
      templatePath,
      targetPath,
      prodServerUrl: 'https://oauth.example.com',
      prodClientId: 'client-id-123',
      extensionApiKey: 'api-key-123',
    });

    expect(result).toEqual({
      ENABLE_OAUTH: true,
      OAUTH_SERVER_URL: 'https://oauth.example.com',
      OAUTH_CLIENT_ID: 'client-id-123',
      EXTENSION_API_KEY: 'api-key-123',
    });
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- 驗證剛寫入的暫存輸出內容
    expect(fs.readFileSync(targetPath, 'utf8')).toContain('Object.freeze');
  });
});
