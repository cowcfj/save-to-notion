import resolve from '@rollup/plugin-node-resolve';

const isProduction = process.env.NODE_ENV === 'production';

export default {
    input: 'scripts/highlighter/index.js',
    output: {
        file: 'dist/highlighter-v2.bundle.js',
        format: 'iife',
        name: 'HighlighterV2',
        sourcemap: isProduction ? true : 'inline',
        banner: '/* Save to Notion - Highlighter V2 */'
    },
    plugins: [
        resolve()
    ],
    external: ['chrome'],
    onwarn(warning, warn) {
        // 忽略某些常見警告
        if (warning.code === 'THIS_IS_UNDEFINED') return;
        if (warning.code === 'CIRCULAR_DEPENDENCY') return;
        warn(warning);
    }
};
