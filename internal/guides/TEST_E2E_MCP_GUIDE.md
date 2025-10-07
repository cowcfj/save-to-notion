# Chrome DevTools MCP E2E 測試指南

**文檔性質：** 內部測試指南（不同步到 GitHub）  
**測試工具：** Chrome DevTools MCP  
**創建日期：** 2025-10-05  
**適用版本：** v2.7.3+

> 💡 **相關文檔**：[MCP_USAGE_GUIDELINES.md](./MCP_USAGE_GUIDELINES.md) - 所有 MCP 服務器的使用準則和決策指南

---

## 📋 測試概覽

使用 Chrome DevTools MCP 進行端到端（E2E）自動化測試，驗證核心功能是否正常工作。

**MCP 工具能力：**
- ✅ 頁面導航和操作
- ✅ 元素檢查和交互
- ✅ 控制台日誌監控
- ✅ 截圖和視覺驗證
- ✅ Storage 檢查

---

## 🧪 核心功能測試場景

### 測試 1：基本頁面保存功能

**目標：** 驗證能夠成功保存網頁到 Notion

**測試步驟：**
```javascript
1. 使用 MCP: navigate_page
   - URL: https://example.com/test-article
   - 等待頁面加載完成

2. 使用 MCP: take_snapshot
   - 驗證頁面已正確加載
   - 確認擴展的 content scripts 已注入

3. 觸發保存（手動操作或通過 MCP）
   - 點擊擴展圖標
   - 點擊「保存到 Notion」按鈕

4. 使用 MCP: list_console_messages
   - 查找 "✅ 保存成功" 日誌
   - 確認沒有錯誤日誌（❌）

5. 使用 MCP: take_screenshot
   - 截圖保存成功提示
   - 驗證 badge 顯示 "✓"

6. 驗證 Storage
   - 檢查 `saved_${normalizedUrl}` key 存在
   - 確認包含 Notion page ID
```

**預期結果：**
- ✅ 控制台顯示 "✅ 保存成功"
- ✅ Badge 顯示綠色 "✓"
- ✅ Storage 中有 `saved_` key
- ❌ 無錯誤日誌

---

### 測試 2：文本標註功能

**目標：** 驗證能夠標註文本並正確保存

**測試步驟：**
```javascript
1. 使用 MCP: navigate_page
   - URL: https://example.com/test-article

2. 選取文本（手動操作）
   - 選擇一段測試文本
   - 觸發標註（右鍵菜單或快捷鍵）

3. 使用 MCP: list_console_messages
   - 查找 "🎨 [標註] 標註已創建" 日誌
   - 確認標註 ID 和顏色

4. 使用 MCP: take_screenshot
   - 截圖標註效果
   - 驗證標註顏色正確（黃色預設）

5. 驗證 Storage
   - 檢查 `highlights_${normalizedUrl}` key
   - 確認包含標註數據（文本、顏色、範圍）

6. 刷新頁面測試恢復
   - 使用 MCP: navigate_page (相同 URL)
   - 確認標註自動恢復
   - 使用 MCP: list_console_messages
     * 查找 "✅ [初始化] 標註系統初始化完成"
     * 查找 "恢復標註" 日誌
```

**預期結果：**
- ✅ 標註成功創建並顯示
- ✅ Storage 中有 `highlights_` key
- ✅ 刷新後標註自動恢復
- ❌ 無錯誤日誌

---

### 測試 3：超長文章保存（v2.7.3 核心功能）

**目標：** 驗證分批處理功能正常工作

**測試步驟：**
```javascript
1. 使用 MCP: navigate_page
   - URL: https://learn.g2.com/gemini-vs-chatgpt
   - 這是一篇超長文章（300+ 區塊）

2. 觸發保存操作

3. 使用 MCP: list_console_messages (實時監控)
   - 查找 "📚 檢測到超長文章: XXX 個區塊"
   - 查找 "📦 準備分批添加區塊: 總共 XXX 個"
   - 查找 "📤 發送批次 1/X: 100 個區塊"
   - 查找 "✅ 批次 X 成功: 已添加 XXX/XXX 個區塊"
   - 查找 "🎉 所有區塊添加完成: XXX/XXX"

4. 計算處理時間
   - 記錄開始和結束時間戳
   - 驗證批次間有 350ms 延遲

5. 驗證 Notion 頁面
   - 打開保存的 Notion 頁面
   - 滾動到底部，確認所有內容都已保存
   - 比對原網頁，確認完整性
```

**預期結果：**
- ✅ 檢測到超長文章
- ✅ 自動分批處理（每批 100 個區塊）
- ✅ 所有批次成功完成
- ✅ Notion 頁面內容完整
- ⏱️ 處理時間合理（約 10-15 秒）

---

### 測試 4：標註遷移功能

**目標：** 驗證舊版標註能自動遷移到新系統

**測試步驟：**
```javascript
1. 準備測試數據
   - 在 localStorage 中手動插入舊格式標註數據
   - 格式：{ text, color, xpath, ... }

2. 使用 MCP: navigate_page
   - 打開有舊標註的測試頁面

3. 使用 MCP: list_console_messages
   - 查找 "🔍 [遷移] 檢查 localStorage 中的舊標註數據"
   - 查找 "🎯 [遷移] 發現舊標註: X 個"
   - 查找 "✅ [遷移] 成功遷移 X/X 個標註"
   - 查找 "🎉 [遷移] 遷移完成"

4. 驗證遷移結果
   - 檢查新格式的 `highlights_` key
   - 確認舊數據已從 localStorage 刪除

5. 使用 MCP: take_screenshot
   - 截圖遷移後的標註效果
   - 驗證標註位置和顏色正確
```

**預期結果：**
- ✅ 檢測到舊標註
- ✅ 成功遷移所有標註
- ✅ 舊數據已清理
- ✅ 標註顯示正確

---

### 測試 5：性能測試

**目標：** 驗證保存和標註速度符合性能目標

**測試步驟：**
```javascript
1. 短文章保存測試（< 100 區塊）
   - 記錄保存開始和完成時間
   - 目標：< 2 秒

2. 長文章保存測試（300+ 區塊）
   - 記錄保存開始和完成時間
   - 目標：< 15 秒

3. 標註同步測試
   - 創建標註並記錄時間
   - 目標：< 500ms

4. 使用 MCP: list_console_messages
   - 記錄所有時間戳
   - 計算實際耗時

5. 檢查 Storage 大小
   - 使用 `chrome.storage.local.getBytesInUse()`
   - 確認沒有異常增長
```

**性能目標：**
- ✅ 短文章保存：< 2s
- ✅ 長文章保存：< 15s
- ✅ 標註同步：< 500ms
- ✅ Storage 增長合理

---

## 🔍 錯誤場景測試

### 測試 6：網絡錯誤處理

**測試步驟：**
```javascript
1. 使用 MCP: emulate_network_conditions
   - 設置為 "Offline" 或不穩定網絡

2. 嘗試保存文章

3. 使用 MCP: list_console_messages
   - 查找錯誤處理日誌
   - 確認有友好的錯誤提示

4. 恢復網絡後重試
   - 驗證能夠成功保存
```

**預期結果：**
- ✅ 顯示友好的錯誤訊息
- ✅ 不會造成程式崩潰
- ✅ 網絡恢復後可正常使用

---

### 測試 7：瀏覽器兼容性

**測試步驟：**
```javascript
1. 檢測 CSS Highlight API 支援
   - 在控制台執行：'highlights' in CSS
   - 記錄結果

2. 如果不支援
   - 驗證是否有回退機制
   - 檢查警告日誌

3. 測試基本功能
   - 保存功能應該正常
   - 標註功能可能降級
```

**預期結果：**
- ✅ 正確檢測瀏覽器支援
- ✅ 有適當的回退機制
- ✅ 核心功能不受影響

---

## 📊 測試報告模板

### 測試執行記錄

```markdown
測試日期：2025-10-05
測試版本：v2.7.3
測試人員：[Your Name]
測試環境：Chrome 120.x / macOS

| 測試項目 | 狀態 | 耗時 | 備註 |
|---------|------|------|------|
| 基本保存 | ✅ PASS | 1.2s | 無問題 |
| 文本標註 | ✅ PASS | 0.3s | 顏色正確 |
| 超長文章 | ✅ PASS | 12.5s | 3個批次 |
| 標註遷移 | ✅ PASS | 2.1s | 5個標註成功遷移 |
| 性能測試 | ✅ PASS | - | 符合目標 |
| 網絡錯誤 | ✅ PASS | - | 錯誤處理正確 |
| 瀏覽器兼容 | ✅ PASS | - | API支援正常 |

**總結：** 所有測試通過 ✅
**發現問題：** 無
**建議改進：** [如有]
```

---

## 🔧 MCP 工具快速參考

### 常用 MCP 命令

```javascript
// 頁面導航
mcp_chrome-devtools_navigate_page({
    url: "https://example.com",
    timeout: 30000
})

// 拍攝快照
mcp_chrome-devtools_take_snapshot({})

// 截圖
mcp_chrome-devtools_take_screenshot({
    fullPage: true,
    format: "png"
})

// 查看控制台日誌
mcp_chrome-devtools_list_console_messages({})

// 等待特定文本出現
mcp_chrome-devtools_wait_for({
    text: "保存成功",
    timeout: 10000
})

// 調整頁面大小
mcp_chrome-devtools_resize_page({
    width: 1280,
    height: 800
})
```

---

## 📝 測試最佳實踐

1. **測試前準備**
   - 清理 Storage：`chrome.storage.local.clear()`
   - 確認擴展版本正確
   - 準備測試數據和測試頁面

2. **測試執行**
   - 按順序執行測試
   - 記錄所有日誌和截圖
   - 捕捉錯誤信息

3. **測試後清理**
   - 刪除測試數據
   - 關閉測試頁面
   - 記錄測試結果

4. **迴歸測試**
   - 每次發布前執行完整測試套件
   - 重點測試修改的功能
   - 驗證舊功能未被破壞

---

**注意：** 本測試指南是內部文檔，不同步到 GitHub。
