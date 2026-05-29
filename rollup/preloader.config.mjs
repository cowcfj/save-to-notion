import { createVisualizerPlugin } from './visualizer.config.mjs';
import { isDev } from './shared/env.mjs';
import { createTerserPlugin } from './shared/terser.mjs';
import { createOnWarn } from './shared/onwarn.mjs';

export default {
  input: 'scripts/performance/preloader.js',
  output: {
    file: 'dist/preloader.js',
    format: 'iife',
    name: 'NotionPreloader',
    sourcemap: isDev ? 'inline' : false, // 生產環境不生成 sourcemap（保持極輕量）
    banner: '/* Save to Notion - Preloader */',
  },
  plugins: [
    !isDev && createTerserPlugin({ dropConsole: true }),
    createVisualizerPlugin('preloader-bundle', 'Preloader Bundle Analysis'),
  ].filter(Boolean),
  onwarn: createOnWarn(),
};
