#!/bin/bash

# Notion Smart Clipper v2.4.9 打包腳本
# 此腳本會創建適合發布的 ZIP 檔案

VERSION="2.4.9"
BUILD_DIR="build"
PACKAGE_NAME="notion-smart-clipper-v${VERSION}"

echo "🚀 開始打包 Notion Smart Clipper v${VERSION}..."

# 清理並創建構建目錄
rm -rf $BUILD_DIR
mkdir -p $BUILD_DIR/$PACKAGE_NAME

echo "📁 複製必要文件..."

# 複製核心文件
cp manifest.json $BUILD_DIR/$PACKAGE_NAME/

# 複製目錄結構（保持目錄結構）
cp -r icons $BUILD_DIR/$PACKAGE_NAME/
cp -r lib $BUILD_DIR/$PACKAGE_NAME/
cp -r options $BUILD_DIR/$PACKAGE_NAME/
cp -r popup $BUILD_DIR/$PACKAGE_NAME/
cp -r scripts $BUILD_DIR/$PACKAGE_NAME/

# 複製重要文檔
cp README.md $BUILD_DIR/$PACKAGE_NAME/
cp PRIVACY.md $BUILD_DIR/$PACKAGE_NAME/
cp CHANGELOG.md $BUILD_DIR/$PACKAGE_NAME/
cp RELEASE_NOTES_v2.3.md $BUILD_DIR/$PACKAGE_NAME/

# 複製示例 HTML 文件
cp help.html $BUILD_DIR/$PACKAGE_NAME/
cp highlight-test.html $BUILD_DIR/$PACKAGE_NAME/
cp template-test.html $BUILD_DIR/$PACKAGE_NAME/

echo "🧹 清理不需要的文件..."

# 移除開發和測試文件
rm -f $BUILD_DIR/$PACKAGE_NAME/test-*.html
rm -f $BUILD_DIR/$PACKAGE_NAME/scripts/script-injector.js  # 已整合到 background.js 中
find $BUILD_DIR -name ".DS_Store" -delete

echo "📋 驗證文件結構..."
echo "主要文件:"
ls -la $BUILD_DIR/$PACKAGE_NAME/
echo ""
echo "腳本文件:"
ls -la $BUILD_DIR/$PACKAGE_NAME/scripts/

echo "📦 創建 ZIP 文件..."

# 進入構建目錄並創建 ZIP
cd $BUILD_DIR
zip -r "${PACKAGE_NAME}.zip" $PACKAGE_NAME/ -x "**/.DS_Store" "**/.*"

echo "✅ 打包完成！"
echo "📍 文件位置: build/${PACKAGE_NAME}.zip"
echo "📊 文件大小: $(ls -lh ${PACKAGE_NAME}.zip | awk '{print $5}')"

# 顯示目錄結構
echo ""
echo "📋 ZIP 文件目錄結構:"
unzip -l "${PACKAGE_NAME}.zip" | head -30

echo ""
echo "🎯 打包成功！ZIP 文件已準備好發布。"