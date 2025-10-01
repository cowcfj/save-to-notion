#!/bin/bash
# cleanup.sh - 項目清理腳本
# 版本: 1.0
# 日期: 2025-10-01

set -e  # 遇到錯誤立即退出

echo "🧹 開始清理 Notion Smart Clipper 項目..."
echo ""

# 當前目錄
PROJECT_DIR="/Volumes/WD1TMac/code/notion-chrome"
cd "$PROJECT_DIR"

# 1. 創建存檔目錄
echo "📁 創建存檔目錄..."
mkdir -p archive/old-versions
mkdir -p archive/tests
mkdir -p archive/patches
mkdir -p archive/old-releases
mkdir -p tests
mkdir -p demos

# 2. 備份當前狀態（可選，安全起見）
echo "💾 創建備份..."
BACKUP_NAME="backup-$(date +%Y%m%d-%H%M%S).tar.gz"
tar -czf "archive/$BACKUP_NAME" \
    scripts/*.js \
    *.html \
    *.md \
    2>/dev/null || true
echo "   ✓ 備份已創建: archive/$BACKUP_NAME"

# 3. 移動舊版本標註系統文件
echo ""
echo "🗑️  移動舊版本文件..."
if [ -f "scripts/highlighter.js" ]; then
    mv scripts/highlighter.js archive/old-versions/
    echo "   ✓ highlighter.js (49KB)"
fi
if [ -f "scripts/highlight-restore.js" ]; then
    mv scripts/highlight-restore.js archive/old-versions/
    echo "   ✓ highlight-restore.js (4.1KB)"
fi
if [ -f "notion-smart-clipper-v2.4.1.zip" ]; then
    mv notion-smart-clipper-v2.4.1.zip archive/old-versions/
    echo "   ✓ v2.4.1 zip 文件"
fi
if [ -f "help_base.html" ]; then
    rm help_base.html
    echo "   ✓ help_base.html (臨時文件)"
fi

# 4. 整理測試文件到 tests/ 目錄
echo ""
echo "🧪 整理測試文件..."
for file in *-test.html css-highlight-api-test.html highlighter-comparison.html migration-test-suite.html; do
    if [ -f "$file" ]; then
        mv "$file" tests/
        echo "   ✓ $file"
    fi
done

# 5. 整理演示文件到 demos/ 目錄
echo ""
echo "🎨 整理演示文件..."
for file in *-demo.html seamless-migration-demo.html template-test.html; do
    if [ -f "$file" ]; then
        mv "$file" demos/
        echo "   ✓ $file"
    fi
done

# 6. 整理補丁文檔
echo ""
echo "📋 整理補丁文檔..."
for file in FIX_REPORT*.md PATCH*.md; do
    if [ -f "$file" ]; then
        mv "$file" archive/patches/
        echo "   ✓ $file"
    fi
done

# 7. 整理舊版本發布說明（保留最新的）
echo ""
echo "📰 整理發布說明..."
for file in RELEASE_NOTES_v2.[1-4]*.md; do
    if [ -f "$file" ] && [ "$file" != "RELEASE_NOTES_v2.5.3.md" ]; then
        mv "$file" archive/old-releases/
        echo "   ✓ $file"
    fi
done

# 8. 合併所有舊發布說明
echo ""
echo "📚 合併舊版本發布說明到 archive/ALL_RELEASES_HISTORY.md..."
cat archive/old-releases/RELEASE_NOTES_*.md > archive/ALL_RELEASES_HISTORY.md 2>/dev/null || true
echo "   ✓ 已合併到 ALL_RELEASES_HISTORY.md"

# 9. 創建 README 在各個目錄
echo ""
echo "📝 創建目錄說明文件..."

cat > archive/README.md << 'EOF'
# Archive 目錄

此目錄包含項目的歷史文件和備份。

## 目錄結構

- `old-versions/` - 舊版本代碼文件（已不再使用）
- `tests/` - 測試 HTML 文件
- `patches/` - 歷史補丁和修復報告
- `old-releases/` - 舊版本發布說明
- `backup-*.tar.gz` - 完整項目備份

## 注意

這些文件保留作為歷史記錄，但不再用於生產環境。
如需恢復，請參考備份文件。
EOF

cat > tests/README.md << 'EOF'
# 測試文件

此目錄包含各種測試 HTML 文件，用於驗證功能。

## 使用方法

1. 在瀏覽器中打開 HTML 文件
2. 載入擴展（開發模式）
3. 測試相應功能

## 測試文件列表

- `highlight-test.html` - 標註功能測試
- `list-test.html` - 列表標註測試
- `long-text-test.html` - 長文本處理測試
- `css-highlight-api-test.html` - CSS Highlight API 測試
- `highlighter-comparison.html` - 新舊版本對比
- `migration-test-suite.html` - 遷移測試套件
EOF

cat > demos/README.md << 'EOF'
# 演示文件

此目錄包含功能演示頁面。

## 演示列表

- `seamless-migration-demo.html` - 無縫遷移演示
- `template-test.html` - 模板功能演示
EOF

echo "   ✓ README 文件已創建"

# 10. 統計清理結果
echo ""
echo "📊 清理統計..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

OLD_FILES=$(find archive/old-versions -type f 2>/dev/null | wc -l | tr -d ' ')
TEST_FILES=$(find tests -name "*.html" 2>/dev/null | wc -l | tr -d ' ')
DEMO_FILES=$(find demos -name "*.html" 2>/dev/null | wc -l | tr -d ' ')
PATCH_DOCS=$(find archive/patches -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
OLD_RELEASES=$(find archive/old-releases -name "*.md" 2>/dev/null | wc -l | tr -d ' ')

echo "   舊版本文件: $OLD_FILES 個"
echo "   測試文件: $TEST_FILES 個"
echo "   演示文件: $DEMO_FILES 個"
echo "   補丁文檔: $PATCH_DOCS 個"
echo "   舊發布說明: $OLD_RELEASES 個"
echo ""

# 計算節省的空間
SAVED_SIZE=$(du -sh archive/ 2>/dev/null | awk '{print $1}')
echo "   存檔大小: $SAVED_SIZE"
echo ""

# 11. 檢查 manifest.json 是否正確（不引用已刪除的文件）
echo "🔍 驗證 manifest.json..."
if grep -q "highlighter.js" manifest.json 2>/dev/null; then
    echo "   ⚠️  警告: manifest.json 仍引用 highlighter.js"
else
    echo "   ✓ manifest.json 正確"
fi

# 12. 生成清理報告
echo ""
echo "📄 生成清理報告..."
REPORT_FILE="CLEANUP_REPORT_$(date +%Y%m%d).md"

cat > "$REPORT_FILE" << EOF
# 項目清理報告

**執行日期**: $(date +"%Y年%m月%d日 %H:%M:%S")  
**腳本版本**: 1.0

## 清理摘要

### 移動的文件
- 舊版本文件: $OLD_FILES 個 → archive/old-versions/
- 測試文件: $TEST_FILES 個 → tests/
- 演示文件: $DEMO_FILES 個 → demos/
- 補丁文檔: $PATCH_DOCS 個 → archive/patches/
- 舊發布說明: $OLD_RELEASES 個 → archive/old-releases/

### 備份
- 備份文件: archive/$BACKUP_NAME
- 備份內容: 所有 scripts、HTML、Markdown 文件

### 目錄結構（優化後）
\`\`\`
notion-chrome/
├── scripts/           (僅當前使用的文件)
│   ├── background.js
│   ├── content.js
│   ├── highlighter-v2.js
│   ├── seamless-migration.js
│   ├── highlighter-migration.js (暫時保留)
│   └── utils.js
├── tests/             (所有測試文件)
├── demos/             (演示文件)
├── archive/           (歷史文件)
│   ├── old-versions/
│   ├── patches/
│   ├── old-releases/
│   └── backup-*.tar.gz
└── ... (其他文件)
\`\`\`

### 下一步建議
1. 測試基本功能（標註、保存）
2. 檢查 archive/ 中的文件是否需要保留
3. 考慮在 v2.6.0 移除 highlighter-migration.js
4. 執行日誌優化（見 CODE_REVIEW_REPORT.md）

### 回滾方法
如需恢復：
\`\`\`bash
cd /Volumes/WD1TMac/code/notion-chrome
tar -xzf archive/$BACKUP_NAME
\`\`\`

---
**狀態**: ✅ 清理完成，請測試後確認
EOF

echo "   ✓ 報告已保存: $REPORT_FILE"

# 完成
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ 清理完成！"
echo ""
echo "📋 清理報告: $REPORT_FILE"
echo "💾 備份文件: archive/$BACKUP_NAME"
echo ""
echo "⚠️  請執行以下測試："
echo "   1. 在瀏覽器中重新載入擴展"
echo "   2. 測試標註功能"
echo "   3. 測試保存到 Notion"
echo "   4. 檢查控制台是否有錯誤"
echo ""
echo "如果一切正常，可以提交更改："
echo "   git add ."
echo "   git commit -m 'chore: clean up redundant files and reorganize structure'"
echo ""
