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
      'lib/turndown.js',
      'lib/turndown-plugin-gfm.js',
      'tests/manual/**',
      '*.config.js'
    ]
  }
];