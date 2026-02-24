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

export default [contentConfig, backgroundConfig, migrationConfig, preloaderConfig];
