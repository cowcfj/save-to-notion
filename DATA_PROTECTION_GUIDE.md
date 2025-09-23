# 數據保護和備份指南

## 🛡️ 當前數據保護機制

### 1. 雙重存儲系統
- **主要**：`chrome.storage.local` (Chrome 官方，升級安全)
- **備份**：`localStorage` (瀏覽器本地，即時存取)

### 2. 數據存儲位置
```
Chrome Storage:
├── highlights_[normalized_url] → 標記數據
├── pages_[normalized_url] → 頁面保存狀態  
└── config_* → 用戶配置

LocalStorage:
├── highlights_[normalized_url] → 標記備份
└── (同步備份所有重要數據)
```

## 📊 升級時的數據行為

### ✅ 完全安全（不會丟失）
- **標記數據**：儲存在 chrome.storage.local
- **頁面關聯**：URL 到 Notion 頁面的映射
- **用戶設定**：API 金鑰、資料庫配置
- **歷史記錄**：保存的頁面列表

### 🔄 需要重新載入（但數據存在）
- **頁面標記顯示**：重新整理頁面後自動恢復
- **工具欄狀態**：重新注入後恢復
- **擴展狀態**：服務重啟後正常

### ⚠️ 極少數情況可能影響
- **瀏覽器清除數據**：用戶手動清除擴展數據
- **Chrome 重置**：完全重置瀏覽器設定
- **系統級清理**：第三方清理軟體誤刪

## 🔧 數據保護最佳實踐

### 1. 定期備份重要配置
```javascript
// 用戶可以手動備份配置
function exportUserData() {
    chrome.storage.local.get(null, (data) => {
        const backup = {
            timestamp: new Date().toISOString(),
            data: data,
            version: chrome.runtime.getManifest().version
        };
        
        const blob = new Blob([JSON.stringify(backup, null, 2)], {
            type: 'application/json'
        });
        
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `notion-clipper-backup-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        URL.revokeObjectURL(url);
    });
}
```

### 2. 數據恢復機制
```javascript
// 從備份恢復數據
function importUserData(backupFile) {
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const backup = JSON.parse(e.target.result);
            chrome.storage.local.set(backup.data, () => {
                console.log('Data restored successfully');
                alert('數據已成功恢復！');
            });
        } catch (error) {
            console.error('Failed to restore backup:', error);
            alert('備份文件格式錯誤！');
        }
    };
    reader.readAsText(backupFile);
}
```

### 3. 數據完整性檢查
```javascript
// 檢查數據完整性
async function validateDataIntegrity() {
    return new Promise((resolve) => {
        chrome.storage.local.get(null, (data) => {
            const report = {
                totalKeys: Object.keys(data).length,
                highlightPages: 0,
                configKeys: 0,
                corruptedData: []
            };
            
            for (const [key, value] of Object.entries(data)) {
                if (key.startsWith('highlights_')) {
                    report.highlightPages++;
                    if (!Array.isArray(value)) {
                        report.corruptedData.push(key);
                    }
                } else if (key.startsWith('config_')) {
                    report.configKeys++;
                }
            }
            
            resolve(report);
        });
    });
}
```

## 🚀 升級建議和用戶指導

### 升級前（用戶不需要做任何事）
- ✅ 數據自動保護，無需手動備份
- ✅ Chrome 會自動保留所有 storage.local 數據
- ✅ 標記會在頁面重新載入後自動恢復

### 升級後（自動恢復）
- ✅ 重新整理有標記的頁面，標記自動恢復
- ✅ 重新開啟擴展工具欄，功能正常
- ✅ 所有配置和歷史記錄完整保留

### 極端情況處理
如果用戶遇到數據丟失（極少發生）：
1. **檢查 localStorage 備份**：可能需要手動遷移
2. **檢查 Chrome 同步**：如果啟用同步，數據可能在雲端
3. **聯繫技術支援**：提供日誌協助診斷

## 📝 用戶教育內容

### 在擴展介面中顯示
```
💡 數據安全提示：
您的標記和配置數據安全儲存在 Chrome 中，
擴展升級不會影響您的數據。
標記會在頁面重新載入後自動恢復。
```

### 在升級說明中強調
```
🔄 升級說明：
- ✅ 您的所有標記和配置都會完整保留
- ✅ 升級後重新整理頁面即可看到標記
- ✅ 無需重新配置 API 金鑰
- ✅ 歷史保存記錄完整保留
```

## 🎯 結論

用戶的標記和保存狀態在擴展升級時**不會丟失**，因為：

1. **Chrome Storage API 設計如此**：官方保證升級時保留數據
2. **雙重備份機制**：chrome.storage + localStorage
3. **自動恢復系統**：頁面重載時自動恢復標記
4. **向後兼容性**：支援舊版本數據遷移

用戶可以放心升級，無需擔心數據丟失！