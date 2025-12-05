import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';

const isDev = process.env.NODE_ENV !== 'production';

export default {
    input: 'scripts/content/index.js',
    output: {
        file: 'dist/content.bundle.js',
        format: 'umd',  // 改為 UMD 格式，自動處理全局變量
        name: 'ContentScript',
        sourcemap: isDev ? 'inline' : true,
        banner: '/* Save to Notion - Content Script */'
    },
    plugins: [
        resolve(),
        !isDev && terser({
            compress: {
                drop_console: true,      // 移除 console.log（生產環境不需要）
                drop_debugger: true,      // 移除 debugger
                pure_funcs: [             // 移除特定 debug 函式
                    'console.debug'
                ]
            },
            mangle: {
                reserved: [               // 保留這些全局名稱
                    'ContentScript',
                    'extractPageContent',
                    'Logger',
                    'ImageUtils'
                ]
            },
            format: {
                comments: false           // 移除所有註釋
            }
        })
    ].filter(Boolean),  // 過濾掉 false 值（開發環境時 terser 為 false）
    onwarn(warning, warn) {
        // 忽略某些常見警告
        if (warning.code === 'THIS_IS_UNDEFINED') return;
        if (warning.code === 'CIRCULAR_DEPENDENCY') return;
        warn(warning);
    }
};
