/**
 * 調試版選項頁面 JavaScript
 * 解決 CSP 問題 - 將內聯 JavaScript 移到外部文件
 */

// 調試日誌函數
function debugLog(message, type = 'info') {
    const logContent = document.getElementById('log-content');
    if (!logContent) return;
    
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = type;
    logEntry.textContent = `[${timestamp}] ${message}`;
    logContent.appendChild(logEntry);
    console.log(`[DEBUG ${type.toUpperCase()}] ${message}`);
}

// 狀態顯示函數
function showStatus(message, type = 'info') {
    const statusDiv = document.getElementById('status');
    if (statusDiv) {
        statusDiv.textContent = message;
        statusDiv.className = `status ${type}`;
    }
    debugLog(`狀態: ${message}`, type);
}

// 簡化的事件處理函數
function handleTestButton1() {
    debugLog('測試按鈕 1 被點擊', 'success');
    showStatus('測試按鈕 1 工作正常', 'success');
}

function handleCookieCheck() {
    debugLog('Cookie 檢查按鈕被點擊', 'success');
    showStatus('正在檢查 Cookie...', 'info');
    
    // 簡化的 Cookie 檢查
    if (typeof chrome !== 'undefined' && chrome.cookies) {
        chrome.cookies.getAll({ domain: '.notion.so' })
            .then(cookies => {
                debugLog(`找到 ${cookies.length} 個 cookies`, 'info');
                const tokenCookie = cookies.find(c => c.name === 'token_v2');
                if (tokenCookie) {
                    debugLog('找到 token_v2 cookie', 'success');
                    showStatus('檢測到 Notion 登入狀態', 'success');
                } else {
                    debugLog('未找到 token_v2 cookie', 'error');
                    showStatus('未檢測到 Notion 登入狀態', 'warning');
                }
            })
            .catch(error => {
                debugLog(`Cookie 檢查失敗: ${error.message}`, 'error');
                showStatus('Cookie 檢查失敗', 'error');
            });
    } else {
        debugLog('Chrome Cookies API 不可用', 'error');
        showStatus('Chrome Cookies API 不可用', 'error');
    }
}

function handleRefreshAuth() {
    debugLog('刷新授權按鈕被點擊', 'success');
    showStatus('正在刷新授權狀態...', 'info');
    
    setTimeout(() => {
        showStatus('授權狀態已刷新', 'success');
    }, 1000);
}

function handleCookieLogin() {
    debugLog('Cookie 登入按鈕被點擊', 'success');
    showStatus('正在打開 Notion 登入頁面...', 'info');
    
    if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.create({
            url: 'https://www.notion.so/login',
            active: true
        }).then(() => {
            debugLog('成功打開 Notion 登入頁面', 'success');
            showStatus('請在新頁面中登入 Notion', 'info');
        }).catch(error => {
            debugLog(`打開頁面失敗: ${error.message}`, 'error');
            showStatus('打開頁面失敗', 'error');
        });
    } else {
        debugLog('Chrome Tabs API 不可用', 'error');
        showStatus('Chrome Tabs API 不可用', 'error');
    }
}

function handleCookieLogout() {
    debugLog('Cookie 登出按鈕被點擊', 'success');
    showStatus('正在登出...', 'info');
}

function switchTab(tabName) {
    debugLog(`切換到標籤: ${tabName}`, 'info');
    showStatus(`已切換到 ${tabName} 標籤`, 'success');
}

// 設置事件監聽器
function setupEventListeners() {
    debugLog('開始設置事件監聽器...', 'info');
    
    try {
        // 測試按鈕
        const testButton1 = document.getElementById('test-button-1');
        if (testButton1) {
            testButton1.addEventListener('click', handleTestButton1);
            debugLog('測試按鈕 1 事件監聽器已設置', 'success');
        } else {
            debugLog('找不到測試按鈕 1', 'error');
        }

        // Cookie 檢查按鈕
        const cookieCheckButton = document.getElementById('cookie-check-button');
        if (cookieCheckButton) {
            cookieCheckButton.addEventListener('click', handleCookieCheck);
            debugLog('Cookie 檢查按鈕事件監聽器已設置', 'success');
        } else {
            debugLog('找不到 Cookie 檢查按鈕', 'error');
        }

        // 刷新授權按鈕
        const refreshButton = document.getElementById('refresh-auth-button');
        if (refreshButton) {
            refreshButton.addEventListener('click', handleRefreshAuth);
            debugLog('刷新授權按鈕事件監聽器已設置', 'success');
        } else {
            debugLog('找不到刷新授權按鈕', 'error');
        }

        // Cookie 登入按鈕
        const cookieLoginButton = document.getElementById('cookie-login-button');
        if (cookieLoginButton) {
            cookieLoginButton.addEventListener('click', handleCookieLogin);
            debugLog('Cookie 登入按鈕事件監聽器已設置', 'success');
        } else {
            debugLog('找不到 Cookie 登入按鈕', 'error');
        }

        // Cookie 登出按鈕
        const cookieLogoutButton = document.getElementById('cookie-logout-button');
        if (cookieLogoutButton) {
            cookieLogoutButton.addEventListener('click', handleCookieLogout);
            debugLog('Cookie 登出按鈕事件監聽器已設置', 'success');
        } else {
            debugLog('找不到 Cookie 登出按鈕', 'error');
        }

        // 標籤切換
        const navTabs = document.querySelectorAll('.nav-tab');
        debugLog(`找到 ${navTabs.length} 個導航標籤`, 'info');
        
        navTabs.forEach((tab, index) => {
            tab.addEventListener('click', function() {
                const tabName = this.getAttribute('data-tab');
                switchTab(tabName);
            });
            debugLog(`導航標籤 ${index + 1} 事件監聽器已設置`, 'success');
        });

        debugLog('所有事件監聽器設置完成', 'success');
        
    } catch (error) {
        debugLog(`設置事件監聽器時發生錯誤: ${error.message}`, 'error');
    }
}

// 頁面載入完成後初始化
document.addEventListener('DOMContentLoaded', () => {
    debugLog('頁面 DOM 載入完成', 'success');
    
    // 檢查 Chrome Extension 環境
    if (typeof chrome !== 'undefined') {
        debugLog('Chrome Extension 環境檢測成功', 'success');
        
        // 檢查各個 API
        const apis = [
            { name: 'chrome.cookies', obj: chrome.cookies },
            { name: 'chrome.storage', obj: chrome.storage },
            { name: 'chrome.runtime', obj: chrome.runtime },
            { name: 'chrome.tabs', obj: chrome.tabs }
        ];
        
        apis.forEach(api => {
            if (api.obj) {
                debugLog(`${api.name} API 可用`, 'success');
            } else {
                debugLog(`${api.name} API 不可用`, 'error');
            }
        });
        
    } else {
        debugLog('未檢測到 Chrome Extension 環境', 'error');
    }
    
    // 設置事件監聽器
    setupEventListeners();
    
    // 顯示初始狀態
    showStatus('調試版選項頁面已載入', 'success');
});