/**
 * @jest-environment node
 */
/* eslint-disable sonarjs/no-os-command-from-path */
/* eslint-disable security/detect-non-literal-fs-filename */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

describe('tools/inject-manifest-key.mjs', () => {
  const scriptPath = path.resolve(__dirname, '../../../tools/inject-manifest-key.mjs');
  let tempRoot;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'inject-manifest-key-'));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  test('找不到 key file 時應原樣複製 manifest', () => {
    const sourcePath = path.join(tempRoot, 'manifest.json');
    const targetPath = path.join(tempRoot, 'out/manifest.json');
    const manifest = {
      manifest_version: 3,
      name: 'Test Extension',
      version: '1.0.0',
    };
    fs.writeFileSync(sourcePath, JSON.stringify(manifest, null, 2));

    execFileSync(
      'node',
      [
        scriptPath,
        `--source=${sourcePath}`,
        `--target=${targetPath}`,
        `--key-file=${path.join(tempRoot, 'missing-public-key.txt')}`,
      ],
      { cwd: path.resolve(__dirname, '../../..') }
    );

    expect(JSON.parse(fs.readFileSync(targetPath, 'utf8'))).toEqual(manifest);
  });

  test('存在 key file 時應注入 manifest key', () => {
    const sourcePath = path.join(tempRoot, 'manifest.json');
    const targetPath = path.join(tempRoot, 'out/manifest.json');
    const keyPath = path.join(tempRoot, 'dev-extension-public-key.txt');
    fs.writeFileSync(
      sourcePath,
      JSON.stringify(
        {
          manifest_version: 3,
          name: 'Test Extension',
          version: '1.0.0',
        },
        null,
        2
      )
    );
    fs.writeFileSync(keyPath, 'PUBLIC_KEY_VALUE\n');

    execFileSync(
      'node',
      [scriptPath, `--source=${sourcePath}`, `--target=${targetPath}`, `--key-file=${keyPath}`],
      { cwd: path.resolve(__dirname, '../../..') }
    );

    expect(JSON.parse(fs.readFileSync(targetPath, 'utf8'))).toEqual(
      expect.objectContaining({
        key: 'PUBLIC_KEY_VALUE',
      })
    );
  });
});
