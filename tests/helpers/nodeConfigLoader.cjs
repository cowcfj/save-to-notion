'use strict';

const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ESM_REQUIRE_ERROR_CODE = 'ERR_REQUIRE_ESM';

async function loadConfig(configPath) {
  const resolvedConfigPath = path.resolve(configPath);
  try {
    const config = require(resolvedConfigPath);
    return config.default ?? config;
  } catch (error) {
    if (error?.code !== ESM_REQUIRE_ERROR_CODE) {
      throw error;
    }
    const config = await import(pathToFileURL(resolvedConfigPath).href);
    return config.default ?? config;
  }
}

module.exports = {
  loadConfig,
};
