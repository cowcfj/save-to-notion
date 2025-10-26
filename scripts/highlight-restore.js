// 標註恢復腳本
// 用於在頁面刷新後恢復已保存的標註

(function() {
    

    // 確保必要的依賴已加載
    if (typeof window.initHighlighter !== 'function') {
        console.warn('⚠️ 標註工具未加載，無法恢復標註');
        return;
    }

    // 初始化標註工具
    window.initHighlighter();

    // 如果有 notionHighlighter 對象，嘗試恢復標註
    if (window.notionHighlighter && typeof window.notionHighlighter.manager.forceRestoreHighlights === 'function') {
        
        Promise.resolve(window.notionHighlighter.manager.forceRestoreHighlights())
            .then(success => {
                if (success) {
                    console.log('✅ 標註恢復成功');
                } else {
                    console.warn('⚠️ 標註恢復失敗');
                }
            })
            .catch(error => {
                console.error('❌ 標註恢復過程中出錯:', error);
            });
    } else {
        console.warn('⚠️ 無法找到標註管理器，跳過強制恢復');
    }

    // 隱藏工具欄
    setTimeout(() => {
        if (window.notionHighlighter && typeof window.notionHighlighter.hide === 'function') {
            window.notionHighlighter.hide();
        }
    }, 500);
})();