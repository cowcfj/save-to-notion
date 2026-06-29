'use strict';

module.exports = {
  rootDir: '.',
  testEnvironment: 'jsdom',
  testEnvironmentOptions: {
    url: 'https://notion-chrome.test/',
  },
  transform: {},
  transformIgnorePatterns: [],
  testMatch: [
    '<rootDir>/tests/native-esm/config/configConstants.native-esm.test.mjs',
    '<rootDir>/tests/native-esm/highlighter/utils/domText.native-esm.test.mjs',
    '<rootDir>/tests/native-esm/highlighter/utils/pureUtils.native-esm.test.mjs',
    '<rootDir>/tests/native-esm/utils/root-url-and-page-complexity.native-esm.test.mjs',
    '<rootDir>/tests/native-esm/utils/root-utils-runtime.native-esm.test.mjs',
    '<rootDir>/tests/native-esm/utils/rootUtils.native-esm.test.mjs',
  ],
  setupFiles: ['<rootDir>/tests/native-esm/native-runner.setup.mjs'],
  cacheDirectory: '<rootDir>/.tmp/jest-cache-native-default',
  maxWorkers: 4,
  verbose: false,
};
