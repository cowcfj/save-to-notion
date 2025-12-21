#!/bin/bash
set -e

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

# Copy scripts directory (will clean up unwanted subdirs later)
cp -a scripts "$RM_DIR/"

# Remove test-only and bundled directories
rm -rf "$RM_DIR/scripts/__mocks__"     # Jest mock files
rm -rf "$RM_DIR/scripts/content"       # Bundled into dist/content.bundle.js
rm -rf "$RM_DIR/scripts/highlighter"   # Bundled into content bundle
rm -rf "$RM_DIR/scripts/legacy"        # Bundled into dist/migration-executor.js

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

if [ -n "$GITHUB_OUTPUT" ]; then
    echo "zip_path=releases/$ZIP_NAME" >> "$GITHUB_OUTPUT"
else
    echo "::set-output name=zip_path::releases/$ZIP_NAME"
fi
