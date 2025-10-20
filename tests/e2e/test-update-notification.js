// 測試更新通知功能
// 在瀏覽器控制台中運行此腳本來測試更新通知

(function() {
    'use strict';
    
    console.log('🧪 測試更新通知功能');
    
    // 模擬擴展更新事件
    function testUpdateNotification() {
        // 模擬從 v2.7.2 更新到 v2.7.3
        const mockDetails = {
            reason: 'update',
            previousVersion: '2.7.2'
        };
        
        console.log('模擬更新事件:', mockDetails);
        
        // 直接調用更新處理函數（需要在 background.js 中暴露）
        if (typeof handleExtensionUpdate === 'function') {
            handleExtensionUpdate(mockDetails.previousVersion);
        } else {
            console.warn('handleExtensionUpdate 函數未找到');
        }
    }
    
    // 測試版本比較邏輯
    function testVersionComparison() {
        console.log('🔍 測試版本比較邏輯');
        
        const testCases = [
            { prev: '2.7.2', curr: '2.7.3', expected: true },
            { prev: '2.7.0', curr: '2.8.0', expected: true },
            { prev: '2.6.0', curr: '3.0.0', expected: true },
            { prev: '2.7.3', curr: '2.7.4', expected: false },
            { prev: '2.7.1', curr: '2.7.2', expected: false }
        ];
        
        testCases.forEach(test => {
            const result = shouldShowUpdateNotification(test.prev, test.curr);
            const status = result === test.expected ? '✅' : '❌';
            console.log(`${status} ${test.prev} → ${test.curr}: ${result} (期望: ${test.expected})`);
        });
    }
    
    // 測試重要更新檢查
    function testImportantUpdates() {
        console.log('📋 測試重要更新檢查');
        
        const versions = ['2.7.3', '2.8.0', '2.7.4', '3.0.0'];
        versions.forEach(version => {
            const isImportant = isImportantUpdate(version);
            console.log(`${version}: ${isImportant ? '🔴 重要' : '⚪ 一般'}`);
        });
    }
    
    // 手動打開更新通知頁面
    function openUpdateNotification() {
        const url = chrome.runtime.getURL('update-notification.html');
        chrome.tabs.create({ url: url, active: true });
    }
    
    // 暴露測試函數到全局
    window.testUpdateNotification = testUpdateNotification;
    window.testVersionComparison = testVersionComparison;
    window.testImportantUpdates = testImportantUpdates;
    window.openUpdateNotification = openUpdateNotification;
    
    console.log('✅ 測試函數已準備就緒');
    console.log('可用函數:');
    console.log('- testUpdateNotification() - 測試更新通知');
    console.log('- testVersionComparison() - 測試版本比較');
    console.log('- testImportantUpdates() - 測試重要更新檢查');
    console.log('- openUpdateNotification() - 手動打開更新通知');
    
})();