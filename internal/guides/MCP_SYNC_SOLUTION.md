# MCP 配置跨設備同步方案

**日期:** 2025-10-06  
**問題:** VS Code Settings Sync 不會同步 `mcp.json` 配置

---

## ❌ 問題說明

### **VS Code 設置同步限制**

**會同步的文件:**
- ✅ `settings.json` - 用戶設置
- ✅ `keybindings.json` - 鍵盤快捷鍵
- ✅ `extensions.json` - 擴展列表
- ✅ `snippets/` - 代碼片段
- ✅ `tasks.json` - 任務配置

**不會同步的文件:**
- ❌ **`mcp.json`** - MCP 配置（本文重點）
- ❌ `globalStorage/` - 擴展數據
- ❌ `workspaceStorage/` - 工作區數據

### **為什麼 mcp.json 不同步？**

1. **安全考量:**
   - 可能包含 API 密鑰（如 Memory MCP 的路徑）
   - 可能包含敏感的環境變量
   - 可能包含私有服務的 URL

2. **設備差異:**
   - 不同設備可能有不同的本地路徑
   - 不同設備可能需要不同的 MCP 配置
   - 例如: Filesystem MCP 的路徑在 macOS 和 Windows 上不同

3. **VS Code 設計決策:**
   - MCP 配置被視為「機器特定」而非「用戶偏好」
   - 與 Git 配置、SSH 密鑰等類似

---

## ✅ 解決方案

### **方案 A: Git 同步（推薦）** ⭐

#### **適用場景:**
- 你有自己的 Git 倉庫
- 配置中沒有敏感信息
- 需要版本控制

#### **實施步驟:**

**1. 創建配置倉庫**
```bash
# 創建新倉庫目錄
mkdir -p ~/dotfiles/vscode
cd ~/dotfiles/vscode

# 初始化 Git
git init

# 複製 MCP 配置
cp ~/Library/Application\ Support/Code/User/mcp.json ./mcp.json

# 提交
git add mcp.json
git commit -m "Add VS Code MCP configuration"

# 推送到 GitHub (私有倉庫)
git remote add origin https://github.com/YOUR_USERNAME/dotfiles.git
git push -u origin main
```

**2. 在新設備上使用**
```bash
# 克隆倉庫
cd ~/dotfiles
git clone https://github.com/YOUR_USERNAME/dotfiles.git

# 創建符號鏈接
ln -sf ~/dotfiles/vscode/mcp.json ~/Library/Application\ Support/Code/User/mcp.json
ln -sf ~/dotfiles/vscode/mcp.json ~/.config/Code/User/mcp.json
```

**3. 同步更新**
```bash
# 在設備 A 更新配置後
cd ~/dotfiles/vscode
git add mcp.json
git commit -m "Update MCP configuration"
git push

# 在設備 B 拉取更新
cd ~/dotfiles/vscode
git pull
```

**優點:**
- ✅ 版本控制
- ✅ 支持多設備
- ✅ 可以選擇性同步

**缺點:**
- ❌ 需要手動推送/拉取
- ❌ 需要 Git 知識

---

### **方案 B: 雲端同步服務（簡單）**

#### **適用場景:**
- 不熟悉 Git
- 需要自動同步
- 配置簡單

#### **使用 iCloud (macOS)**
```bash
# 1. 創建 iCloud 同步目錄
mkdir -p ~/Library/Mobile\ Documents/com~apple~CloudDocs/VSCode

# 2. 複製配置到 iCloud
cp ~/Library/Application\ Support/Code/User/mcp.json \
   ~/Library/Mobile\ Documents/com~apple~CloudDocs/VSCode/mcp.json

# 3. 創建符號鏈接
ln -sf ~/Library/Mobile\ Documents/com~apple~CloudDocs/VSCode/mcp.json \
       ~/Library/Application\ Support/Code/User/mcp.json
```

#### **使用 Dropbox**
```bash
# 1. 複製配置到 Dropbox
cp ~/Library/Application\ Support/Code/User/mcp.json \
   ~/Dropbox/VSCode/mcp.json

# 2. 創建符號鏈接
ln -sf ~/Dropbox/VSCode/mcp.json \
       ~/Library/Application\ Support/Code/User/mcp.json
```

#### **使用 Google Drive**
```bash
# 1. 複製配置到 Google Drive
cp ~/Library/Application\ Support/Code/User/mcp.json \
   ~/Google\ Drive/VSCode/mcp.json

# 2. 創建符號鏈接
ln -sf ~/Google\ Drive/VSCode/mcp.json \
       ~/Library/Application\ Support/Code/User/mcp.json
```

**優點:**
- ✅ 自動同步
- ✅ 簡單易用
- ✅ 無需額外學習

**缺點:**
- ❌ 無版本控制
- ❌ 可能有同步衝突
- ❌ 依賴特定雲端服務

---

### **方案 C: VS Code 擴展（未來可能）**

#### **背景:**
目前沒有官方擴展支持 MCP 配置同步，但可能的解決方案:

1. **Settings Sync 擴展:**
   - 可能未來支持 MCP 同步
   - 需要關注更新

2. **自定義同步腳本:**
   ```bash
   # sync-mcp.sh
   #!/bin/bash
   
   MCP_FILE="mcp.json"
   SOURCE="~/Library/Application Support/Code/User/$MCP_FILE"
   BACKUP="~/Dropbox/VSCode/$MCP_FILE"
   
   # 同步到雲端
   cp "$SOURCE" "$BACKUP"
   echo "✅ MCP 配置已同步到 Dropbox"
   ```

3. **Git Hooks:**
   ```bash
   # .git/hooks/post-commit
   #!/bin/bash
   
   # 自動提交 MCP 配置更改
   if [[ $(git diff --name-only HEAD~1 HEAD) == *"mcp.json"* ]]; then
       echo "✅ MCP 配置已更新"
   fi
   ```

---

### **方案 D: 手動備份（最簡單）**

#### **適用場景:**
- 不經常切換設備
- 配置變更不頻繁
- 只需要偶爾備份

#### **實施步驟:**
```bash
# 1. 導出配置
cp ~/Library/Application\ Support/Code/User/mcp.json \
   ~/Desktop/mcp-backup-$(date +%Y%m%d).json

# 2. 在新設備導入
cp ~/Desktop/mcp-backup-20251006.json \
   ~/Library/Application\ Support/Code/User/mcp.json
```

**優點:**
- ✅ 最簡單
- ✅ 無依賴
- ✅ 完全控制

**缺點:**
- ❌ 需要手動操作
- ❌ 容易忘記
- ❌ 無自動化

---

## 🎯 推薦方案

### **個人開發者（推薦方案 A）**
```bash
# 使用 Git + GitHub 私有倉庫
# 優點: 版本控制 + 跨設備 + 安全
```

### **團隊協作（推薦方案 A + 模板）**
```bash
# 1. 創建模板文件 mcp.template.json
{
  "servers": {
    "memory": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory@latest"],
      "env": {"MEMORY_FILE_PATH": "${YOUR_PATH_HERE}"}
    }
  }
}

# 2. 每個人複製模板並自定義
cp mcp.template.json mcp.json
# 編輯 mcp.json，替換 ${YOUR_PATH_HERE}

# 3. 添加到 .gitignore
echo "mcp.json" >> .gitignore
```

### **簡單用戶（推薦方案 B）**
```bash
# 使用 iCloud 或 Dropbox
# 優點: 自動同步 + 簡單
```

---

## 📋 實施檢查清單

### **方案 A: Git 同步**
- [ ] 創建私有 Git 倉庫
- [ ] 複製 mcp.json 到倉庫
- [ ] 提交並推送到遠程
- [ ] 在其他設備克隆倉庫
- [ ] 創建符號鏈接
- [ ] 測試配置是否生效

### **方案 B: 雲端同步**
- [ ] 選擇雲端服務（iCloud/Dropbox/Google Drive）
- [ ] 創建同步目錄
- [ ] 複製 mcp.json 到雲端
- [ ] 創建符號鏈接
- [ ] 等待同步完成
- [ ] 在其他設備驗證

### **方案 D: 手動備份**
- [ ] 導出當前配置
- [ ] 保存到安全位置
- [ ] 記錄備份日期
- [ ] 定期更新備份

---

## 🔒 安全注意事項

### **敏感信息處理**

1. **檢查配置中的敏感信息:**
   ```bash
   # 檢查是否包含密鑰
   cat ~/Library/Application\ Support/Code/User/mcp.json | grep -i "key\|token\|password\|secret"
   ```

2. **使用環境變量:**
   ```json
   {
     "servers": {
       "my-server": {
         "env": {
           "API_KEY": "${API_KEY}"  // 使用環境變量而非硬編碼
         }
       }
     }
   }
   ```

3. **使用 .gitignore:**
   ```bash
   # 如果配置包含敏感信息
   echo "mcp.json" >> .gitignore
   
   # 只同步模板
   git add mcp.template.json
   ```

### **路徑處理**

1. **使用相對路徑:**
   ```json
   {
     "servers": {
       "filesystem": {
         "args": ["-y", "@modelcontextprotocol/server-filesystem", "~/projects"]
         // ✅ 使用 ~ 而非 /Users/username/projects
       }
     }
   }
   ```

2. **跨平台路徑:**
   ```json
   // macOS/Linux
   "args": [..., "~/projects"]
   
   // Windows
   "args": [..., "%USERPROFILE%\\projects"]
   ```

---

## 🛠️ 自動化腳本

### **同步腳本（方案 A + 自動化）**

**`sync-mcp-config.sh`:**
```bash
#!/bin/bash

# MCP 配置自動同步腳本
# 使用方法: ./sync-mcp-config.sh [push|pull]

REPO_DIR="$HOME/dotfiles/vscode"
MCP_FILE="mcp.json"
VSCODE_PATH="$HOME/Library/Application Support/Code/User"
CONFIG_PATH="$HOME/.config/Code/User"

function push_config() {
    echo "📤 推送 MCP 配置到 Git..."
    
    # 複製到倉庫
    cp "$VSCODE_PATH/$MCP_FILE" "$REPO_DIR/$MCP_FILE"
    
    # 提交並推送
    cd "$REPO_DIR"
    git add "$MCP_FILE"
    git commit -m "Update MCP config: $(date '+%Y-%m-%d %H:%M:%S')"
    git push
    
    echo "✅ 配置已推送"
}

function pull_config() {
    echo "📥 拉取 MCP 配置從 Git..."
    
    # 拉取最新
    cd "$REPO_DIR"
    git pull
    
    # 複製到 VS Code
    cp "$REPO_DIR/$MCP_FILE" "$VSCODE_PATH/$MCP_FILE"
    cp "$REPO_DIR/$MCP_FILE" "$CONFIG_PATH/$MCP_FILE"
    
    echo "✅ 配置已更新"
}

case "$1" in
    push)
        push_config
        ;;
    pull)
        pull_config
        ;;
    *)
        echo "使用方法: $0 [push|pull]"
        exit 1
        ;;
esac
```

**使用方法:**
```bash
# 賦予執行權限
chmod +x sync-mcp-config.sh

# 推送配置
./sync-mcp-config.sh push

# 拉取配置
./sync-mcp-config.sh pull
```

---

## 📊 方案比較

| 方案 | 自動化 | 版本控制 | 安全性 | 難度 | 推薦度 |
|------|--------|---------|--------|------|--------|
| **A. Git 同步** | 半自動 | ✅ 是 | ⭐⭐⭐⭐⭐ | 中 | ⭐⭐⭐⭐⭐ |
| **B. 雲端同步** | ✅ 全自動 | ❌ 否 | ⭐⭐⭐ | 低 | ⭐⭐⭐⭐ |
| **C. VS Code 擴展** | ✅ 全自動 | 依擴展 | ⭐⭐⭐⭐ | 低 | ⭐⭐⭐ |
| **D. 手動備份** | ❌ 手動 | ❌ 否 | ⭐⭐⭐⭐⭐ | 最低 | ⭐⭐ |

---

## 🎓 最佳實踐

### **1. 分離敏感配置**
```json
// mcp.json (公開)
{
  "servers": {
    "memory": {
      "env": {"MEMORY_FILE_PATH": "${input:memory_path}"}
    }
  },
  "inputs": [
    {
      "id": "memory_path",
      "type": "promptString",
      "description": "Memory file path"
    }
  ]
}

// mcp.local.json (本地，不同步)
{
  "inputs": {
    "memory_path": "/Users/username/memory.json"
  }
}
```

### **2. 使用模板系統**
```bash
# mcp.template.json - 提交到 Git
# mcp.json - 本地使用，添加到 .gitignore
# mcp.local.json - 機器特定配置
```

### **3. 文檔化配置**
```markdown
# MCP 配置說明

## 首次設置
1. 複製 `mcp.template.json` 到 `mcp.json`
2. 編輯 `mcp.json`，填入你的配置
3. 重啟 VS Code

## 配置項說明
- `memory.env.MEMORY_FILE_PATH`: Memory MCP 數據存儲路徑
- `filesystem.args[2]`: Filesystem MCP 根目錄
```

---

## 🚀 快速開始

### **方案 A (Git) 快速設置:**
```bash
# 1. 創建倉庫
mkdir -p ~/dotfiles/vscode && cd ~/dotfiles/vscode
git init

# 2. 複製配置
cp ~/Library/Application\ Support/Code/User/mcp.json ./mcp.json

# 3. 提交
git add mcp.json
git commit -m "Initial MCP configuration"

# 4. 推送到 GitHub (私有倉庫)
git remote add origin https://github.com/YOUR_USERNAME/dotfiles.git
git push -u origin main

echo "✅ Git 同步設置完成!"
```

### **方案 B (iCloud) 快速設置:**
```bash
# 1. 創建目錄
mkdir -p ~/Library/Mobile\ Documents/com~apple~CloudDocs/VSCode

# 2. 複製配置
cp ~/Library/Application\ Support/Code/User/mcp.json \
   ~/Library/Mobile\ Documents/com~apple~CloudDocs/VSCode/mcp.json

# 3. 創建符號鏈接
mv ~/Library/Application\ Support/Code/User/mcp.json \
   ~/Library/Application\ Support/Code/User/mcp.json.backup

ln -s ~/Library/Mobile\ Documents/com~apple~CloudDocs/VSCode/mcp.json \
      ~/Library/Application\ Support/Code/User/mcp.json

echo "✅ iCloud 同步設置完成!"
```

---

## 📝 總結

**關鍵要點:**
1. ❌ VS Code Settings Sync **不會同步** `mcp.json`
2. ✅ 推薦使用 **Git + GitHub 私有倉庫**（方案 A）
3. ✅ 簡單用戶可使用 **iCloud/Dropbox**（方案 B）
4. 🔒 注意處理 **敏感信息和本地路徑**
5. 📋 使用 **模板系統** 分離公共和私有配置

**下一步行動:**
1. 選擇適合你的同步方案
2. 按照快速開始指南設置
3. 測試在多個設備上的同步效果
4. 定期備份配置

---

**相關文檔:**
- `MCP_CROSS_AGENT_CONFIGURATION_COMPLETE.md` - MCP 跨 Agent 配置
- `MCP_USAGE_GUIDELINES.md` - MCP 使用準則
- `SEQUENTIAL_THINKING_MCP_INSTALLATION_SUCCESS.md` - Sequential Thinking 安裝

**最後更新:** 2025-10-06  
**文檔版本:** v1.0
