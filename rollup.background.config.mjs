import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';

const isDev = process.env.NODE_ENV !== 'production';

// Custom plugin to strip test exposure code in production
const stripTestConfig = () => ({
  name: 'strip-test-config',
  transform(code, id) {
    if (!isDev) {
      const regex = /\/\/ TEST_EXPOSURE_START[\s\S]*?\/\/ TEST_EXPOSURE_END/g;
      const matches = code.match(regex);
      if (matches) {
        console.log(`[strip-test-config] Stripping ${matches.length} blocks from ${id}`);
      }
      // 返回對象包含 map: null 以消除 sourcemap 警告
      return {
        code: code.replaceAll(regex, ''),
        map: null,
      };
    }
    return null;
  },
});

export default {
  input: 'scripts/background.js',
  output: {
    file: 'dist/scripts/background.js',
    format: 'es', // Service Worker supports ES modules
    sourcemap: isDev ? 'inline' : false,
    banner: '/* eslint-disable */\n/* Save to Notion - Background Script */',
  },
  plugins: [
    stripTestConfig(),
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
  ].filter(Boolean),
  onwarn(warning, warn) {
    if (warning.code === 'THIS_IS_UNDEFINED') return;
    warn(warning);
  },
};
