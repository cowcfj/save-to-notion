/**
 * 簡化版選項頁面 JavaScript
 * 只包含手動 API 設置功能
 */

// 狀態顯示函數
function showStatus(message, type = 'info') {
    const statusDiv = document.getElementById('status');
    const authStatusDiv = document.getElementById('auth-status');
    
    if (statusDiv) {
        statusDiv.textContent = message;
        statusDiv.className = `status ${type}`;
    }
    
    if (authStatusDiv) {
        authStatusDiv.textContent = message;
        authStatusDiv.className = `auth-status ${type}`;
    }
    
    console.log(`[Options] ${type.toUpperCase()}: ${message}`);
}

// 載入保存的設置
async function loadSettings() {
    try {
        const result = await chrome.storage.local.get(['notionApiKey', 'notionDatabaseId']);
        
        const apiKeyInput = document.getElementById('api-key');
        const databaseIdInput = document.getElementById('database-id');
        
        if (result.notionApiKey && apiKeyInput) {
            apiKeyInput.value = result.notionApiKey;
        }
        
        if (result.notionDatabaseId && databaseIdInput) {
            databaseIdInput.value = result.notionDatabaseId;
        }
        
        // 更新狀態顯示
        if (result.notionApiKey && result.notionDatabaseId) {
            showStatus('✅ API 設置已配置', 'success');
        } else if (result.notionApiKey) {
            showStatus('⚠️ 請設置數據庫 ID', 'warning');
        } else {
            showStatus('請設置 API 金鑰和數據庫 ID', 'info');
        }
        
        console.log('[Options] 設置已載入');
        
    } catch (error) {
        console.error('[Options] 載入設置失敗:', error);
        showStatus('載入設置失敗', 'error');
    }
}

// 測試 API 連接
async function testConnection() {
    const apiKeyInput = document.getElementById('api-key');
    const databaseIdInput = document.getElementById('database-id');
    
    const apiKey = apiKeyInput?.value?.trim();
    const databaseId = databaseIdInput?.value?.trim();
    
    if (!apiKey) {
        showStatus('請輸入 API Key', 'error');
        return;
    }
    
    if (!databaseId) {
        showStatus('請輸入數據庫 ID', 'error');
        return;
    }
    
    try {
        showStatus('正在測試連接...', 'info');
        
        // 測試 API Key
        const response = await fetch('https://api.notion.com/v1/users/me', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Notion-Version': '2022-06-28'
            }
        });
        
        if (!response.ok) {
            throw new Error(`API Key 無效: ${response.status} ${response.statusText}`);
        }
        
        const userData = await response.json();
        console.log('[Options] 用戶信息:', userData);
        
        // 測試數據庫訪問
        const dbResponse = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Notion-Version': '2022-06-28'
            }
        });
        
        if (!dbResponse.ok) {
            throw new Error(`數據庫訪問失敗: ${dbResponse.status} ${dbResponse.statusText}`);
        }
        
        const dbData = await dbResponse.json();
        console.log('[Options] 數據庫信息:', dbData);
        
        showStatus(`✅ 連接成功！數據庫: ${dbData.title?.[0]?.plain_text || '未命名數據庫'}`, 'success');
        
    } catch (error) {
        console.error('[Options] 測試連接失敗:', error);
        showStatus(`❌ 連接失敗: ${error.message}`, 'error');
    }
}

// 保存設置
async function saveSettings() {
    const apiKeyInput = document.getElementById('api-key');
    const databaseIdInput = document.getElementById('database-id');
    
    const apiKey = apiKeyInput?.value?.trim();
    const databaseId = databaseIdInput?.value?.trim();
    
    if (!apiKey) {
        showStatus('請輸入 API Key', 'error');
        return;
    }
    
    if (!databaseId) {
        showStatus('請輸入數據庫 ID', 'error');
        return;
    }
    
    try {
        showStatus('正在保存設置...', 'info');
        
        await chrome.storage.local.set({
            notionApiKey: apiKey,
            notionDatabaseId: databaseId
        });
        
        showStatus('✅ 設置已保存', 'success');
        console.log('[Options] 設置已保存');
        
    } catch (error) {
        console.error('[Options] 保存設置失敗:', error);
        showStatus(`❌ 保存失敗: ${error.message}`, 'error');
    }
}

// 清除設置
async function clearSettings() {
    if (!confirm('確定要清除所有設置嗎？')) {
        return;
    }
    
    try {
        showStatus('正在清除設置...', 'info');
        
        await chrome.storage.local.remove(['notionApiKey', 'notionDatabaseId']);
        
        // 清空表單
        const apiKeyInput = document.getElementById('api-key');
        const databaseIdInput = document.getElementById('database-id');
        
        if (apiKeyInput) apiKeyInput.value = '';
        if (databaseIdInput) databaseIdInput.value = '';
        
        showStatus('設置已清除', 'info');
        console.log('[Options] 設置已清除');
        
    } catch (error) {
        console.error('[Options] 清除設置失敗:', error);
        showStatus(`❌ 清除失敗: ${error.message}`, 'error');
    }
}

// 設置事件監聽器
function setupEventListeners() {
    const testButton = document.getElementById('test-button');
    const saveButton = document.getElementById('save-button');
    const clearButton = document.getElementById('clear-button');
    
    if (testButton) {
        testButton.addEventListener('click', testConnection);
    }
    
    if (saveButton) {
        saveButton.addEventListener('click', saveSettings);
    }
    
    if (clearButton) {
        clearButton.addEventListener('click', clearSettings);
    }
    
    console.log('[Options] 事件監聽器已設置');
}

// 頁面載入完成後初始化
document.addEventListener('DOMContentLoaded', () => {
    console.log('[Options] 簡化版選項頁面載入完成');
    
    // 設置事件監聽器
    setupEventListeners();
    
    // 載入保存的設置
    loadSettings();
});