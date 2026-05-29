import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import { createVisualizerPlugin } from './visualizer.config.mjs';
import { isDev } from './shared/env.mjs';
import { createTerserPlugin } from './shared/terser.mjs';
import { createOnWarn } from './shared/onwarn.mjs';
import { stripTestConfig } from './plugins/stripTestConfig.mjs';

export default {
  input: 'scripts/background.js',
  output: {
    file: 'dist/scripts/background.js',
    format: 'es', // Service Worker supports ES modules
    sourcemap: isDev ? 'inline' : false,
    banner: '/* eslint-disable */\n/* Save to Notion - Background Script */',
  },
  plugins: [
    !isDev && stripTestConfig(),
    resolve({
      browser: true,
      preferBuiltins: false,
    }),
    commonjs(),
    json(),
    !isDev &&
      createTerserPlugin({
        pureFuncs: ['console.log', 'console.debug', 'console.info'],
      }),
    createVisualizerPlugin('background-bundle', 'Background Bundle Analysis'),
  ].filter(Boolean),
  onwarn: createOnWarn(),
};
