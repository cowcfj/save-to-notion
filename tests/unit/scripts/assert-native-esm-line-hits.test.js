/**
 * @jest-environment node
 */
/* eslint-disable sonarjs/no-os-command-from-path */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

describe('tools/assert-native-esm-line-hits.mjs', () => {
  const projectRoot = path.resolve(__dirname, '../../..');
  const scriptPath = path.join(projectRoot, 'tools/assert-native-esm-line-hits.mjs');
  const allowedCoverageRoot = path.join(projectRoot, 'coverage/native-esm');
  let tempRoot;

  const createPassingCoverage = () => ({
    [path.join(projectRoot, 'scripts/background/utils/BlockBuilder.js')]: {
      statementMap: {
        0: {
          start: { line: 54 },
          end: { line: 57 },
        },
      },
      s: { 0: 1 },
    },
    [path.join(projectRoot, 'scripts/highlighter/autoInit/initializationInputs.js')]: {
      statementMap: {
        0: {
          start: { line: 38 },
          end: { line: 41 },
        },
      },
      s: { 0: 1 },
    },
  });

  const runCli = coveragePath =>
    spawnSync('node', [scriptPath, coveragePath], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

  const writeCoverageFile = coverage => {
    const coveragePath = path.join(tempRoot, 'coverage-final.json');
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    fs.writeFileSync(coveragePath, JSON.stringify(coverage), 'utf8');
    return coveragePath;
  };

  beforeEach(() => {
    fs.mkdirSync(allowedCoverageRoot, { recursive: true });
    tempRoot = fs.mkdtempSync(path.join(allowedCoverageRoot, 'line-hits-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  test('[SECURITY] repo 外 coverage path 應被拒絕', () => {
    const externalTempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'native-esm-line-hits-'));
    const externalCoveragePath = path.join(externalTempRoot, 'coverage-final.json');
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    fs.writeFileSync(externalCoveragePath, JSON.stringify(createPassingCoverage()), 'utf8');

    const result = runCli(externalCoveragePath);

    fs.rmSync(externalTempRoot, { recursive: true, force: true });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('覆蓋率檔案路徑必須位於 coverage/native-esm 底下');
    expect(result.stdout).not.toContain('Native ESM 行命中檢查通過');
  });

  test('缺少必要 source coverage entry 時輸出繁中錯誤', () => {
    const coveragePath = writeCoverageFile({
      [path.join(projectRoot, 'scripts/background/utils/BlockBuilder.js')]: {
        statementMap: {
          0: {
            start: { line: 54 },
            end: { line: 57 },
          },
        },
        s: { 0: 1 },
      },
    });

    const result = runCli(coveragePath);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      '找不到 scripts/highlighter/autoInit/initializationInputs.js 的覆蓋率資料'
    );
  });

  test('必要 line 未命中時輸出繁中失敗訊息', () => {
    const coverage = createPassingCoverage();
    coverage[path.join(projectRoot, 'scripts/background/utils/BlockBuilder.js')].s[0] = 0;
    const coveragePath = writeCoverageFile(coverage);

    const result = runCli(coveragePath);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'scripts/background/utils/BlockBuilder.js:54 預期命中次數 > 0，實際為 0'
    );
  });

  test('必要 line 都命中時輸出繁中成功訊息', () => {
    const coveragePath = writeCoverageFile(createPassingCoverage());

    const result = runCli(coveragePath);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Native ESM 行命中檢查通過');
  });
});
