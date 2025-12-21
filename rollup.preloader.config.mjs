import terser from '@rollup/plugin-terser';

const isDev = process.env.NODE_ENV !== 'production';

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
    !isDev &&
      terser({
        compress: {
          drop_console: true, // 移除 console.log（生產環境）
          drop_debugger: true,
        },
        mangle: true,
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
