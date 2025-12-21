#!/bin/bash
set -euo pipefail  # Exit on error, undefined vars, and pipe failures

# Default version from package.json if not provided
VERSION=${1:-$(node -p "require('./package.json').version")}
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
rm -rf "$RM_DIR"
mkdir -p "$RM_DIR"

# Safety check: Ensure RM_DIR is not empty and not a system directory
if [ -z "$RM_DIR" ] || [ ! -d "$RM_DIR" ]; then
    echo "❌ Error: RM_DIR is empty or does not exist. Aborting."
    exit 1
fi

case "$RM_DIR" in
    /|/usr|/var|/etc|/bin|/sbin|/lib|/home|/root)
        echo "❌ Error: RM_DIR points to a system directory. Aborting."
        exit 1
        ;;
esac

echo "📂 Copying files..."

# Copy root files
cp -a manifest.json "$RM_DIR/"


# Copy directories
cp -a icons "$RM_DIR/"
cp -a options "$RM_DIR/"
cp -a popup "$RM_DIR/"
cp -a lib "$RM_DIR/"
cp -a update-notification "$RM_DIR/"
cp -a dist "$RM_DIR/"

# Copy scripts directory, excluding test-only and bundled directories
rsync -a \
    --exclude='__mocks__' \
    --exclude='content' \
    --exclude='highlighter' \
    --exclude='legacy' \
    scripts/ "$RM_DIR/scripts/"

# Copy seamless-migration.js if it exists separately (it's in scripts/ based on manifest)
# Checked manifest: "scripts/seamless-migration.js" is used.

echo "📂 Scripts folder content:"
ls -R "$RM_DIR/scripts/"

echo "🤐 Zipping..."
cd "$RM_DIR"
zip -r "../releases/$ZIP_NAME" .
cd ..

# Cleanup
rm -rf "$RM_DIR"

echo "✅ Package created: releases/$ZIP_NAME"

if [ -n "${GITHUB_OUTPUT:-}" ]; then
    echo "zip_path=releases/$ZIP_NAME" >> "$GITHUB_OUTPUT"
else
    echo "::set-output name=zip_path::releases/$ZIP_NAME"
fi
