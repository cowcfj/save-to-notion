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

describe('tools/audit-page-shared-chunks.mjs', () => {
  const scriptPath = path.resolve(rootDir, 'tools/audit-page-shared-chunks.mjs');
  let tempRoot;
  let distPagesDir;

  const writePageFile = (relativePath, contents = '') => {
    const filePath = path.join(distPagesDir, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents, 'utf8');
    return filePath;
  };

  const runCliWithArgs = args =>
    execFileSync('node', [scriptPath, ...args], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: 'pipe',
    });

  const runCli = () => runCliWithArgs([`--dist-pages-dir=${distPagesDir}`]);

  const runCliExpectFailure = (args = [`--dist-pages-dir=${distPagesDir}`]) => {
    let thrownError;
    try {
      runCliWithArgs(args);
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError).toBeDefined();
    return `${thrownError.stdout}${thrownError.stderr}`;
  };

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'page-shared-chunks-'));
    distPagesDir = path.join(tempRoot, 'dist/pages');
    fs.mkdirSync(path.join(distPagesDir, 'shared'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  test.each([
    ['flag at end', ['--dist-pages-dir']],
    ['next token is another flag', ['--dist-pages-dir', '--unknown']],
  ])('missing --dist-pages-dir value 應直接失敗：%s', (_caseName, args) => {
    const output = runCliExpectFailure(args);

    expect(output).toContain('必須提供 --dist-pages-dir 的值');
  });

  test('prints entry shared import map and warning-only popup ProfileManager dependency', () => {
    writePageFile('auth.js', "import './shared/accountLogin.js';\n");
    writePageFile('update-notification.js', 'console.log("update");\n');
    writePageFile('onboarding.js', "import './shared/backgroundMessages.js';\n");
    writePageFile(
      'popup.js',
      'import{B}from"./shared/backgroundMessages.js";import{P}from"./shared/ProfileManager.js";\n'
    );

    const output = runCli();

    expect(output).toContain('auth.js -> ./shared/accountLogin.js');
    expect(output).toContain('update-notification.js -> (none)');
    expect(output).toContain('popup.js -> ./shared/backgroundMessages.js, ./shared/ProfileManager.js');
    expect(output).toContain('[WARN] popup.js imports ./shared/ProfileManager.js');
    expect(output).toContain('Page shared chunk audit completed');
  });

  test('ignores from-like text outside static import or export statements', () => {
    writePageFile(
      'auth.js',
      [
        "// from './shared/ProfileManager.js'",
        'const message = "from \'./shared/ProfileManager.js\'";',
      ].join('\n')
    );

    const output = runCli();

    expect(output).toContain('auth.js -> (none)');
    expect(output).toContain('Page shared chunk audit completed');
  });

  test.each([
    ['auth.js', "import './shared/ProfileManager.js';\n", 'auth.js must not import ./shared/ProfileManager.js'],
    [
      'update-notification.js',
      "import './shared/backgroundMessages.js';\n",
      'update-notification.js must not import shared chunks',
    ],
    [
      'onboarding.js',
      "import './shared/ProfileManager.js';\n",
      'onboarding.js must not import ./shared/ProfileManager.js',
    ],
    ['auth.js', 'const label = "保存目標名稱";\n', 'auth.js contains options-only sentinel'],
    ['auth.js', 'const label = "雲端備份：";\n', 'auth.js contains options-only sentinel'],
  ])('critical violation: %s', (entryFile, contents, expectedMessage) => {
    writePageFile(entryFile, contents);

    const output = runCliExpectFailure();

    expect(output).toContain('Page shared chunk audit failed');
    expect(output).toContain(expectedMessage);
  });

  test('entry importing many shared chunks warns but does not fail', () => {
    writePageFile(
      'options.js',
      [
        "import './shared/messages.js';",
        "import './shared/backgroundMessages.js';",
        "import './shared/core.js';",
        "import './shared/ProfileManager.js';",
        "import './shared/storage.js';",
        "import './shared/accountLogin.js';",
      ].join('\n')
    );

    const output = runCli();

    expect(output).toContain('[WARN] options.js imports 6 shared chunks');
    expect(output).toContain('Page shared chunk audit completed');
  });
});
