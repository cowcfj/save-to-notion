#!/bin/bash
set -euo pipefail  # Exit on error, undefined vars, and pipe failures

# Optional flags for local/unpacked packaging.
RAW_VERSION=""
UNPACKED_DIR=""
SKIP_ZIP=false
MANIFEST_KEY_FILE=""

while [ $# -gt 0 ]; do
    case "$1" in
        --unpacked-dir=*)
            UNPACKED_DIR="${1#*=}"
            shift
            ;;
        --unpacked-dir)
            UNPACKED_DIR="${2:-}"
            if [ -z "$UNPACKED_DIR" ]; then
                echo "❌ Error: --unpacked-dir requires a path."
                exit 1
            fi
            shift 2
            ;;
        --skip-zip)
            SKIP_ZIP=true
            shift
            ;;
        --manifest-key-file=*)
            MANIFEST_KEY_FILE="${1#*=}"
            shift
            ;;
        --manifest-key-file)
            MANIFEST_KEY_FILE="${2:-}"
            if [ -z "$MANIFEST_KEY_FILE" ]; then
                echo "❌ Error: --manifest-key-file requires a path."
                exit 1
            fi
            shift 2
            ;;
        --*)
            echo "❌ Error: Unknown option $1"
            exit 1
            ;;
        *)
            if [ -n "$RAW_VERSION" ]; then
                echo "❌ Error: Version provided more than once."
                exit 1
            fi
            RAW_VERSION="$1"
            shift
            ;;
    esac
done

if [ "$SKIP_ZIP" = true ] && [ -z "$UNPACKED_DIR" ]; then
    echo "❌ Error: --skip-zip requires --unpacked-dir."
    exit 1
fi

# Default version from package.json if not provided
RAW_VERSION=${RAW_VERSION:-$(node -p "require('./package.json').version")}
# Strip leading 'v' if present to avoid "vv" prefix (e.g. vv2.22.0)
VERSION="${RAW_VERSION#v}"
ZIP_NAME="notion-smart-clipper-v${VERSION}.zip"

echo "📦 Packaging Extension v${VERSION}..."

# Ensure dist exists
if [ ! -d "dist" ]; then
    echo "❌ Error: dist/ directory not found. Please run 'npm run build:prod' first."
    exit 1
fi

# Create releases directory
mkdir -p releases

# Create temporary packaging directory
RM_DIR="release-package"

# Safety: Ensure RM_DIR is set (prevents rm -rf /)
if [ -z "$RM_DIR" ]; then
    echo "❌ Error: RM_DIR is empty. Aborting."
    exit 1
fi

rm -rf "$RM_DIR"
mkdir -p "$RM_DIR"

echo "📂 Copying files..."

# Copy root files
node tools/inject-manifest-key.mjs \
    --source="$PWD/manifest.json" \
    --target="$PWD/$RM_DIR/manifest.json" \
    --key-file="${MANIFEST_KEY_FILE:-$PWD/.non-existent-manifest-key}"
cp -a auth.html "$RM_DIR/"          # 帳號登入 callback bridge


# Copy directories
cp -a icons "$RM_DIR/"
cp -a options "$RM_DIR/"
cp -a popup "$RM_DIR/"
cp -a sidepanel "$RM_DIR/"
cp -a update-notification "$RM_DIR/"
cp -a styles "$RM_DIR/"            # callback bridge 共用 CSS
cp -a dist "$RM_DIR/"

# Copy scripts directory, excluding test-only and bundled directories
rsync -a \
    --exclude='.DS_Store' \
    --exclude='__mocks__' \
    --exclude='background' \
    --exclude='background.js' \
    --exclude='config/contentSafe/toolbarIcons.js' \
    --exclude='config/contentSafe/toolbarMessages.js' \
    --exclude='config/patterns.js' \
    --exclude='config/ui-selectors.js' \
    --exclude='config/README.md' \
    --exclude='content' \
    --exclude='config/env/build.example.js' \
    --exclude='config/env.js' \
    --exclude='config/extension/index.js' \
    --exclude='highlighter' \
    --exclude='legacy' \
    --exclude='config/runtimeActions/contentBridgeActions.js' \
    --exclude='config/runtimeActions/highlighterActions.js' \
    --exclude='config/runtimeActions/pageSaveActions.js' \
    --exclude='config/runtimeActions/preloaderActions.js' \
    --exclude='config/shared/highlightConstants.js' \
    --exclude='config/shared/index.js' \
    --exclude='config/shared/notionCodeLanguages.js' \
    --exclude='utils/contentUtils.js' \
    --exclude='utils/imageUtils.js' \
    --exclude='utils/pageComplexityDetector.js' \
    --exclude='utils/README.md' \
    --exclude='config/env.example.js' \
    --exclude='config/highlightConstants.js' \
    --exclude='config/index.js' \
    --exclude='config/notionCodeLanguages.js' \
    --exclude='performance' \
    --exclude='postinstall.js' \
    --exclude='sync' \
    --exclude='utils/LogExporter.js' \
    --exclude='utils/RetryManager.js' \
    scripts/ "$RM_DIR/scripts/"

# Sidepanel 直接依賴 HighlightLookupResolver，需顯式補回 package。
mkdir -p "$RM_DIR/scripts/highlighter/core"
cp -a scripts/highlighter/core/HighlightLookupResolver.js "$RM_DIR/scripts/highlighter/core/"

# 清理 macOS metadata，避免從 cp -a 帶入 release package。
find "$RM_DIR" -name '.DS_Store' -delete
# production 不打包任何殘留 sourcemap。
find "$RM_DIR/dist" -name '*.map' -delete

echo "📂 Scripts folder content:"
ls -R "$RM_DIR/scripts/"

# 驗證 ES 模組匯入鏈 — 確保套件中無遺失檔案
echo "🔍 驗證 ES 模組匯入鏈..."
node -e "
const fs = require('node:fs');
const path = require('node:path');

const pkgDir = path.resolve('$RM_DIR');
const visited = new Set();
const missing = [];

function resolveImports(filePath) {
  const absPath = path.resolve(filePath);
  if (visited.has(absPath)) return;
  if (!fs.existsSync(absPath)) {
    missing.push({ from: filePath, needs: filePath, resolved: path.relative(pkgDir, absPath) });
    return;
  }
  visited.add(absPath);

  const content = fs.readFileSync(absPath, 'utf8');
  const importRegex = /(?:import|export)\s+[\s\S]*?from\s+['\"]([^'\"]+)['\"];?|import\s+['\"]([^'\"]+)['\"];?/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const specifier = match[1] || match[2];
    if (!specifier.startsWith('.')) continue;
    const resolved = path.resolve(path.dirname(absPath), specifier);
    if (!fs.existsSync(resolved)) {
      missing.push({ from: path.relative(pkgDir, absPath), needs: specifier, resolved: path.relative(pkgDir, resolved) });
    } else {
      resolveImports(resolved);
    }
  }
}

// 找出所有 HTML 檔案中的 <script type=\"module\" src=\"...\"> 入口（屬性順序不固定）
const htmlDirs = ['popup', 'options', 'sidepanel', 'update-notification'];
for (const dir of htmlDirs) {
  const dirPath = path.join(pkgDir, dir);
  if (!fs.existsSync(dirPath)) continue;
  for (const file of fs.readdirSync(dirPath)) {
    if (!file.endsWith('.html')) continue;
    const html = fs.readFileSync(path.join(dirPath, file), 'utf8');
    const scriptTagRegex = /<script\b([^>]*)>/g;
    let tag;
    while ((tag = scriptTagRegex.exec(html)) !== null) {
      const attrs = tag[1];
      if (!/type=['\"]module['\"]/.test(attrs)) continue;
      const srcMatch = attrs.match(/src=['\"]([^'\"]+)['\"]/);
      if (srcMatch) resolveImports(path.join(dirPath, srcMatch[1]));
    }
  }
}

for (const file of ['auth.html']) {
  const htmlPath = path.join(pkgDir, file);
  if (!fs.existsSync(htmlPath)) continue;
  const html = fs.readFileSync(htmlPath, 'utf8');
  const scriptTagRegex = /<script\b([^>]*)>/g;
  let tag;
  while ((tag = scriptTagRegex.exec(html)) !== null) {
    const attrs = tag[1];
    if (!/type=['\"]module['\"]/.test(attrs)) continue;
    const srcMatch = attrs.match(/src=['\"]([^'\"]+)['\"]/);
    if (srcMatch) resolveImports(path.join(pkgDir, srcMatch[1]));
  }
}

if (missing.length > 0) {
  console.error('❌ 套件中存在遺失的 ES 模組依賴：');
  for (const m of missing) {
    console.error('   ' + m.from + ' → import from ' + JSON.stringify(m.needs) + ' → file not found: ' + m.resolved);
  }
  process.exit(1);
} else {
  console.log('✅ 所有 ES 模組匯入鏈驗證通過（已檢查 ' + visited.size + ' 個檔案）');
}
"

if [ -n "$UNPACKED_DIR" ]; then
    mkdir -p "$(dirname "$UNPACKED_DIR")"
    rm -rf "$UNPACKED_DIR"
    cp -a "$RM_DIR" "$UNPACKED_DIR"
    echo "📂 Unpacked package created: $UNPACKED_DIR"
fi

if [ "$SKIP_ZIP" = false ]; then
    echo "🤐 Zipping..."
    rm -f "releases/$ZIP_NAME"
    cd "$RM_DIR"
    zip -r "../releases/$ZIP_NAME" .
    cd ..
fi

# Cleanup
rm -rf "$RM_DIR"

if [ "$SKIP_ZIP" = false ]; then
    echo "✅ Package created: releases/$ZIP_NAME"
fi

if [ -n "${GITHUB_OUTPUT:-}" ]; then
    if [ "$SKIP_ZIP" = false ]; then
        echo "zip_path=releases/$ZIP_NAME" >> "$GITHUB_OUTPUT"
    fi
    if [ -n "$UNPACKED_DIR" ]; then
        echo "unpacked_dir=$UNPACKED_DIR" >> "$GITHUB_OUTPUT"
    fi
elif [ "$SKIP_ZIP" = false ]; then
    echo "::set-output name=zip_path::releases/$ZIP_NAME"
fi
