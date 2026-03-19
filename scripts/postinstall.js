const fs = require('node:fs');
const path = require('node:path');

const projectRoot = process.cwd();
const targetPath = path.join(projectRoot, 'scripts', 'config', 'env.js');
const templatePath = path.join(projectRoot, 'scripts', 'config', 'env.example.js');

if (!fs.existsSync(targetPath)) {
  fs.copyFileSync(templatePath, targetPath);
  console.error('Created scripts/config/env.js from template');
}
