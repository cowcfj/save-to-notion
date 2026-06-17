/* eslint-disable security/detect-non-literal-fs-filename */
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '../../..');
const activeWorkflowDir = path.join(rootDir, '.github/workflows');
const archivedSonarWorkflow = path.join(rootDir, '.archive/github-workflows/sonarcloud.yml');
const activeSonarWorkflow = path.join(activeWorkflowDir, 'sonarcloud.yml');

function readWorkflow(relativePath) {
  return fs.readFileSync(path.join(activeWorkflowDir, relativePath), 'utf8');
}

function listActiveWorkflowFiles() {
  return fs
    .readdirSync(activeWorkflowDir)
    .filter(fileName => fs.statSync(path.join(activeWorkflowDir, fileName)).isFile());
}

describe('workflow policy contract', () => {
  test('SonarCloud GitHub Action stays archived outside the active workflow directory', () => {
    expect(fs.existsSync(activeSonarWorkflow)).toBe(false);
    expect(fs.existsSync(archivedSonarWorkflow)).toBe(true);

    const activeSonarArchives = listActiveWorkflowFiles().filter(fileName =>
      fileName.toLowerCase().startsWith('sonarcloud')
    );

    expect(activeSonarArchives).toEqual([]);
  });

  test('active workflows do not treat the archived SonarCloud workflow as a CI trigger', () => {
    const activeWorkflowSources = ['ci.yml', 'coverage-gate.yml']
      .map(relativePath => readWorkflow(relativePath))
      .join('\n');

    expect(activeWorkflowSources).not.toContain('.github/workflows/sonarcloud.yml');
    expect(activeWorkflowSources).not.toContain('SonarCloud Scan');
  });
});
