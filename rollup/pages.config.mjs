import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import { createVisualizerPlugin } from './visualizer.config.mjs';
import { isDev } from './shared/env.mjs';
import { createTerserPlugin } from './shared/terser.mjs';
import { createOnWarn } from './shared/onwarn.mjs';
import { stripTestConfig } from './plugins/stripTestConfig.mjs';

export default {
  input: {
    popup: 'pages/popup/popup.js',
    options: 'pages/options/options.js',
    sidepanel: 'pages/sidepanel/sidepanel.js',
    onboarding: 'pages/onboarding/onboarding.js',
    'update-notification': 'pages/update-notification/update-notification.js',
    auth: 'scripts/auth/auth.js',
  },
  output: {
    dir: 'dist/pages',
    format: 'es', // Use ES modules for page scripts
    sourcemap: isDev ? 'inline' : false,
    banner: '/* eslint-disable */\n/* Save to Notion - Page Bundle */',
    entryFileNames: '[name].js',
    chunkFileNames: 'shared/[name].js',
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
        pureFuncs: [
          'console.debug',
          'console.info',
          'Logger.debug',
          'Logger.log',
          'Logger.info',
        ],
      }),
    createVisualizerPlugin('pages-bundle', 'Pages Bundle Analysis'),
  ].filter(Boolean),
  onwarn: createOnWarn({ circular: 'log' }),
};
