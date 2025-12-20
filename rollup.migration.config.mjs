/**
 * Rollup Configuration - Migration Executor
 *
 * 獨立打包遷移執行器，供 Background Script 動態注入
 */

import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';

const isDev = process.env.NODE_ENV !== 'production';

export default {
    input: 'scripts/legacy/MigrationExecutor.js',
    output: {
        file: 'dist/migration-executor.js',
        format: 'iife',
        name: 'MigrationExecutor',
        sourcemap: isDev ? 'inline' : true,
        banner: '/* eslint-disable */\n/* Save to Notion - Migration Executor */',
    },
    plugins: [
        resolve(),
        !isDev &&
        terser({
            compress: {
                drop_console: false, // 保留日誌以便調試遷移過程
                drop_debugger: true,
            },
            mangle: {
                reserved: ['MigrationExecutor', 'MigrationPhase', 'Logger'],
            },
            format: {
                comments: false,
            },
        }),
    ].filter(Boolean),
    onwarn(warning, warn) {
        if (warning.code === 'THIS_IS_UNDEFINED') return;
        if (warning.code === 'CIRCULAR_DEPENDENCY') return;
        warn(warning);
    },
};
