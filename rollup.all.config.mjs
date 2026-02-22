import contentConfig from './rollup.content.config.mjs';
import backgroundConfig from './rollup.background.config.mjs';
import migrationConfig from './rollup.migration.config.mjs';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';

const isDev = process.env.NODE_ENV !== 'production';

const terserPlugin =
  !isDev &&
  terser({
    compress: {
      drop_console: true,
      drop_debugger: true,
    },
    mangle: true,
    format: {
      comments: false,
    },
  });

const preloaderConfig = {
  input: 'scripts/performance/preloader.js',
  output: {
    file: 'dist/preloader.js',
    format: 'iife',
    name: 'NotionPreloader',
    sourcemap: isDev ? 'inline' : false, // 生產環境不生成 sourcemap（保持極輕量）
    banner: '/* Save to Notion - Preloader */',
  },
  plugins: [terserPlugin].filter(Boolean),
  onwarn(warning, warn) {
    if (warning.code === 'THIS_IS_UNDEFINED') return;
    warn(warning);
  },
};

const sidepanelConfig = {
  input: 'sidepanel/sidepanel.js',
  output: {
    file: 'dist/sidepanel.bundle.js',
    format: 'es', // 使用 ES 模組格式
    sourcemap: isDev ? 'inline' : false,
  },
  plugins: [
    resolve(), // 幫助 rollup 找到外部模組
    commonjs(), // 將 CommonJS 轉換成 ES6
    terserPlugin,
  ].filter(Boolean),
};

export default [contentConfig, backgroundConfig, migrationConfig, preloaderConfig, sidepanelConfig];
