const regexp = require('eslint-plugin-regexp');

module.exports = [
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 12,
      sourceType: 'module',
      globals: {
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        navigator: 'readonly',

        // Node.js globals
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',

        // Jest globals
        describe: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        jest: 'readonly',

        // Chrome Extension globals
        chrome: 'readonly',

        // Project-specific globals
        Readability: 'readonly',
        SrcsetParser: 'readonly',
        AttributeExtractor: 'readonly',
        FallbackStrategies: 'readonly',
        ErrorHandler: 'readonly',
        RetryManager: 'readonly',
        withRetry: 'readonly',
        fetchWithRetry: 'readonly',
        Node: 'readonly'
      }
    },
    plugins: {
      regexp
    },
    rules: {
      // Base ESLint rules
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_', // 忽略以下劃線開頭的未使用參數（用於接口一致性）
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_' // 忽略以下劃線開頭的未使用 catch 參數
      }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-case-declarations': 'off',
      'no-implicit-coercion': ['error', {
        boolean: true,
        number: false,
        string: false,
        disallowTemplateShorthand: false
      }],

      // Code Style - Modern JavaScript practices
      'prefer-template': 'warn',              // 強制使用模板字串代替字串串接
      'object-shorthand': ['warn', 'always'], // 要求物件屬性和方法使用簡寫語法
      'prefer-const': 'warn',                 // 優先使用 const
      'prefer-arrow-callback': ['warn', {    // 優先使用箭頭函數
        allowNamedFunctions: false,
        allowUnboundThis: true
      }],
      'no-var': 'warn',                       // 禁止使用 var

      // Variable Naming
      'id-length': ['warn', {                 // 變數名最小長度
        min: 2,
        exceptions: ['i', 'j', 'k', 'x', 'y', 'z', '_'],
        properties: 'never'
      }],

      // Best Practices
      'eqeqeq': ['warn', 'always', {         // 要求使用 === 和 !==
        null: 'ignore'
      }],
      'curly': ['warn', 'all'],              // 要求所有控制語句使用大括號
      'dot-notation': 'warn',                 // 要求使用點號訪問屬性
      'no-else-return': 'warn',              // 禁止 if 語句中 return 後有 else
      'no-lonely-if': 'warn',                // 禁止 if 作為唯一的語句出現在 else 中

      // Regexp plugin rules - Critical (errors)
      'regexp/no-invalid-regexp': 'error',

      // Regexp plugin rules - Important (warnings)
      'regexp/no-super-linear-backtracking': 'warn',
      'regexp/no-unused-capturing-group': 'warn',
      'regexp/no-control-character': 'warn',
      'regexp/optimal-quantifier-concatenation': 'warn',
      'regexp/prefer-unicode-codepoint-escapes': 'warn',
      'regexp/unicode-escape': 'warn',
      'regexp/no-useless-flag': 'warn',
      'regexp/prefer-regexp-exec': 'warn',
      'regexp/prefer-regexp-test': 'warn'
    },
    // Report unnecessary eslint-disable comments to keep codebase clean
    // 報告不必要的 eslint-disable 註解以保持程式碼庫清潔
    linterOptions: {
      reportUnusedDisableDirectives: true
    }
  },
  {
    // Ignore patterns
    ignores: [
      'node_modules/**',
      'coverage/**',
      'dist/**',
      'build/**',
      '.nyc_output/**',
      '.history/**',
      'archive/**',
      'lib/**', // 排除所有第三方 vendored 代碼
      'tests/manual/**',
      '*.config.js'
    ]
  }
];