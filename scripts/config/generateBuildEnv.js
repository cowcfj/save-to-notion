const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const REQUIRED_BUILD_ENV_KEYS = Object.freeze([
  'ENABLE_OAUTH',
  'OAUTH_SERVER_URL',
  'OAUTH_CLIENT_ID',
  'EXTENSION_API_KEY',
]);

function assertNonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Missing required value: ${fieldName}`);
  }
}

function replaceExact(source, searchValue, replacement, fieldName) {
  if (!source.includes(searchValue)) {
    throw new Error(`env.example.js replacement target not found: ${fieldName}`);
  }

  return source.replaceAll(searchValue, replacement);
}

function normalizeModuleSource(source) {
  return source
    .split('\n')
    .map(line => {
      const trimmedLine = line.trimStart();
      if (!trimmedLine.startsWith('export ')) {
        return line;
      }

      const leadingWhitespaceLength = line.length - trimmedLine.length;
      return `${line.slice(0, leadingWhitespaceLength)}${trimmedLine.slice('export '.length)}`;
    })
    .join('\n');
}

function parseBuildEnvFromSource(source) {
  const script = new vm.Script(
    `${normalizeModuleSource(source)}\nmodule.exports = { BUILD_ENV };`,
    {
      filename: 'scripts/config/env.js',
    }
  );

  const context = {
    module: { exports: {} },
    exports: {},
    console,
    globalThis: {},
  };

  script.runInNewContext(context);
  return context.module.exports.BUILD_ENV;
}

function validateGeneratedEnvSource(source) {
  let buildEnv;

  try {
    buildEnv = parseBuildEnvFromSource(source);
  } catch (error) {
    throw new Error(`Generated env.js syntax validation failed: ${error.message}`);
  }

  if (!buildEnv || typeof buildEnv !== 'object') {
    throw new Error('Generated env.js validation failed: BUILD_ENV export is missing');
  }

  if (buildEnv.ENABLE_OAUTH !== true) {
    throw new Error('Generated env.js validation failed: ENABLE_OAUTH was not enabled');
  }

  for (const key of REQUIRED_BUILD_ENV_KEYS.slice(1)) {
    if (typeof buildEnv[key] !== 'string' || buildEnv[key].trim().length === 0) {
      throw new Error(`Generated env.js validation failed: ${key} is missing or empty`);
    }
  }

  if (!Object.isFrozen(buildEnv)) {
    throw new Error('Generated env.js validation failed: BUILD_ENV must be frozen');
  }

  return {
    ENABLE_OAUTH: buildEnv.ENABLE_OAUTH,
    OAUTH_SERVER_URL: buildEnv.OAUTH_SERVER_URL,
    OAUTH_CLIENT_ID: buildEnv.OAUTH_CLIENT_ID,
    EXTENSION_API_KEY: buildEnv.EXTENSION_API_KEY,
  };
}

function generateBuildEnvSource(templateSource, { prodServerUrl, prodClientId, extensionApiKey }) {
  assertNonEmptyString(prodServerUrl, 'PROD_SERVER_URL');
  assertNonEmptyString(prodClientId, 'PROD_CLIENT_ID');
  assertNonEmptyString(extensionApiKey, 'EXTENSION_API_KEY');

  let output = templateSource;
  output = replaceExact(output, 'ENABLE_OAUTH: false', 'ENABLE_OAUTH: true', 'ENABLE_OAUTH');
  output = replaceExact(
    output,
    "OAUTH_SERVER_URL: ''",
    `OAUTH_SERVER_URL: ${JSON.stringify(prodServerUrl)}`,
    'OAUTH_SERVER_URL'
  );
  output = replaceExact(
    output,
    "OAUTH_CLIENT_ID: ''",
    `OAUTH_CLIENT_ID: ${JSON.stringify(prodClientId)}`,
    'OAUTH_CLIENT_ID'
  );
  output = replaceExact(
    output,
    "EXTENSION_API_KEY: ''",
    `EXTENSION_API_KEY: ${JSON.stringify(extensionApiKey)}`,
    'EXTENSION_API_KEY'
  );

  validateGeneratedEnvSource(output);
  return output;
}

function writeBuildEnvFile({
  templatePath,
  targetPath,
  prodServerUrl,
  prodClientId,
  extensionApiKey,
}) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- 路徑由呼叫端明確傳入且受測試覆蓋
  const templateSource = fs.readFileSync(templatePath, 'utf8');
  const output = generateBuildEnvSource(templateSource, {
    prodServerUrl,
    prodClientId,
    extensionApiKey,
  });

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- 目標檔為明確的 env.js 輸出位置
  fs.writeFileSync(targetPath, output);

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- 寫入後立即重新讀取做語法與欄位驗證
  return validateGeneratedEnvSource(fs.readFileSync(targetPath, 'utf8'));
}

function main() {
  const projectRoot = process.cwd();
  const templatePath = path.join(projectRoot, 'scripts', 'config', 'env.example.js');
  const targetPath = path.join(projectRoot, 'scripts', 'config', 'env.js');

  try {
    const result = writeBuildEnvFile({
      templatePath,
      targetPath,
      prodServerUrl: process.env.PROD_SERVER_URL,
      prodClientId: process.env.PROD_CLIENT_ID,
      extensionApiKey: process.env.EXTENSION_API_KEY,
    });

    process.stdout.write(
      `✓ env.js generated with production config (${REQUIRED_BUILD_ENV_KEYS.join(', ')})`
    );
    return result;
  } catch (error) {
    throw new Error(`ERROR: ${error.message}`);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  generateBuildEnvSource,
  parseBuildEnvFromSource,
  validateGeneratedEnvSource,
  writeBuildEnvFile,
};
