# 🧪 v2.5.0 快速測試指南

## 🎯 目標
在發布前驗證新版標註系統的核心功能和遷移機制。

---

## ⏱️ 快速測試（15分鐘）

### 1️⃣ 加載擴展 (2分鐘)
```bash
1. 打開 Chrome 瀏覽器
2. 訪問 chrome://extensions/
3. 開啟右上角「開發者模式」
4. 點擊「載入未封裝項目」
5. 選擇：/Volumes/WD1TMac/code/notion-chrome
6. 確認擴展圖標出現在工具欄
```

### 2️⃣ 測試新標註功能 (5分鐘)
```bash
測試頁面：https://zh.wikipedia.org/wiki/Chrome扩展

操作步驟：
1. 選擇第一段文字
2. 右鍵 → 「標註文字」（或使用擴展圖標）
3. ✅ 驗證：文字出現黃色高亮

4. 選擇跨越兩個段落的文字
5. 右鍵 → 「標註文字」
6. ✅ 驗證：跨段落文字正常高亮

7. 打開開發者工具（F12）→ Console
8. ✅ 驗證：看到類似日誌：
   "[Highlighter v2] 標註已創建"
   "[Highlighter v2] 保存到存儲"

9. 刷新頁面 (F5)
10. ✅ 驗證：標註自動恢復
```

### 3️⃣ 測試遷移功能 (8分鐘)

#### 準備舊標註
```bash
1. 訪問 chrome://extensions/
2. 移除當前擴展
3. 從備份加載 v2.4.9 版本（如有）
   或跳過此步驟，使用測試頁面模擬

4. 打開測試頁面：
   file:///Volumes/WD1TMac/code/notion-chrome/migration-test-suite.html

5. 點擊「創建5個舊版標註」
6. ✅ 驗證：頁面出現 5 個黃色標註
7. 檢查 DOM（右鍵 → 檢查）
8. ✅ 驗證：看到 <span class="simple-highlight"> 標籤
```

#### 測試遷移
```bash
1. 在測試頁面點擊「運行完整測試」
2. 觀察測試日誌
3. ✅ 驗證階段1：創建新標註，舊標註變透明
4. ✅ 驗證階段2：驗證成功
5. ✅ 驗證階段3：舊 <span> 標籤被移除
6. ✅ 驗證結果：「完整測試通過」
```

---

## 🔍 詳細測試（1小時）

### 測試場景 1：跨元素標註
```
網站：Wikipedia、Medium、GitHub

測試用例：
□ 跨兩個段落標註
□ 跨列表項標註
□ 跨表格單元格標註
□ 跨引用塊標註
□ 混合格式文本標註（粗體+斜體+鏈接）

每個用例驗證：
✓ 標註顯示正常
✓ 刷新後恢復正常
✓ 可以正常刪除
✓ 控制台無錯誤
```

### 測試場景 2：標註管理
```
操作測試：
□ 創建 10+ 個標註
□ 雙擊刪除標註
□ Ctrl+點擊快速刪除
□ 清除所有標註
□ 保存到 Notion 包含標註

驗證：
✓ 刪除響應快速
✓ 存儲正確更新
✓ Notion 頁面包含標註文本
```

### 測試場景 3：真實遷移流程

#### 步驟 A：創建舊標註
```bash
# 如果有 v2.4.9 版本
1. 加載 v2.4.9
2. 訪問測試網站
3. 創建 5-10 個標註
4. 確認保存成功
5. 記錄標註內容

# 如果沒有舊版本
跳過，使用測試頁面模擬
```

#### 步驟 B：升級到 v2.5.0
```bash
1. 移除 v2.4.9
2. 加載 v2.5.0
3. 訪問之前標註的網站
4. 打開 Console 觀察

預期日誌：
[SeamlessMigration] 開始階段1遷移
[SeamlessMigration] 檢測到 X 個舊標註
[SeamlessMigration] 創建新標註: "xxx..."
[SeamlessMigration] 隱藏舊標註
[SeamlessMigration] 階段1完成

✓ 舊標註仍可見（或略微透明）
✓ DOM 中 <span> 還在但 opacity:0
✓ 標註功能正常
```

#### 步驟 C：階段 2 驗證
```bash
1. 刷新頁面
2. 觀察 Console

預期日誌：
[SeamlessMigration] 開始階段2驗證
[SeamlessMigration] 驗證新標註數量
[SeamlessMigration] 驗證通過
[SeamlessMigration] 階段2完成

✓ 標註正常顯示
✓ 功能完全正常
```

#### 步驟 D：階段 3 清理
```bash
1. 再次刷新頁面
2. 觀察 Console

預期日誌：
[SeamlessMigration] 開始階段3清理
[SeamlessMigration] 移除舊標註 DOM
[SeamlessMigration] 遷移完成

3. 檢查 DOM（F12 → Elements）
✓ 不再有 <span class="simple-highlight">
✓ DOM 結構乾淨
✓ 標註仍然正常顯示
```

### 測試場景 4：回滾機制

#### 模擬失敗場景
```javascript
// 臨時修改 seamless-migration.js 模擬失敗
// 在 phase2_VerifyAndHide 中添加：
if (true) {
    console.warn('[測試] 模擬驗證失敗');
    return false;
}
```

#### 測試回滾
```bash
1. 重新加載擴展
2. 訪問有舊標註的頁面
3. 觀察 Console

預期行為：
[SeamlessMigration] 階段2驗證失敗
[SeamlessMigration] 執行回滾
[SeamlessMigration] 恢復舊標註顯示

✓ 舊標註重新可見
✓ 標註功能正常
✓ 數據沒有丟失
```

### 測試場景 5：性能測試
```bash
使用測試頁面：migration-test-suite.html

測試步驟：
1. 創建 20 個舊標註
2. 運行完整遷移測試
3. 觀察日誌中的時間戳

性能指標：
□ 階段1完成 < 500ms
□ 階段2完成 < 300ms
□ 階段3完成 < 500ms
□ 總時間 < 2s

瀏覽器性能：
□ 頁面無卡頓
□ 內存增長 < 10MB
□ CPU 使用正常
```

---

## 🌐 兼容性測試

### 瀏覽器測試
```
□ Chrome 120 (最新版)
□ Chrome 105 (最低支持版本)
□ Edge 120
□ Safari 17.2+ (如可用)
```

### 網站測試
```
推薦測試網站：
□ Wikipedia - 複雜段落結構
□ Medium - 富文本編輯器
□ GitHub - 代碼和 Markdown
□ 新聞網站 - 廣告和動態內容
□ 技術博客 - 代碼塊和引用

每個網站驗證：
✓ 標註正常工作
✓ 不影響網站功能
✓ 刷新後恢復正常
✓ Console 無錯誤
```

---

## 🐛 常見問題檢查

### 問題 1：標註不顯示
```
檢查項：
□ Console 是否有錯誤
□ CSS.highlights API 是否支持
  執行：typeof CSS.highlights
  期望："object"
□ 存儲是否正常
  執行：chrome.storage.local.get(console.log)
```

### 問題 2：遷移失敗
```
檢查項：
□ 舊標註是否正確保存
□ 遷移狀態是否正確
  執行：chrome.storage.local.get('migration_states', console.log)
□ Console 中的錯誤信息
```

### 問題 3：性能問題
```
檢查項：
□ 標註數量是否過多（>50）
□ 頁面大小是否過大
□ Chrome 任務管理器查看內存/CPU
```

---

## ✅ 測試通過標準

### 功能完整性
- [x] 新標註功能正常
- [x] 跨元素標註成功
- [x] 標註恢復正常
- [x] 標註刪除正常
- [x] 保存到 Notion 包含標註

### 遷移正確性
- [x] 三階段順序執行
- [x] 舊標註正確識別
- [x] 新標註成功創建
- [x] DOM 最終清理乾淨
- [x] 失敗時正確回滾

### 性能可接受
- [x] 標註創建 < 200ms
- [x] 遷移處理 < 2s
- [x] 頁面無明顯卡頓
- [x] 內存使用合理

### 兼容性良好
- [x] Chrome 105+ 正常
- [x] 多個網站測試通過
- [x] 不影響網頁功能

---

## 📝 測試報告模板

```markdown
# v2.5.0 測試報告

**測試日期：** 2025-10-01  
**測試人員：** [你的名字]  
**測試環境：** Chrome [版本號] / macOS [版本號]

## 測試結果

### ✅ 通過的測試
- 新標註功能：[✓ 通過]
- 跨元素標註：[✓ 通過]
- 遷移階段1：[✓ 通過]
- 遷移階段2：[✓ 通過]
- 遷移階段3：[✓ 通過]
- 回滾機制：[✓ 通過]

### ⚠️ 發現的問題
1. [問題描述]
   - 重現步驟：
   - 預期行為：
   - 實際行為：
   - 嚴重程度：[高/中/低]

### 📊 性能數據
- 標註創建時間：XXXms
- 遷移總時間：XXXms
- 內存增加：XXXMB

### 🌐 兼容性
| 瀏覽器 | 版本 | 結果 |
|--------|------|------|
| Chrome | 120  | ✅   |
| Edge   | 120  | ✅   |

### 💭 測試建議
- [改進建議1]
- [改進建議2]

## 結論
□ 可以發布
□ 需要修復後發布
□ 不建議發布
```

---

## 🚀 快速命令

```bash
# 重新加載擴展
打開：chrome://extensions/
點擊：刷新圖標 🔄

# 查看擴展日誌
右鍵擴展圖標 → 檢查彈出式視窗
或
打開背景頁：chrome://extensions/ → 背景頁 → Console

# 清除所有數據（重新測試）
chrome.storage.local.clear()
location.reload()

# 檢查 CSS Highlight API 支持
console.log('CSS.highlights:', typeof CSS.highlights)

# 查看遷移狀態
chrome.storage.local.get('migration_states', console.log)

# 查看存儲的標註
chrome.storage.local.get(console.log)
```

---

**開始測試！** 🧪

記得：
1. 每個測試場景都要記錄結果
2. 發現問題立即截圖
3. Console 日誌很重要
4. 測試多個網站以確保兼容性

祝測試順利！
