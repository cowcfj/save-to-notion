import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
  input: 'scripts/sidepanel/sidepanel.js',
  output: {
    file: 'dist/sidepanel.bundle.js',
    format: 'es', // 使用 ES 模組格式
  },
  plugins: [
    resolve(), // 幫助 rollup 找到外部模組
    commonjs(), // 將 CommonJS 轉換成 ES6
  ],
};
