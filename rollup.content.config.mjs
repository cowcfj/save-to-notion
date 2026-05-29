import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import replace from '@rollup/plugin-replace';
import { createVisualizerPlugin } from './rollup.visualizer.config.mjs';
import { isDev } from './rollup/shared/env.mjs';
import { createTerserPlugin } from './rollup/shared/terser.mjs';
import { createOnWarn } from './rollup/shared/onwarn.mjs';
import { stripTestConfig } from './rollup/plugins/stripTestConfig.mjs';
import { assertTestFixtureDce } from './rollup/plugins/assertTestFixtureDce.mjs';

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
      createTerserPlugin({
        passes: 2,
        pureFuncs: [
          'console.log',
          'console.debug',
          'console.info',
          'Logger.debug',
          'Logger.log',
          'Logger.info',
        ],
        mangleReserved: ['ContentScript', 'extractPageContent', 'Logger'],
      }),
    createVisualizerPlugin('content-bundle', 'Content Bundle Analysis'),
    !isDev && assertTestFixtureDce(),
  ].filter(Boolean),
  onwarn: createOnWarn({ circular: 'log' }),
};
