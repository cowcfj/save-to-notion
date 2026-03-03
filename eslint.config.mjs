import regexp from 'eslint-plugin-regexp';
import sonarjs from 'eslint-plugin-sonarjs';
import security from 'eslint-plugin-security';
import unicorn from 'eslint-plugin-unicorn';
import jest from 'eslint-plugin-jest';
import promise from 'eslint-plugin-promise';
import compat from 'eslint-plugin-compat';
import jsdoc from 'eslint-plugin-jsdoc';

export default [
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
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
        Node: 'readonly',
      },
    },
    plugins: {
      regexp,
      sonarjs,
      security,
      unicorn,
      jest,
      promise,
      compat,
      jsdoc,
    },
    rules: {
      // Base ESLint rules
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-case-declarations': 'off',
      'no-implicit-coercion': [
        'warn',
        {
          boolean: true,
          number: false,
          string: false,
          disallowTemplateShorthand: false,
        },
      ],
      'no-console': ['error', { allow: ['warn', 'error', 'info'] }],

      // Code Style
      'prefer-template': 'error',
      'object-shorthand': ['error', 'always'],
      'prefer-const': 'error',
      'prefer-arrow-callback': [
        'warn',
        {
          allowNamedFunctions: false,
          allowUnboundThis: true,
        },
      ],
      'no-var': 'error',

      // Variable Naming
      'id-length': [
        'warn',
        {
          min: 2,
          exceptions: ['i', 'j', 'k', 'x', 'y', 'z', '_', '$'],
          properties: 'never',
        },
      ],

      // Best Practices
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      curly: ['error', 'all'],
      'dot-notation': 'warn',
      'no-else-return': 'warn',
      'no-lonely-if': 'warn',

      // --- Plugin Rules ---

      // 1. SonarJS
      ...sonarjs.configs.recommended.rules,
      'sonarjs/cognitive-complexity': ['warn', 15],
      'sonarjs/no-duplicate-string': 'warn',

      // 2. Security
      ...security.configs.recommended.rules,
      'security/detect-object-injection': 'off',

      // 3. Unicorn
      ...unicorn.configs.recommended.rules,
      // 個別規則覆蓋以維持開發彈性
      'unicorn/no-array-for-each': 'off',
      'unicorn/no-null': 'off',
      'unicorn/prefer-module': 'off',
      'unicorn/prefer-node-protocol': 'off',
      'unicorn/prefer-ternary': 'off',
      'unicorn/filename-case': 'off',
      'unicorn/prevent-abbreviations': 'off',
      'unicorn/no-useless-undefined': 'off',
      'unicorn/prefer-spread': 'off',
      'unicorn/no-zero-fractions': 'off',

      // 4. Promise
      ...promise.configs.recommended.rules,
      'promise/always-return': 'off',
      'promise/catch-or-return': 'error',

      // 5. Compat
      ...compat.configs.recommended.rules,

      // 6. JSDoc
      'jsdoc/check-access': 'warn',
      'jsdoc/check-alignment': 'warn',
      'jsdoc/check-param-names': 'warn',
      'jsdoc/check-property-names': 'warn',
      'jsdoc/check-tag-names': [
        'warn',
        { definedTags: ['jest-environment', 'jest-environment-options'] },
      ],
      'jsdoc/check-types': 'warn',
      'jsdoc/check-values': 'warn',
      'jsdoc/empty-tags': 'warn',
      'jsdoc/implements-on-classes': 'warn',
      'jsdoc/multiline-blocks': 'warn',
      'jsdoc/no-multi-asterisks': 'warn',
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/require-param': 'warn',
      'jsdoc/require-param-description': 'off',
      'jsdoc/require-param-name': 'warn',
      'jsdoc/require-param-type': 'warn',
      'jsdoc/require-property': 'warn',
      'jsdoc/require-property-description': 'off',
      'jsdoc/require-property-name': 'warn',
      'jsdoc/require-property-type': 'warn',
      'jsdoc/require-returns': 'warn',
      'jsdoc/require-returns-check': 'warn',
      'jsdoc/require-returns-description': 'off',
      'jsdoc/require-returns-type': 'warn',
      'jsdoc/require-yields': 'warn',
      'jsdoc/require-yields-check': 'warn',
      'jsdoc/tag-lines': ['warn', 'never', { startLines: 1 }],
      'jsdoc/valid-types': 'warn',

      // Regexp
      'regexp/no-invalid-regexp': 'error',
      'regexp/no-super-linear-backtracking': 'warn',
      'regexp/no-unused-capturing-group': 'warn',
      'regexp/no-control-character': 'warn',
      'regexp/optimal-quantifier-concatenation': 'warn',
      'regexp/prefer-unicode-codepoint-escapes': 'warn',
      'regexp/unicode-escape': 'warn',
      'regexp/no-useless-flag': 'warn',
      'regexp/prefer-regexp-exec': 'warn',
      'regexp/prefer-regexp-test': 'warn',
    },
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
  },
  {
    files: ['**/*.js'],
    ignores: ['tests/**'],
    rules: {},
  },
  {
    ignores: [
      'node_modules/**',
      'coverage/**',
      'dist/**',
      'build/**',
      '.nyc_output/**',
      '.history/**',
      'docs/archive/**',
      'archive/**',
      'lib/**',
      'tests/manual/**',
      '*.config.js',
    ],
  },
  {
    files: ['.agents/skills/**/*.js', 'scripts/**/*.js'],
    rules: {
      'no-console': 'off',
      'unicorn/no-abusive-eslint-disable': 'off',
    },
  },
  {
    files: ['tests/**/*.js'],
    plugins: { jest },
    rules: {
      ...jest.configs.recommended.rules,
      'jest/expect-expect': 'warn',
      'jest/no-disabled-tests': 'warn',
      'jest/no-focused-tests': 'warn',
      'jest/no-identical-title': 'warn',
      'jest/prefer-to-have-length': 'warn',
      'jest/valid-expect': 'warn',
      'jest/no-conditional-expect': 'off',
      'init-declarations': 'off',
      'no-magic-numbers': 'off',
      'id-length': 'off',
      'sonarjs/no-duplicate-string': 'off',
      'sonarjs/cognitive-complexity': 'off',
      'sonarjs/no-identical-functions': 'off',
      'sonarjs/no-unused-collection': 'off',
      'security/detect-object-injection': 'off',
      'security/detect-unsafe-regex': 'off',
      'security/detect-non-literal-regexp': 'off',
      'regexp/no-super-linear-backtracking': 'off',
      'unicorn/consistent-function-scoping': 'off',
      'no-console': 'off',
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/require-param': 'off',
      'jsdoc/require-returns': 'off',
      'jsdoc/valid-types': 'off', // 測試文件中的 jest docblock 標籤（如 @jest-environment-options）含 JSON，不是標準 JSDoc 類型
      'jsdoc/check-tag-names': [
        'warn',
        { definedTags: ['jest-environment', 'jest-environment-options'] },
      ], // 允許 Jest docblock 標籤
    },
  },
];
