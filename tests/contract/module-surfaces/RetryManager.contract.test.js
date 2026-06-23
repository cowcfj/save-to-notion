const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

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

  test('browser-style global fallback exposes RetryManager helpers', () => {
    const sourcePath = path.join(__dirname, '../../../scripts/utils/RetryManager.js');
    const source = fs.readFileSync(sourcePath, 'utf8');
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
