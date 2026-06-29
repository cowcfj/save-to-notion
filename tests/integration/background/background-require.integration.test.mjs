/**
 * @jest-environment node
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../..');

const readRootJson = relativePath =>
  JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), 'utf8'));

describe('background module boundary contract', () => {
  test('manifest declares the packaged background service worker as an ES module', () => {
    const manifest = readRootJson('manifest.json');

    expect(manifest.background).toEqual(
      expect.objectContaining({
        service_worker: 'dist/scripts/background.js',
        type: 'module',
      })
    );
  });

  test('raw CommonJS require does not own the source background lifecycle', () => {
    const result = spawnSync(
      process.execPath,
      [
        '-e',
        [
          'try {',
          "  require('./scripts/background.js');",
          "  console.error('unexpected CommonJS background load');",
          '  process.exit(1);',
          '} catch (error) {',
          '  const output = `${error.code || error.name}: ${error.message}`;',
          '  console.error(output);',
          '  process.exit(/ERR_REQUIRE_ESM|SyntaxError|Cannot use import statement outside a module/.test(output) ? 0 : 1);',
          '}',
        ].join('\n'),
      ],
      {
        cwd: rootDir,
        encoding: 'utf8',
      }
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toMatch(
      /ERR_REQUIRE_ESM|SyntaxError|Cannot use import statement outside a module/
    );
  });
});
