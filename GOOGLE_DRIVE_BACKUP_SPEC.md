# 📁 Google Drive 雲端備份技術方案

**功能名稱：** Google Drive 雲端備份  
**版本：** v2.6.x  
**預計工期：** 1-2 週  
**技術風險：** 低

---

## 🎯 功能概述

### 📋 **核心功能**
1. **自動備份**：定期或手動備份用戶的擴展設定和標記數據
2. **備份管理**：瀏覽、預覽、刪除 Google Drive 中的備份列表
3. **一鍵恢復**：選擇特定備份進行數據恢復
4. **增量備份**：只備份變更的數據，節省存儲空間

### 🎨 **用戶流程**
```
[首次設置] → [Google OAuth 授權] → [選擇備份設定] → [開始備份]
     ↓
[備份管理] → [查看備份列表] → [預覽/恢復/刪除備份]
```

---

## 🔧 技術實現方案

### 📊 **技術架構**

```javascript
// 核心類別結構
class GoogleDriveBackup {
    constructor() {
        this.auth = new GoogleAuth();
        this.drive = new GoogleDriveAPI();
        this.backupManager = new BackupManager();
    }
    
    async authorize() {
        // Google OAuth 2.0 授權
    }
    
    async createBackup(data) {
        // 創建備份到 Google Drive
    }
    
    async listBackups() {
        // 獲取備份列表
    }
    
    async restoreBackup(backupId) {
        // 恢復指定備份
    }
}
```

### 🔑 **Google Drive API 整合**

#### **1. OAuth 2.0 授權**
```javascript
// manifest.json 權限設定
{
  "permissions": [
    "identity",
    "https://www.googleapis.com/auth/drive.file"
  ],
  "oauth2": {
    "client_id": "your-client-id.googleusercontent.com",
    "scopes": [
      "https://www.googleapis.com/auth/drive.file"
    ]
  }
}

// 授權實現
async function authorizeGoogleDrive() {
  try {
    const token = await chrome.identity.getAuthToken({
      interactive: true,
      scopes: ['https://www.googleapis.com/auth/drive.file']
    });
    return token;
  } catch (error) {
    console.error('Google 授權失敗:', error);
    throw error;
  }
}
```

#### **2. 文件上傳 API**
```javascript
async function uploadBackup(backupData, filename) {
  const metadata = {
    name: filename,
    parents: [await getOrCreateBackupFolder()]
  };
  
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], {type: 'application/json'}));
  form.append('file', new Blob([JSON.stringify(backupData)], {type: 'application/json'}));
  
  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: form
  });
  
  return await response.json();
}
```

#### **3. 文件列表和管理**
```javascript
async function listBackupFiles() {
  const folderId = await getBackupFolderId();
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=parents='${folderId}' and name contains 'notion-clipper-backup'&orderBy=createdTime desc`,
    {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }
  );
  
  return await response.json();
}
```

### 💾 **數據結構設計**

#### **備份數據格式**
```javascript
const backupData = {
  version: '2.6.0',
  timestamp: Date.now(),
  type: 'full', // 'full' | 'incremental'
  data: {
    settings: {
      notionToken: '...',
      databaseId: '...',
      // 其他設定...
    },
    highlights: {
      'https://example.com': [...],
      // 所有頁面的標記數據
    },
    savedPages: {
      'https://example.com': {
        notionPageId: '...',
        savedAt: timestamp,
        // 其他頁面資訊
      }
    },
    metadata: {
      totalHighlights: 150,
      totalPages: 25,
      backupSize: '2.5MB'
    }
  }
};
```

#### **備份文件命名規則**
```javascript
const generateBackupFilename = (type = 'manual') => {
  const date = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  return `notion-clipper-backup-${type}-${date}.json`;
};
```

### 🔄 **備份策略**

#### **1. 自動備份觸發條件**
- 每週自動備份一次
- 擴展更新後自動備份
- 標記數據達到一定量後提醒備份
- 用戶手動觸發備份

#### **2. 增量備份邏輯**
```javascript
async function createIncrementalBackup() {
  const lastBackup = await getLatestBackup();
  const currentData = await getAllUserData();
  
  const changes = compareData(lastBackup.data, currentData);
  
  if (changes.hasChanges) {
    const incrementalData = {
      ...backupData,
      type: 'incremental',
      baseBackupId: lastBackup.id,
      changes: changes.diff
    };
    
    return await uploadBackup(incrementalData);
  }
  
  return null; // 沒有變更，無需備份
}
```

---

## 🎨 用戶界面設計

### 📱 **設定頁面新增區塊**

```html
<!-- Google Drive 備份設定區塊 -->
<div class="backup-section">
  <h3>📁 Google Drive 雲端備份</h3>
  
  <div class="auth-status">
    <span id="drive-status" class="status-disconnected">未連接</span>
    <button id="authorize-drive" class="btn-primary">連接 Google Drive</button>
  </div>
  
  <div class="backup-controls">
    <button id="backup-now" class="btn-secondary">立即備份</button>
    <button id="manage-backups" class="btn-secondary">管理備份</button>
    
    <div class="auto-backup-setting">
      <label>
        <input type="checkbox" id="auto-backup" />
        啟用自動備份（每週）
      </label>
    </div>
  </div>
  
  <div class="backup-info">
    <p>最後備份：<span id="last-backup-time">從未備份</span></p>
    <p>備份數量：<span id="backup-count">0</span> 個</p>
  </div>
</div>
```

### 🗂️ **備份管理界面**

```html
<!-- 備份管理彈出視窗 -->
<div class="backup-manager-modal">
  <div class="modal-header">
    <h3>備份管理</h3>
    <button class="close-btn">×</button>
  </div>
  
  <div class="backup-list">
    <!-- 動態生成的備份項目 -->
    <div class="backup-item">
      <div class="backup-info">
        <div class="backup-name">自動備份-2025-09-29</div>
        <div class="backup-details">
          <span class="backup-date">2025年9月29日 14:30</span>
          <span class="backup-size">2.5MB</span>
          <span class="backup-type">完整備份</span>
        </div>
      </div>
      <div class="backup-actions">
        <button class="btn-restore">恢復</button>
        <button class="btn-preview">預覽</button>
        <button class="btn-delete">刪除</button>
      </div>
    </div>
  </div>
  
  <div class="modal-footer">
    <button class="btn-primary" id="create-backup">創建新備份</button>
  </div>
</div>
```

---

## ⚠️ 實現注意事項

### 🔐 **安全考慮**
1. **權限最小化**：只申請 `drive.file` 權限，僅能存取擴展創建的文件
2. **數據加密**：考慮對敏感數據（如 Notion Token）進行加密
3. **Token 管理**：安全存儲和刷新 OAuth Token

### 📊 **性能考量**
1. **文件大小限制**：監控備份文件大小，避免超過 Google Drive API 限制
2. **網絡優化**：支援斷點續傳和重試機制
3. **本地緩存**：緩存備份列表，減少 API 調用

### 🎯 **用戶體驗**
1. **進度顯示**：備份和恢復過程顯示進度條
2. **錯誤處理**：友好的錯誤提示和解決建議
3. **確認對話框**：重要操作（恢復/刪除）需要用戶確認

---

## 📈 開發計劃

### 🗓️ **開發時程（1-2 週）**

**第一週：**
- [ ] Google OAuth 授權實現
- [ ] 基本的備份上傳功能
- [ ] 備份列表顯示
- [ ] 設定頁面 UI 實現

**第二週：**
- [ ] 備份恢復功能
- [ ] 增量備份邏輯
- [ ] 自動備份排程
- [ ] 完整測試和錯誤處理

### 🧪 **測試計劃**
1. **授權流程測試**：各種授權場景和錯誤處理
2. **大數據測試**：大量標記數據的備份和恢復
3. **網絡異常測試**：網絡中斷時的處理
4. **跨設備測試**：在不同設備間的數據同步

---

## 🎉 預期成果

### 📊 **功能指標**
- **備份成功率**：> 99%
- **恢復準確率**：100%
- **用戶設定保留**：完整保留所有用戶配置
- **響應時間**：備份 < 30秒，恢復 < 60秒

### 🎯 **用戶價值**
- **數據安全**：永不丟失標記和設定
- **跨設備同步**：多設備間數據同步
- **無縫升級**：擴展更新時數據無縫遷移
- **零額外成本**：使用用戶既有的 Google Drive 空間

---

*📋 此方案專注於 Google Drive 整合，提供完整的備份解決方案，並為後續擴展其他雲端服務奠定基礎。*