import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';

describe('RetryManager module surface contracts', () => {
  test('CommonJS require exposes RetryManager helpers', () => {
    const exported = require('../../../scripts/utils/RetryManager.js');

    expect(exported).toEqual(
      expect.objectContaining({
        RetryManager: expect.any(Function),
        withRetry: expect.any(Function),
        fetchWithRetry: expect.any(Function),
      })
    );
  });

  test('raw Node CommonJS require exposes RetryManager helpers without Jest transforms', () => {
    const result = spawnSync(
      process.execPath,
      [
        '-e',
        [
          "const exported = require('./scripts/utils/RetryManager.js');",
          "for (const key of ['RetryManager', 'withRetry', 'fetchWithRetry']) {",
          "  if (typeof exported[key] !== 'function') {",
          '    console.error(`${key}:${typeof exported[key]}`);',
          '    process.exit(1);',
          '  }',
          '}',
          "console.log('RetryManager raw CommonJS surface ok');",
        ].join('\n'),
      ],
      {
        cwd: path.resolve(__dirname, '../..', '..'),
        encoding: 'utf8',
      }
    );

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('RetryManager raw CommonJS surface ok');
  });

  test('browser-style global fallback exposes RetryManager helpers', () => {
    const sourcePath = path.join(__dirname, '../../../scripts/utils/RetryManager.js');
    const source = fs.readFileSync(sourcePath, 'utf8').replaceAll(/export\s+\{[\s\S]*?\};/g, ''); // 移除靜態 export 以防在 VM script 執行時報 SyntaxError
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

    // eslint-disable-next-line sonarjs/code-eval -- Intentional VM execution of trusted local source for browser-global contract testing.
    vm.runInNewContext(source, sandbox, { filename: sourcePath });

    expect(sandbox.RetryManager).toEqual(expect.any(Function));
    expect(sandbox.withRetry).toEqual(expect.any(Function));
    expect(sandbox.fetchWithRetry).toEqual(expect.any(Function));
  });
});
