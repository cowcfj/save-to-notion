
import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';

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
                code: code.replace(regex, ''),
                map: null
            };
        }
        return null;
    }
});


export default {
    input: 'scripts/background.js',
    output: {
        file: 'dist/scripts/background.js',
        format: 'es', // Service Worker supports ES modules
        sourcemap: isDev ? 'inline' : true,
        banner: '/* eslint-disable */\n/* Save to Notion - Background Script */',
        // 橋接：Service Worker 環境使用 self，提供 Logger 回退

    },
    plugins: [
        stripTestConfig(),
        resolve(),
        !isDev &&
        terser({
            compress: {
                drop_console: true,
                drop_debugger: true,
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
