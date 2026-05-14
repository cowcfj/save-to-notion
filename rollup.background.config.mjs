import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import { createVisualizerPlugin } from './rollup.visualizer.config.mjs';
import { stripTestConfig } from './rollup/plugins/stripTestConfig.mjs';

const isDev = process.env.NODE_ENV !== 'production';

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
      terser({
        compress: {
          drop_debugger: true,
          pure_funcs: ['console.log', 'console.debug', 'console.info'],
        },
        format: {
          comments: false,
        },
      }),
    createVisualizerPlugin('background-bundle', 'Background Bundle Analysis'),
  ].filter(Boolean),
  onwarn(warning, warn) {
    if (warning.code === 'THIS_IS_UNDEFINED') return;
    warn(warning);
  },
};
