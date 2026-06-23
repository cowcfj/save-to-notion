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

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'native-esm-line-hits-'));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  test('[SECURITY] repo 外 coverage path 應被拒絕', () => {
    const externalCoveragePath = path.join(tempRoot, 'coverage-final.json');
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    fs.writeFileSync(externalCoveragePath, JSON.stringify(createPassingCoverage()), 'utf8');

    const result = runCli(externalCoveragePath);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Coverage path must stay under coverage/native-esm');
    expect(result.stdout).not.toContain('native-esm-line-hits:ok');
  });
});
