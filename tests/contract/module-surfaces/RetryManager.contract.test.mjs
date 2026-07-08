import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';

import { RetryManager, withRetry, fetchWithRetry } from '../../../scripts/utils/RetryManager.js';

const repoRoot = process.cwd();
const retryManagerSourcePath = path.resolve(repoRoot, 'scripts/utils/RetryManager.js');

describe('RetryManager module surface contracts', () => {
  test('ESM import exposes RetryManager helpers', () => {
    const exported = { RetryManager, withRetry, fetchWithRetry };

    expect(exported).toEqual(
      expect.objectContaining({
        RetryManager: expect.any(Function),
        withRetry: expect.any(Function),
        fetchWithRetry: expect.any(Function),
      })
    );
  });

  test('raw Node ESM import exposes RetryManager helpers without Jest transforms', () => {
    const result = spawnSync(
      process.execPath,
      [
        '-e',
        [
          '(async () => {',
          "  const exported = await import('./scripts/utils/RetryManager.js');",
          "  for (const key of ['RetryManager', 'withRetry', 'fetchWithRetry']) {",
          "    if (typeof exported[key] !== 'function') {",
          '      console.error(`${key}:${typeof exported[key]}`);',
          '      process.exit(1);',
          '    }',
          '  }',
          "  console.log('RetryManager raw ESM surface ok');",
          '})().catch(error => {',
          '  console.error(error);',
          '  process.exit(1);',
          '});',
        ].join('\n'),
      ],
      {
        cwd: repoRoot,
        encoding: 'utf8',
      }
    );

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('RetryManager raw ESM surface ok');
  });

  test('browser-style global fallback exposes RetryManager helpers', () => {
    const source = fs
      .readFileSync(retryManagerSourcePath, 'utf8')
      .replaceAll(/export\s+\{[\s\S]*?\};/g, ''); // 移除靜態 export 以防在 VM script 執行時報 SyntaxError
    const sandbox = {
      globalThis: {},
      setTimeout,
      clearTimeout,
      Date,
      Math,
      Promise,
      Error,
      TypeError,
      AbortError: globalThis.AbortError,
    };
    sandbox.globalThis = sandbox;
    vm.runInNewContext(source, sandbox, { filename: retryManagerSourcePath });

    expect(sandbox.RetryManager).toEqual(expect.any(Function));
    expect(sandbox.withRetry).toEqual(expect.any(Function));
    expect(sandbox.fetchWithRetry).toEqual(expect.any(Function));
  });
});
