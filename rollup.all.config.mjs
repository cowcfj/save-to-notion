import contentConfig from './rollup.content.config.mjs';
import backgroundConfig from './rollup.background.config.mjs';
import migrationConfig from './rollup.migration.config.mjs';
import { createVisualizerPlugin } from './rollup.visualizer.config.mjs';
import { isDev } from './rollup/shared/env.mjs';
import { createTerserPlugin } from './rollup/shared/terser.mjs';
import { createOnWarn } from './rollup/shared/onwarn.mjs';

const preloaderConfig = {
  input: 'scripts/performance/preloader.js',
  output: {
    file: 'dist/preloader.js',
    format: 'iife',
    name: 'NotionPreloader',
    sourcemap: isDev ? 'inline' : false, // 生產環境不生成 sourcemap（保持極輕量）
    banner: '/* Save to Notion - Preloader */',
  },
  plugins: [
    !isDev && createTerserPlugin({ dropConsole: true, mangleAll: true }),
    createVisualizerPlugin('preloader-bundle', 'Preloader Bundle Analysis'),
  ].filter(Boolean),
  onwarn: createOnWarn(),
};

export default [contentConfig, backgroundConfig, migrationConfig, preloaderConfig];
