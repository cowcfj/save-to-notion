/**
 * @jest-environment node
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const testFilePath = fileURLToPath(import.meta.url);
const testDir = path.dirname(testFilePath);
const rootDir = path.resolve(testDir, '../../../..');

describe('tools/check-extension-package-surface.mjs', () => {
  const scriptPath = path.resolve(rootDir, 'tools/check-extension-package-surface.mjs');
  let tempRoot;

  const writeFile = (relativePath, contents = '') => {
    const filePath = path.join(tempRoot, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents, 'utf8');
    return filePath;
  };

  const createAllowedPackage = () => {
    writeFile('manifest.json', '{}\n');
    writeFile('icons/icon16.png');
    writeFile('pages/options/options.html', '<script type="module" src="../../dist/pages/options.js"></script>\n');
    writeFile('pages/options/options.css', '.root {}\n');
    writeFile('pages/options/assets/logo.svg', '<svg></svg>\n');
    writeFile('styles/callback-bridge.css', '.card {}\n');
    writeFile('dist/content.bundle.js', 'globalThis.extractPageContent = () => null;\n');
    writeFile('dist/scripts/background.js', 'chrome.runtime.onMessage.addListener(() => {});\n');
    writeFile('dist/pages/options.js', 'console.log("options bundle");\n');
  };

  const runCli = (unpackedDir = tempRoot) =>
    execFileSync('node', [scriptPath, `--unpacked-dir=${unpackedDir}`], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: 'pipe',
    });

  const runCliExpectFailure = (args) => {
    let thrownError;
    try {
      execFileSync('node', [scriptPath, ...args], {
        cwd: rootDir,
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError).toBeDefined();
    return `${thrownError.stdout}${thrownError.stderr}`;
  };

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'package-surface-'));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  test('missing --unpacked-dir 應失敗', () => {
    const output = runCliExpectFailure([]);

    expect(output).toContain('必須提供 --unpacked-dir');
  });

  test('missing unpacked directory 應失敗', () => {
    const missingDir = path.join(tempRoot, 'missing-package');

    const output = runCliExpectFailure([`--unpacked-dir=${missingDir}`]);

    expect(output).toContain('找不到 unpacked extension package');
    expect(output).toContain(missingDir);
  });

  test('allowed package surface 應通過並輸出檔案數', () => {
    createAllowedPackage();

    const output = runCli();

    expect(output).toContain('Extension package surface 檢查通過');
    expect(output).toContain('已檢查 9 個檔案');
  });

  test.each([
    ['scripts/content/index.js', 'raw scripts source'],
    ['tests/unit/example.test.js', 'tests output'],
    ['docs/plans/example.md', 'docs output'],
    ['.agents/skills/example/SKILL.md', 'agent metadata'],
    ['.github/workflows/ci.yml', 'github metadata'],
    ['coverage/lcov.info', 'coverage output'],
    ['dist/content.bundle.js.map', 'source map'],
    ['dist/content-bundle-analysis.html', 'bundle analysis report'],
    ['dist/rollup-visualizer.html', 'visualizer report'],
    ['pages/options/package.json', 'nested page package marker'],
  ])('forbidden package surface: %s', (relativePath, expectedRule) => {
    createAllowedPackage();
    writeFile(relativePath, 'forbidden\n');

    const output = runCliExpectFailure([`--unpacked-dir=${tempRoot}`]);

    expect(output).toContain('Extension package surface 檢查失敗');
    expect(output).toContain(relativePath);
    expect(output).toContain(expectedRule);
  });
});
