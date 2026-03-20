/* eslint-disable no-console */

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = process.cwd();
const targetPath = path.join(projectRoot, 'scripts', 'config', 'env.js');
const templatePath = path.join(projectRoot, 'scripts', 'config', 'env.example.js');

function failPostinstall() {
  process.exitCode = 1;
}

if (fs.existsSync(targetPath)) {
  // env.js 已存在時無需動作
} else if (fs.existsSync(templatePath)) {
  try {
    fs.copyFileSync(templatePath, targetPath);
    console.info('已從 env.example.js 建立 scripts/config/env.js');
  } catch (error) {
    console.error('建立 scripts/config/env.js 失敗：', error);
    failPostinstall();
  }
} else {
  console.warn('找不到範本檔 env.example.js，已跳過建立 scripts/config/env.js');
  failPostinstall();
}
