# MCP 配置同步 - 快速使用指南

**日期:** 2025-10-06  
**工具:** `sync-mcp-config.sh`

---

## 🚀 快速開始

### **回答你的問題:**

**❌ VS Code Settings Sync 不會同步 `mcp.json`**

原因:
- MCP 配置可能包含敏感信息（API 密鑰、本地路徑）
- VS Code 將其視為「機器特定」配置
- 與 Git 配置、SSH 密鑰等類似的處理方式

---

## ✅ 解決方案

我已經為你創建了自動化同步工具! 📦

**位置:** `internal/scripts/sync-mcp-config.sh`

### **方案 1: Git 同步（推薦）** ⭐

#### **首次設置:**
```bash
# 1. 設置 Git 同步
cd /Volumes/WD1TMac/code/notion-chrome
./internal/scripts/sync-mcp-config.sh setup-git

# 2. 創建 GitHub 私有倉庫（在 GitHub 網站）
#    倉庫名: dotfiles

# 3. 連接遠程倉庫
cd ~/dotfiles/vscode
git remote add origin https://github.com/YOUR_USERNAME/dotfiles.git
git push -u origin main

✅ 完成! 配置已上傳到 GitHub
```

#### **日常使用:**
```bash
# 修改配置後，推送到 GitHub
./internal/scripts/sync-mcp-config.sh push

# 在另一台設備上拉取配置
./internal/scripts/sync-mcp-config.sh pull

# 檢查狀態
./internal/scripts/sync-mcp-config.sh status
```

**優點:**
- ✅ 版本控制（可以回溯歷史）
- ✅ 支持多設備
- ✅ 完全控制
- ✅ 私有倉庫安全

---

### **方案 2: iCloud 同步（簡單）**

#### **首次設置:**
```bash
# 一鍵設置 iCloud 自動同步
cd /Volumes/WD1TMac/code/notion-chrome
./internal/scripts/sync-mcp-config.sh setup-icloud

✅ 完成! 配置會自動同步到所有 Mac 設備
```

**優點:**
- ✅ 全自動同步
- ✅ 零維護
- ✅ 簡單易用

**缺點:**
- ❌ 無版本控制
- ❌ 僅限 macOS
- ❌ 可能有同步延遲

---

### **方案 3: 手動備份**

```bash
# 備份當前配置
./internal/scripts/sync-mcp-config.sh backup
✅ 備份已創建: ~/Desktop/mcp-backups/mcp-backup-20251006-125500.json

# 恢復配置
./internal/scripts/sync-mcp-config.sh restore ~/Desktop/mcp-backups/mcp-backup-20251006-125500.json
✅ 配置已恢復
```

---

## 📋 完整命令參考

```bash
# 查看幫助
./internal/scripts/sync-mcp-config.sh help

# Git 同步
./internal/scripts/sync-mcp-config.sh setup-git    # 首次設置
./internal/scripts/sync-mcp-config.sh push         # 推送配置
./internal/scripts/sync-mcp-config.sh pull         # 拉取配置

# iCloud 同步
./internal/scripts/sync-mcp-config.sh setup-icloud # 首次設置（自動同步）

# 備份和恢復
./internal/scripts/sync-mcp-config.sh backup       # 備份配置
./internal/scripts/sync-mcp-config.sh restore <文件> # 恢復配置

# 狀態檢查
./internal/scripts/sync-mcp-config.sh status       # 查看配置狀態
```

---

## 🎯 推薦工作流程

### **個人開發者（單設備）**
```bash
# 定期備份即可
./internal/scripts/sync-mcp-config.sh backup
```

### **多設備用戶（推薦 Git）**
```bash
# 設備 A: 修改配置後
./internal/scripts/sync-mcp-config.sh push

# 設備 B: 同步配置
./internal/scripts/sync-mcp-config.sh pull
```

### **Mac 用戶（推薦 iCloud）**
```bash
# 一次設置，永久自動同步
./internal/scripts/sync-mcp-config.sh setup-icloud
```

---

## 🔒 安全提示

### **敏感信息處理**

**檢查配置是否包含敏感信息:**
```bash
cat ~/Library/Application\ Support/Code/User/mcp.json | grep -i "key\|token\|password\|secret"
```

**如果包含敏感信息:**
1. 使用環境變量代替硬編碼
2. 使用 `.gitignore` 忽略配置文件
3. 只同步模板文件

**最佳實踐:**
```json
// ✅ 好的做法: 使用環境變量
{
  "servers": {
    "my-server": {
      "env": {
        "API_KEY": "${API_KEY}"  // 從環境變量讀取
      }
    }
  }
}

// ❌ 不好的做法: 硬編碼密鑰
{
  "servers": {
    "my-server": {
      "env": {
        "API_KEY": "sk-1234567890abcdef"  // 不要這樣做!
      }
    }
  }
}
```

---

## 📊 當前配置狀態

運行以下命令查看當前狀態:
```bash
./internal/scripts/sync-mcp-config.sh status
```

**輸出示例:**
```
========================================
  MCP 配置狀態
========================================

✅ VS Code 配置存在
ℹ️  類型: 普通文件

ℹ️  MCP 服務器列表:
  - chrome-devtools
  - github/github-mcp-server
  - memory
  - sequential-thinking

✅ 全域配置存在
ℹ️  類型: 普通文件

⚠️  Git 倉庫不存在
ℹ️  iCloud 同步未設置
```

---

## 🛠️ 故障排除

### **問題 1: Git 推送失敗**
```bash
# 檢查遠程連接
cd ~/dotfiles/vscode
git remote -v

# 重新設置遠程
git remote set-url origin https://github.com/YOUR_USERNAME/dotfiles.git

# 再次推送
git push
```

### **問題 2: iCloud 同步延遲**
```bash
# 檢查 iCloud 狀態
ls -la ~/Library/Mobile\ Documents/com~apple~CloudDocs/VSCode/

# 手動觸發同步
# 打開 Finder → iCloud Drive → VSCode 文件夾
```

### **問題 3: 符號鏈接失效**
```bash
# 檢查符號鏈接
ls -la ~/Library/Application\ Support/Code/User/mcp.json

# 重新創建符號鏈接
./internal/scripts/sync-mcp-config.sh setup-icloud
```

---

## 📚 相關文檔

- **完整指南:** `internal/guides/MCP_SYNC_SOLUTION.md`
- **配置說明:** `MCP_CROSS_AGENT_CONFIGURATION_COMPLETE.md`
- **使用準則:** `internal/guides/MCP_USAGE_GUIDELINES.md`

---

## 🎓 最佳實踐

### **1. 定期備份**
```bash
# 每週備份一次
./internal/scripts/sync-mcp-config.sh backup
```

### **2. 版本控制**
```bash
# 每次修改後提交
./internal/scripts/sync-mcp-config.sh push
```

### **3. 文檔化配置**
```bash
# 在 Git 倉庫中添加說明文檔
cd ~/dotfiles/vscode
cat > README.md << 'EOF'
# 我的 MCP 配置

## MCP 服務器
- memory: 知識圖譜管理
- sequential-thinking: 結構化思考
- chrome-devtools: 瀏覽器自動化
- github: GitHub 集成

## 使用說明
...
EOF

git add README.md
git commit -m "Add documentation"
git push
```

---

## 🚀 立即開始

**選擇你的方案並立即執行:**

### **Git 同步（推薦）**
```bash
cd /Volumes/WD1TMac/code/notion-chrome
./internal/scripts/sync-mcp-config.sh setup-git
```

### **iCloud 同步（簡單）**
```bash
cd /Volumes/WD1TMac/code/notion-chrome
./internal/scripts/sync-mcp-config.sh setup-icloud
```

### **先備份再決定**
```bash
cd /Volumes/WD1TMac/code/notion-chrome
./internal/scripts/sync-mcp-config.sh backup
```

---

## 📝 總結

**關鍵要點:**
1. ❌ VS Code Settings Sync **不支持** `mcp.json`
2. ✅ 我已創建 **自動化同步工具**
3. 🎯 推薦使用 **Git + GitHub 私有倉庫**
4. 🍎 Mac 用戶可用 **iCloud 自動同步**
5. 🔒 注意 **敏感信息保護**

**下一步:**
選擇一個方案，運行對應命令，完成設置! 🎉

---

**最後更新:** 2025-10-06  
**文檔版本:** v1.0
