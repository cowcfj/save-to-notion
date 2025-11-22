// 臨時入口點 - 用於測試 Rollup 配置
// TODO: 在階段 2 將會被實際的模組化程式碼替換

console.log('Highlighter V2 - Rollup Test Entry Point');

// 簡單的測試 export
export const version = '2.0.0-alpha';
export const isRollupBuild = true;

// 模擬 window export（Chrome Extension 相容性）
if (typeof window !== 'undefined') {
    window.HighlighterV2 = window.HighlighterV2 || {};
    window.HighlighterV2.version = version;
    window.HighlighterV2.isRollupBuild = isRollupBuild;
}
