'use strict';

module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/native-esm/**/*.test.mjs'],
  transform: {},
  cacheDirectory: '<rootDir>/.tmp/jest-cache-native-esm',
  coverageProvider: 'v8',
  coverageDirectory: '<rootDir>/coverage/native-esm',
  coverageReporters: ['json', 'text'],
  collectCoverageFrom: [
    '<rootDir>/scripts/background/utils/BlockBuilder.js',
    '<rootDir>/scripts/highlighter/autoInit/initializationInputs.js',
  ],
  coverageThreshold: {
    global: {
      branches: 0,
      functions: 0,
      lines: 0,
      statements: 0,
    },
  },
  verbose: false,
};
