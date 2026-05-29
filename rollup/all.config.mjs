import contentConfig from './content.config.mjs';
import backgroundConfig from './background.config.mjs';
import migrationConfig from './migration.config.mjs';
import { createVisualizerPlugin } from './visualizer.config.mjs';
import { isDev } from './shared/env.mjs';
import { createTerserPlugin } from './shared/terser.mjs';
import { createOnWarn } from './shared/onwarn.mjs';

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
