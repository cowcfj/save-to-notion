# MCP 診斷檢查清單

## ✅ 已確認項目
- [x] VS Code 版本：1.104.2（>= 1.102 ✓）
- [x] MCP 配置文件存在：`~/.vscode/mcp.json`
- [x] chrome-devtools-mcp 可以運行（v0.6.0）

## 🔍 請手動檢查以下項目

### 1. 檢查 MCP 訪問設置
1. 打開 VS Code 設置（⌘,）
2. 搜索：`chat.mcp.access`
3. **確認值為：** `all`（默認）
   - ❌ 如果是 `none`，請改為 `all`

### 2. 檢查已安裝的 MCP 服務器
**方法 A：使用命令**
1. 打開命令面板（⌘⇧P）
2. 輸入並運行：`MCP: Show Installed Servers`
3. **預期：** 看到 `chrome-devtools` 服務器
   - ✅ 如果看到，點擊查看狀態
   - ❌ 如果沒看到，繼續下一步

**方法 B：使用擴展視圖**
1. 打開擴展視圖（⇧⌘X）
2. 展開 **MCP SERVERS - INSTALLED** 部分
3. **預期：** 看到 `chrome-devtools`

### 3. 手動啟動 MCP 服務器
1. 打開命令面板（⌘⇧P）
2. 運行：`MCP: List Servers`
3. 選擇：`chrome-devtools`
4. 選擇：`Start Server`
5. **檢查是否有錯誤提示**

### 4. 查看 MCP 輸出日誌
1. 打開命令面板（⌘⇧P）
2. 運行：`MCP: List Servers`
3. 選擇：`chrome-devtools`
4. 選擇：`Show Output`
5. **檢查日誌中是否有錯誤**

### 5. 檢查 Agent Mode 工具
1. 打開 Chat 視圖（⌃⌘I）
2. 確認切換到 **Agent mode**
3. 點擊 **Tools** 按鈕
4. 在搜索框輸入：`chrome`
5. **預期：** 看到 chrome 相關工具

### 6. 重置 MCP 緩存
1. 打開命令面板（⌘⇧P）
2. 運行：`MCP: Reset Cached Tools`
3. 等待幾秒
4. 重新檢查 Tools 列表

## 🐛 常見問題排查

### 問題 A：配置文件位置錯誤
**可能原因：** MCP 配置可能需要放在不同位置

**解決方案：**
試試在工作區創建配置：
```bash
mkdir -p .vscode
cat > .vscode/mcp.json << 'EOF'
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "-y",
        "chrome-devtools-mcp@latest"
      ]
    }
  }
}
EOF
```

### 問題 B：需要信任 MCP 服務器
**現象：** 服務器存在但沒有啟動

**解決方案：**
1. 首次啟動會提示信任確認
2. 查看是否有信任對話框
3. 如果錯過了，運行：`MCP: Reset Trust`
4. 然後重新啟動服務器

### 問題 C：npm 權限或緩存問題
**解決方案：**
```bash
# 清除 npm 緩存
npm cache clean --force

# 手動測試運行
npx -y chrome-devtools-mcp@latest --help
```

### 問題 D：GitHub Copilot 未啟用 MCP
**檢查：**
1. 確認已登錄 GitHub Copilot
2. 確認 Copilot 訂閱有效
3. 設置中搜索 `github.copilot.enable`，確認為 `true`

## 📝 收集信息

如果以上都無法解決，請提供以下信息：

### 1. MCP 服務器狀態
運行命令並複製輸出：
```bash
cat ~/.vscode/mcp.json
```

### 2. VS Code 版本信息
```bash
code --version
```

### 3. MCP 輸出日誌
從 `MCP: List Servers` > `Show Output` 複製日誌

### 4. VS Code 設置
檢查以下設置值：
- `chat.mcp.access`
- `chat.mcp.autostart`
- `github.copilot.enable`

### 5. 擴展列表
```bash
code --list-extensions | grep -E "(copilot|mcp)"
```

## 🔄 終極解決方案

如果所有方法都失敗，嘗試：

### 方案 1：完全重置
```bash
# 1. 刪除所有 MCP 相關緩存
rm -rf ~/Library/Application\ Support/Code/User/workspaceStorage/*/mcp*

# 2. 重新創建配置
cat > ~/.vscode/mcp.json << 'EOF'
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "-y",
        "chrome-devtools-mcp@latest"
      ]
    }
  }
}
EOF

# 3. 完全退出並重啟 VS Code
```

### 方案 2：使用工作區配置
在項目根目錄創建 `.vscode/mcp.json`，而不是用戶級配置。

### 方案 3：降級使用 Puppeteer
如果 MCP 始終無法工作，使用已經設置好的 Puppeteer 測試框架：
```bash
npm test
```

---

**請按照上面的檢查清單逐項檢查，並告訴我結果！** 🔍
