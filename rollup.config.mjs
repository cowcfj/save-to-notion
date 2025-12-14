import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';

const isDev = process.env.NODE_ENV !== 'production';

export default {
  input: 'scripts/highlighter/index.js',
  output: {
    file: 'dist/highlighter-v2.bundle.js',
    format: 'iife',
    name: 'HighlighterModule',
    sourcemap: isDev ? 'inline' : true, // 開發：inline，生產：external
    banner: '/* Save to Notion - Highlighter V2 */',
  },
  plugins: [
    resolve(),
    !isDev &&
    terser({
      compress: {
        drop_console: false, // 保留 console.log（除錯需要）
        drop_debugger: true, // 移除 debugger
        pure_funcs: [
          // 移除特定 debug 函式
          'console.debug',
        ],
      },
      mangle: {
        reserved: [
          // 保留這些全局名稱
          'HighlighterModule', // 主要導出（與 output.name 一致）
          'Logger', // window.Logger
          'StorageUtil', // window.StorageUtil
        ],
      },
      format: {
        comments: false, // 移除所有註釋
      },
    }),
  ].filter(Boolean), // 過濾掉 false 值（開發環境時 terser 為 false）
  onwarn(warning, warn) {
    // 忽略某些常見警告
    if (warning.code === 'THIS_IS_UNDEFINED') return;
    if (warning.code === 'CIRCULAR_DEPENDENCY') return;
    warn(warning);
  },
};
