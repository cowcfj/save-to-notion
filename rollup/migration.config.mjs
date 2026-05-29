/**
 * Rollup Configuration - Migration Executor
 *
 * 獨立打包遷移執行器，供 Background Script 動態注入
 */

import resolve from '@rollup/plugin-node-resolve';
import { createVisualizerPlugin } from './visualizer.config.mjs';
import { isDev } from './shared/env.mjs';
import { createTerserPlugin } from './shared/terser.mjs';
import { createOnWarn } from './shared/onwarn.mjs';

export default {
  input: 'scripts/legacy/MigrationExecutor.js',
  output: {
    file: 'dist/migration-executor.js',
    format: 'iife',
    name: 'MigrationExecutor',
    exports: 'named',
    sourcemap: isDev ? 'inline' : false,
    banner: '/* eslint-disable */\n/* Save to Notion - Migration Executor */',
  },
  plugins: [
    resolve(),
    !isDev &&
      createTerserPlugin({
        // dropConsole omitted: keep logs for migration debugging
        mangleReserved: ['MigrationExecutor', 'MigrationPhase', 'Logger'],
      }),
    createVisualizerPlugin('migration-bundle', 'Migration Bundle Analysis'),
  ].filter(Boolean),
  onwarn: createOnWarn({ circular: 'silent' }),
};
