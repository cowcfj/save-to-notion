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
cp -a help.html "$RM_DIR/"

# Copy directories
cp -a icons "$RM_DIR/"
cp -a options "$RM_DIR/"
cp -a popup "$RM_DIR/"
cp -a lib "$RM_DIR/"
cp -a update-notification "$RM_DIR/"
cp -a dist "$RM_DIR/"

# Copy scripts (selectively)
mkdir -p "$RM_DIR/scripts"
cp -a scripts/*.js "$RM_DIR/scripts/"

# Function to copy dir if exists
copy_dir_if_exists() {
    if [ -d "scripts/$1" ]; then
        cp -a "scripts/$1" "$RM_DIR/scripts/"
    fi
}

copy_dir_if_exists "background"
copy_dir_if_exists "config"
copy_dir_if_exists "performance"
copy_dir_if_exists "errorHandling"
copy_dir_if_exists "utils"

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
