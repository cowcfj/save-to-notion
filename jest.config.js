const ESM_TRANSFORM_IGNORE_PATTERNS = [
  String.raw`node_modules/(?!(jsdom|@exodus|html-encoding-sniffer|@notionhq|parse5|@jest|jest-environment-jsdom|whatwg-url|tr46|webidl-conversions|data-urls|decimal.js|punycode|entities|nwsapi|saxes|cssstyle|rrweb-cssom|symbol-tree|@asamuzakjp\/css-color)/)`
];

const SWC_JEST_TRANSFORM = [
  '@swc/jest',
  {
    sourceMaps: 'inline',
    jsc: {
      target: 'es2023',
    },
    module: {
      type: 'commonjs',
    },
  },
];

const JEST_MODULE_NAME_MAPPER = {
  '^chrome$': '<rootDir>/tests/mocks/chrome.cjs',
  '^@asamuzakjp/css-color$': '<rootDir>/tests/mocks/css-color.cjs'
};

const config = {
  cacheDirectory: '<rootDir>/.jest-cache',
  // 測試環境 - 使用 jsdom 環境來支持 DOM 測試
  testEnvironment: 'jsdom',

  // 預設置文件（在模組載入前執行，用於全局 mock）
  setupFiles: ['<rootDir>/tests/presetup.cjs'],

  // 測試設置文件（在模組載入後執行）
  setupFilesAfterEnv: ['<rootDir>/tests/setup.cjs'],

  projects: [
    {
      displayName: 'unit',
      cacheDirectory: '<rootDir>/.jest-cache',
      testEnvironment: 'jsdom',
      testMatch: [
        '<rootDir>/tests/unit/**/*.test.js',
        '<rootDir>/tests/unit/**/*.spec.js',
        '<rootDir>/tests/unit/helpers/**/*.test.mjs',
        '<rootDir>/tests/unit/performance/PerformanceOptimizer.comprehensive.test.mjs',
        '<rootDir>/tests/unit/scripts/check-size-gates.test.mjs',
        '<rootDir>/tests/unit/scripts/inject-manifest-key.test.mjs',
        '<rootDir>/tests/unit/scripts/package-extension.test.mjs',
        '<rootDir>/tests/contract/**/*.test.js',
        '<rootDir>/tests/contract/ci/ciPolicyContract.test.mjs',
        '<rootDir>/tests/contract/module-surfaces/RetryManager.contract.test.mjs'
      ],
      setupFiles: ['<rootDir>/tests/presetup.cjs'],
      setupFilesAfterEnv: ['<rootDir>/tests/setup.cjs'],
      moduleNameMapper: JEST_MODULE_NAME_MAPPER,
      transform: {
        '^.+\\.(m?[tj]sx?)$': SWC_JEST_TRANSFORM,
      },
      transformIgnorePatterns: ESM_TRANSFORM_IGNORE_PATTERNS
    },
    {
      displayName: 'integration',
      cacheDirectory: '<rootDir>/.jest-cache',
      testEnvironment: 'jsdom',
      testMatch: [
        '<rootDir>/tests/integration/**/*.test.js',
        '<rootDir>/tests/integration/**/*.spec.js',
        '<rootDir>/tests/integration/helpers/**/*.test.mjs'
      ],
      setupFiles: ['<rootDir>/tests/presetup.cjs'],
      setupFilesAfterEnv: ['<rootDir>/tests/setup.cjs'],
      moduleNameMapper: JEST_MODULE_NAME_MAPPER,
      transform: {
        '^.+\\.(m?[tj]sx?)$': SWC_JEST_TRANSFORM,
      },
      transformIgnorePatterns: ESM_TRANSFORM_IGNORE_PATTERNS
    }
  ],

  // 覆蓋率收集
  collectCoverageFrom: [
    '<rootDir>/scripts/**/*.js',
    '<rootDir>/pages/**/*.js',
    '!<rootDir>/scripts/config/index.js',              // 純 re-export barrel file
    '!<rootDir>/scripts/config/extension/**/*.js',     // extension-only 純常量配置與 re-export
    // Toolbar 鏈：DCE guard 位於 scripts/highlighter/windowAPI.js
    // (TOOLBAR_TEST_FIXTURE_ENABLED 與 ensureToolbar(state))，而非 Toolbar files 本身。
    // rollup/content.config.mjs 將 globalThis.__UNIT_TESTING__ 替換為 false，
    // Terser 隨後移除 ensureToolbar 內部死碼 (assertTestFixtureDce.mjs 把關)。
    // 因此這八個檔案在 prod bundle 完全 unreachable，僅供 legacy unit test 載入，
    // 覆蓋率不代表 production 行為，從覆蓋率排除是恰當的。
    '!<rootDir>/scripts/highlighter/ui/Toolbar.js',
    '!<rootDir>/scripts/highlighter/ui/ToolbarRuntime.js',
    '!<rootDir>/scripts/highlighter/ui/ToolbarState.js',
    '!<rootDir>/scripts/highlighter/ui/ToolbarUI.js',
    '!<rootDir>/scripts/highlighter/ui/styles/toolbarStyles.js',
    '!<rootDir>/scripts/highlighter/ui/components/ColorPicker.js',
    '!<rootDir>/scripts/highlighter/ui/components/MiniIcon.js',
    '!<rootDir>/scripts/highlighter/ui/components/ToolbarContainer.js',
    '!<rootDir>/scripts/**/*.test.js',
    '!<rootDir>/scripts/**/*.spec.js',
    '!**/node_modules/**'
  ],

  // Incumbent Jest/SWC coverage is retained as fallback and contract evidence.
  // Official local threshold ownership lives in jest.native-esm.config.cjs.
  coverageThreshold: {
    global: {
      branches: 0,
      functions: 0,
      lines: 0,
      statements: 0
    }
  },

  // 覆蓋率報告格式
  coverageReporters: ['text', 'lcov', 'html', 'json'],

  // 覆蓋率輸出目錄
  coverageDirectory: 'coverage/jest',

  // 忽略的路徑
  testPathIgnorePatterns: [
    '/node_modules/',
    '/archive/',
    '/internal/',
    '/tests/manual/', // 手動測試放在此目錄，不應在 CI 或常規測試中執行
    '/tests/e2e/' // e2e 測試單獨執行，不進入單元測試與覆蓋率
  ],
  // 忽略模組路徑以避免 Jest Haste Map 命名衝突（重複的 package.json）
  modulePathIgnorePatterns: ['<rootDir>/releases/'],

  // 轉換配置（如果需要）
  transform: {
    '^.+\\.(m?[tj]sx?)$': SWC_JEST_TRANSFORM,
  },

  // 轉換 node_modules 中的 ES 模組
  transformIgnorePatterns: ESM_TRANSFORM_IGNORE_PATTERNS,

  // 模組名稱映射（用於模擬 Chrome API）
  moduleNameMapper: JEST_MODULE_NAME_MAPPER,

  // 防止測試掛起
  // forceExit: false 讓掛起問題暴露出來,而非被掩蓋
  // detectOpenHandles: false 為速度優化;遇到掛起時用 npm test -- --detectOpenHandles 診斷
  forceExit: false,
  detectOpenHandles: false,

  // 增加超時時間（30秒）
  // 默認逾時設定 10 秒，促使超時測試能提早報錯
  testTimeout: 10000,

  // Node.js 20.x 性能優化設置
  maxWorkers: 4, // 略微提高以便利用更多核心
  maxConcurrency: 5,  // 略微提高並發測試數量

  // 減少不必要的 mock 清理以提升性能
  clearMocks: false, // 改為手動清理特定測試
  resetMocks: false,  // 改為手動重置特定測試
  restoreMocks: true, // 強制每個測試後還原 spyOn mocks，避免污染

  // 性能優化
  bail: false, // 不在第一個失敗時停止，繼續執行所有測試
  verbose: false // 關閉詳細輸出以提升速度
};

export default config;
