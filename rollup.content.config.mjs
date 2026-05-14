import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import replace from '@rollup/plugin-replace';
import terser from '@rollup/plugin-terser';
import { createVisualizerPlugin } from './rollup.visualizer.config.mjs';
import { stripTestConfig } from './rollup/plugins/stripTestConfig.mjs';

const isDev = process.env.NODE_ENV !== 'production';

export default {
  input: 'scripts/content/index.js',
  output: {
    file: 'dist/content.bundle.js',
    format: 'umd',
    name: 'ContentScript',
    sourcemap: isDev ? 'inline' : false,
    banner: '/* eslint-disable */\n/* Save to Notion - Content Script */',
    inlineDynamicImports: true,
  },
  plugins: [
    !isDev && stripTestConfig(),
    resolve(),
    commonjs(),
    !isDev &&
      replace({
        preventAssignment: true,
        values: {
          'globalThis.__UNIT_TESTING__': 'false',
          'globalThis.__CONTENT_SCRIPT_BUILD__': 'true',
        },
      }),
    !isDev &&
      terser({
        compress: {
          drop_debugger: true, // 移除 debugger
          passes: 2,
          pure_funcs: [
            // 移除特定除錯與低優先級日誌函式，保留 warn/error
            'console.log',
            'console.debug',
            'console.info',
            'Logger.debug',
            'Logger.log',
            'Logger.info',
          ],
        },
        mangle: {
          reserved: [
            // 保留這些全局名稱
            'ContentScript',
            'extractPageContent',
            'Logger',
          ],
        },
        format: {
          comments: false, // 移除所有註釋
        },
      }),
    createVisualizerPlugin('content-bundle', 'Content Bundle Analysis'),
  ].filter(Boolean), // 過濾掉 false 值（開發環境時 terser 為 false）
  onwarn(warning, warn) {
    // 忽略某些常見警告
    if (warning.code === 'THIS_IS_UNDEFINED') return;
    if (warning.code === 'CIRCULAR_DEPENDENCY') {
      // 僅記錄警告，不中斷構建
      console.warn(`[WARN] Circular dependency detected: ${warning.message}`);
      return;
    }
    warn(warning);
  },
};
