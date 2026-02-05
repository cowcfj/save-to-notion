import regexp from 'eslint-plugin-regexp';
import sonarjs from 'eslint-plugin-sonarjs';
import security from 'eslint-plugin-security';
import unicorn from 'eslint-plugin-unicorn';
import jest from 'eslint-plugin-jest';
import promise from 'eslint-plugin-promise';
import compat from 'eslint-plugin-compat';
import jsdoc from 'eslint-plugin-jsdoc';

/**
 * 將規則集中的所有 'error' 強制轉換為 'warn'
 * @param {Object} rules 原始規則對象
 * @returns {Object} 轉換後的規則對象
 */
function mapRulesToWarn(rules) {
  const newRules = {};
  for (const [key, value] of Object.entries(rules || {})) {
    if (value === 'error') {
      newRules[key] = 'warn';
    } else if (Array.isArray(value) && value[0] === 'error') {
      newRules[key] = ['warn', ...value.slice(1)];
    } else {
      newRules[key] = value;
    }
  }
  return newRules;
}

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
        Node: 'readonly'
      }
    },
    plugins: {
      regexp,
      sonarjs,
      security,
      unicorn,
      jest,
      promise,
      compat,
      jsdoc
    },
    rules: {
      // Base ESLint rules
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_', 
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-case-declarations': 'off',
      'no-implicit-coercion': ['warn', {
        boolean: true,
        number: false,
        string: false,
        disallowTemplateShorthand: false
      }],
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],

      // Code Style
      'prefer-template': 'warn',
      'object-shorthand': ['warn', 'always'],
      'prefer-const': 'warn',
      'prefer-arrow-callback': ['warn', {
        allowNamedFunctions: false,
        allowUnboundThis: true
      }],
      'no-var': 'warn',

      // Variable Naming
      'id-length': ['warn', {
        min: 2,
        exceptions: ['i', 'j', 'k', 'x', 'y', 'z', '_', '$'],
        properties: 'never'
      }],

      // Best Practices
      'eqeqeq': ['warn', 'always', { null: 'ignore' }],
      'curly': ['warn', 'all'],
      'dot-notation': 'warn',
      'no-else-return': 'warn',
      'no-lonely-if': 'warn',

      // --- Plugin Rules ---

      // 1. SonarJS (所有推薦規則降級為 warn)
      ...mapRulesToWarn(sonarjs.configs.recommended.rules),
      'sonarjs/cognitive-complexity': ['warn', 15],
      'sonarjs/no-duplicate-string': 'warn',

      // 2. Security
      ...security.configs.recommended.rules,
      'security/detect-object-injection': 'off',

      // 3. Unicorn (所有推薦規則降級為 warn)
      ...mapRulesToWarn(unicorn.configs.recommended.rules),
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
      'promise/catch-or-return': 'warn',

      // 5. Compat
      ...compat.configs.recommended.rules,

      // 6. JSDoc
      'jsdoc/check-access': 'warn',
      'jsdoc/check-alignment': 'warn',
      'jsdoc/check-param-names': 'warn',
      'jsdoc/check-property-names': 'warn',
      'jsdoc/check-tag-names': ['warn', { definedTags: ['jest-environment'] }],
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
      'regexp/prefer-regexp-test': 'warn'
    },
    linterOptions: {
      reportUnusedDisableDirectives: true
    }
  },
  {
    files: ['**/*.js'],
    ignores: ['tests/**'],
    rules: {}
  },
  {
    ignores: [
      'node_modules/**',
      'coverage/**',
      'dist/**',
      'build/**',
      '.nyc_output/**',
      '.history/**',
      'archive/**',
      'lib/**',
      'tests/manual/**',
      '*.config.js',
    ]
  },
  {
    files: ['tests/**/*.js'],
    plugins: { jest },
    rules: {
      ...mapRulesToWarn(jest.configs.recommended.rules),
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
      'jsdoc/require-returns': 'off'
    }
  }
];
