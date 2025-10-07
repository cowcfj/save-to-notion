# demos 目錄合併報告

**日期**: 2025-10-07  
**操作**: 合併 internal/demos/ 到 tests/manual/

---

## 📋 問題發現

### 目錄重複
- `internal/demos/` - 演示頁面
- `tests/manual/` - 手動測試頁面

**問題**: 這兩個目錄用途重疊，造成混淆

---

## ✅ 解決方案

### 合併到 tests/manual/
**理由**:
1. `tests/` 是測試相關的標準位置
2. 演示頁面本質上也是測試頁面
3. `tests/manual/` 已經有 15+ 個測試頁面
4. 符合項目結構慣例
5. 避免目錄重複

---

## 📁 執行的操作

### 1. 移動文件
```bash
# 移動演示頁面
mv internal/demos/seamless-migration-demo.html tests/manual/

# 刪除空目錄
rm internal/demos/README.md
rmdir internal/demos/
```

### 2. 更新文檔
- ✅ 更新 Agents.md
  - 移除 internal/demos/ 引用
  - 更新手動測試頁面創建規則
  - 明確告知 AI agents 使用 tests/manual/

---

## 📊 最終結構

### tests/manual/ (17 個文件)
```
tests/manual/
├── test-*.html                      # 功能測試頁面
├── *-demo.html                      # 演示頁面
├── seamless-migration-demo.html     # 無縫遷移演示 ⭐ 移動過來
├── migration-test-suite.html
├── highlighter-comparison.html
├── test-database-selector.html
└── ...
```

---

## 🎯 給 AI Agents 的新規則

### 創建測試/演示頁面時
```markdown
1. 在 tests/manual/ 目錄下創建
2. 測試頁面使用 test-{feature-name}.html 格式
3. 演示頁面使用 {feature-name}-demo.html 格式
4. 包含清晰的標題和說明
5. 確保自包含（內嵌所有 CSS/JS）
```

### 不要做 ❌
- 在根目錄創建測試/演示頁面
- 在 internal/ 目錄創建測試頁面
- 創建新的 demos 目錄

### 應該做 ✅
- 所有測試/演示頁面放在 `tests/manual/`
- 使用描述性的文件名
- 內嵌所有樣式和腳本

---

## 💡 優勢

### 1. 避免重複
- ✅ 只有一個測試頁面目錄
- ✅ 清晰的組織結構
- ✅ 減少混淆

### 2. 符合慣例
- ✅ tests/ 是測試相關的標準位置
- ✅ manual/ 表示手動測試
- ✅ 與其他測試目錄一致

### 3. 易於維護
- ✅ 所有測試頁面在一個地方
- ✅ 不需要在多個目錄查找
- ✅ 簡化項目結構

---

## 📝 注意事項

### tests/manual/ 在 .gitignore 中
```gitignore
# 手動測試頁面不同步到 GitHub
tests/manual/
```

**原因**:
- 這些是開發測試用的頁面
- 不是項目核心代碼
- 避免倉庫膨脹

**影響**:
- 文件只存在於本地
- 不會同步到 GitHub
- 團隊成員需要自己創建測試頁面

---

## 🔄 項目結構改善

### 之前
```
notion-chrome/
├── internal/
│   ├── demos/           # 演示頁面 ❌ 重複
│   └── ...
├── tests/
│   ├── manual/          # 測試頁面 ❌ 重複
│   └── ...
```

### 之後
```
notion-chrome/
├── internal/
│   └── ...              # 沒有 demos/
├── tests/
│   ├── manual/          # 所有測試/演示頁面 ✅ 統一
│   └── ...
```

---

## 📚 相關文檔

- **Agents.md** - 已更新手動測試頁面創建規則
- **tests/README.md** - 測試目錄說明
- **.gitignore** - tests/manual/ 不同步規則

---

## ✅ 完成狀態

- [x] 移動 seamless-migration-demo.html 到 tests/manual/
- [x] 刪除 internal/demos/ 目錄
- [x] 更新 Agents.md
- [x] 創建合併報告
- [x] 提交到 Git

---

**完成時間**: 2025-10-07  
**狀態**: ✅ 完成
