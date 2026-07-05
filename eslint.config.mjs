import { globalIgnores } from 'eslint/config';
import regexp from 'eslint-plugin-regexp';
import sonarjs from 'eslint-plugin-sonarjs';
import security from 'eslint-plugin-security';
import unicorn from 'eslint-plugin-unicorn';
import jest from 'eslint-plugin-jest';
import promise from 'eslint-plugin-promise';
import compat from 'eslint-plugin-compat';
import jsdoc from 'eslint-plugin-jsdoc';

const nonAdoptedUnicornRules = {
  'unicorn/better-dom-traversing': 'off',
  'unicorn/class-reference-in-static-methods': 'off',
  'unicorn/consistent-boolean-name': 'off',
  'unicorn/consistent-class-member-order': 'off',
  'unicorn/consistent-conditional-object-spread': 'off',
  'unicorn/logical-assignment-operators': 'off',
  'unicorn/max-nested-calls': 'off',
  'unicorn/name-replacements': 'off',
  'unicorn/no-array-from-fill': 'off',
  'unicorn/no-break-in-nested-loop': 'off',
  'unicorn/no-computed-property-existence-check': 'off',
  'unicorn/no-declarations-before-early-exit': 'off',
  'unicorn/no-for-each': 'off',
  'unicorn/no-return-array-push': 'off',
  'unicorn/prefer-private-class-fields': 'off',
  'unicorn/no-this-outside-of-class': 'off',
  'unicorn/no-top-level-assignment-in-function': 'off',
  'unicorn/no-top-level-side-effects': 'off',
  'unicorn/no-undeclared-class-members': 'off',
  'unicorn/no-useless-else': 'off',
  'unicorn/no-useless-template-literals': 'off',
  'unicorn/prefer-add-event-listener-options': 'off',
  'unicorn/prefer-array-from-map': 'off',
  'unicorn/prefer-await': 'off',
  'unicorn/prefer-boolean-return': 'off',
  'unicorn/prefer-continue': 'off',
  'unicorn/prefer-dom-node-replace-children': 'off',
  'unicorn/prefer-early-return': 'off',
  'unicorn/prefer-else-if': 'off',
  'unicorn/prefer-global-number-constants': 'off',
  'unicorn/prefer-hoisting-branch-code': 'off',
  'unicorn/prefer-includes-over-repeated-comparisons': 'off',
  'unicorn/prefer-iterator-to-array': 'off',
  'unicorn/prefer-logical-operator-over-ternary': 'off',
  'unicorn/prefer-math-constants': 'off',
  'unicorn/prefer-minimal-ternary': 'off',
  'unicorn/prefer-number-coercion': 'off',
  'unicorn/prefer-number-is-safe-integer': 'off',
  'unicorn/prefer-object-define-properties': 'off',
  'unicorn/prefer-object-iterable-methods': 'off',
  'unicorn/prefer-promise-try': 'off',
  'unicorn/prefer-promise-with-resolvers': 'off',
  'unicorn/prefer-queue-microtask': 'off',
  'unicorn/prefer-scoped-selector': 'off',
  'unicorn/prefer-split-limit': 'off',
  'unicorn/prefer-string-repeat': 'off',
  'unicorn/prefer-unicode-code-point-escapes': 'off',
  'unicorn/prefer-url-href': 'off',
};

const testHarnessGlobalRules = {
  'sonarjs/no-clear-text-protocols': 'off',
  'unicorn/no-global-object-property-assignment': 'off',
  'unicorn/no-error-property-assignment': 'off',
  'unicorn/no-incorrect-template-string-interpolation': 'off',
  'unicorn/no-unnecessary-global-this': 'off',
  'unicorn/prefer-https': 'off',
  'unicorn/require-css-escape': 'off',
};

const runtimeGlobalContractRules = {
  'unicorn/no-global-object-property-assignment': 'off',
  'unicorn/no-unnecessary-global-this': 'off',
  'unicorn/no-top-level-side-effects': 'off',
};

export default [
  globalIgnores(['.tmp/**']),
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
      'no-console': ['error', { allow: ['error'] }],

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
      complexity: ['warn', { max: 10 }],

      // --- Plugin Rules ---

      // 1. SonarJS
      ...sonarjs.configs.recommended.rules,
      'sonarjs/cognitive-complexity': ['warn', 15],
      'sonarjs/no-duplicate-string': 'warn',
      // S1135（待辦標記）降為 warn：保留 IDE/CLI 提示，但不阻擋 commit/push，
      // 讓追蹤用的註解（如指向 docs/plans 的後續任務）可與代碼共存。
      'sonarjs/todo-tag': 'warn',

      // 2. Security
      ...security.configs.recommended.rules,
      'security/detect-object-injection': 'off',

      // 3. Unicorn
      ...unicorn.configs.recommended.rules,
      // 個別規則覆蓋以維持開發彈性
      ...nonAdoptedUnicornRules,
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
      'unicorn/number-literal-case': ['error', { hexadecimalValue: 'lowercase' }],

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
      'no-restricted-imports': [
        'error',
        {
          patterns: [],
        },
      ],
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
    files: ['scripts/content/**/*.js', 'scripts/highlighter/**/*.js', 'scripts/performance/**/*.js'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '../config/index.js',
              message: 'Content/highlighter/performance 路徑必須直接匯入精準 config 子模組。',
            },
            {
              name: '../../config/index.js',
              message: 'Content/highlighter/performance 路徑必須直接匯入精準 config 子模組。',
            },
            {
              name: '../../../config/index.js',
              message: 'Content/highlighter/performance 路徑必須直接匯入精準 config 子模組。',
            },
            {
              name: '../config/shared/index.js',
              message: 'Content/highlighter/performance 路徑不得匯入 shared aggregate barrel。',
            },
            {
              name: '../../config/shared/index.js',
              message: 'Content/highlighter/performance 路徑不得匯入 shared aggregate barrel。',
            },
            {
              name: '../../../config/shared/index.js',
              message: 'Content/highlighter/performance 路徑不得匯入 shared aggregate barrel。',
            },
          ],
        },
      ],
    },
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
    files: ['**/*.cjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
    },
    plugins: {
      security,
      jest,
    },
    rules: {
      'security/detect-non-literal-fs-filename': 'warn',
      'jest/expect-expect': 'warn',
    },
  },
  {
    files: ['.agents/skills/**/*.js', 'scripts/utils/Logger.js'],
    rules: {
      'no-console': 'off',
      'unicorn/no-abusive-eslint-disable': 'off',
    },
  },
  {
    files: [
      'scripts/background/backgroundLifecycleTestSurface.js',
      'scripts/content/index.js',
      'scripts/content/converters/ContentBridge.js',
      'scripts/highlighter/core/HighlightManager.js',
      'scripts/highlighter/index.js',
      'scripts/highlighter/ui/FloatingRailRuntime.js',
      'scripts/highlighter/utils/floatingRailAvailability.js',
      'scripts/highlighter/windowAPI.js',
      'scripts/legacy/MigrationExecutor.js',
      'scripts/performance/preloader.js',
      'scripts/utils/image/srcsetParserAdapter.js',
      'scripts/utils/imageUtils.js',
      'scripts/utils/Logger.js',
    ],
    rules: runtimeGlobalContractRules,
  },
  {
    files: ['tests/**/*.js'],
    plugins: { jest },
    rules: {
      ...jest.configs.recommended.rules,
      ...testHarnessGlobalRules,
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
      complexity: 'off',
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
