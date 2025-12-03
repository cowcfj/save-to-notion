/**
 * env.js 環境檢測模組測試
 * 驗證環境檢測函數在不同環境下的正確性
 */

const {
  isExtensionContext,
  isBackgroundContext,
  isContentContext,
  isNodeEnvironment,
  isDevelopment,
  isProduction,
  getEnvironment,
  selectByEnvironment,
  ENV,
} = require('../../../scripts/config/env');

describe('配置模組 - env.js', () => {
  describe('isNodeEnvironment', () => {
    test('應返回 boolean 值', () => {
      const result = isNodeEnvironment();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('isExtensionContext', () => {
    test('應返回 boolean 值', () => {
      const result = isExtensionContext();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('isBackgroundContext', () => {
    test('應返回 boolean 值', () => {
      const result = isBackgroundContext();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('isContentContext', () => {
    test('應返回 boolean 值', () => {
      const result = isContentContext();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('isDevelopment', () => {
    test('應返回 boolean 值', () => {
      const result = isDevelopment();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('isProduction', () => {
    test('應與 isDevelopment 返回相反值', () => {
      expect(isProduction()).toBe(!isDevelopment());
    });

    test('應返回 boolean 值', () => {
      const result = isProduction();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('getEnvironment', () => {
    test('應返回包含所有環境標誌的對象', () => {
      const env = getEnvironment();

      expect(env).toBeDefined();
      expect(typeof env).toBe('object');

      expect(env).toHaveProperty('isExtension');
      expect(env).toHaveProperty('isBackground');
      expect(env).toHaveProperty('isContent');
      expect(env).toHaveProperty('isNode');
      expect(env).toHaveProperty('isDevelopment');
      expect(env).toHaveProperty('isProduction');
    });

    test('所有屬性應為 boolean 值', () => {
      const env = getEnvironment();

      Object.values(env).forEach(value => {
        expect(typeof value).toBe('boolean');
      });
    });

    test('isDevelopment 和 isProduction 應互斥', () => {
      const env = getEnvironment();

      expect(env.isDevelopment).toBe(!env.isProduction);
    });
  });

  describe('selectByEnvironment', () => {
    test('應根據環境返回對應值', () => {
      const devValue = 'development';
      const prodValue = 'production';

      const result = selectByEnvironment(devValue, prodValue);

      if (isDevelopment()) {
        expect(result).toBe(devValue);
      } else {
        expect(result).toBe(prodValue);
      }
    });

    test('應處理不同類型的值', () => {
      expect(selectByEnvironment(1, 2)).toEqual(expect.any(Number));
      expect(selectByEnvironment('dev', 'prod')).toEqual(expect.any(String));
      expect(selectByEnvironment(true, false)).toEqual(expect.any(Boolean));
      expect(selectByEnvironment({ dev: true }, { prod: true })).toEqual(expect.any(Object));
    });

    test('應處理 null 和 undefined', () => {
      const result1 = selectByEnvironment(null, 'prod');
      const result2 = selectByEnvironment('dev', undefined);

      if (isDevelopment()) {
        expect(result1).toBeNull();
        expect(result2).toBe('dev');
      } else {
        expect(result1).toBe('prod');
        expect(result2).toBeUndefined();
      }
    });
  });

  describe('ENV 常量對象', () => {
    test('ENV 對象應被凍結（不可修改）', () => {
      expect(Object.isFrozen(ENV)).toBe(true);
    });

    test('ENV 值應與函數返回值一致', () => {
      expect(ENV.IS_EXTENSION).toBe(isExtensionContext());
      expect(ENV.IS_BACKGROUND).toBe(isBackgroundContext());
      expect(ENV.IS_CONTENT).toBe(isContentContext());
      expect(ENV.IS_NODE).toBe(isNodeEnvironment());
      expect(ENV.IS_DEV).toBe(isDevelopment());
      expect(ENV.IS_PROD).toBe(isProduction());
    });

    test('ENV 提供環境標誌的訪問', () => {
      // 驗證可以訪問這些屬性（getter 函數）
      expect(ENV).toHaveProperty('IS_EXTENSION');
      expect(ENV).toHaveProperty('IS_BACKGROUND');
      expect(ENV).toHaveProperty('IS_CONTENT');
      expect(ENV).toHaveProperty('IS_NODE');
      expect(ENV).toHaveProperty('IS_DEV');
      expect(ENV).toHaveProperty('IS_PROD');
    });
  });

  describe('環境檢測一致性', () => {
    test('getEnvironment 返回值應與獨立函數一致', () => {
      const env = getEnvironment();

      expect(env.isExtension).toBe(isExtensionContext());
      expect(env.isBackground).toBe(isBackgroundContext());
      expect(env.isContent).toBe(isContentContext());
      expect(env.isNode).toBe(isNodeEnvironment());
      expect(env.isDevelopment).toBe(isDevelopment());
      expect(env.isProduction).toBe(isProduction());
    });
  });
});
