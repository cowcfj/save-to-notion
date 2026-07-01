#!/usr/bin/env node

import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const core = require('./probe-root-esm-package-markers-core.cjs');

export const assertSafeProbeRoot = core.assertSafeProbeRoot;
export const buildProbeSummary = core.buildProbeSummary;
export const discoverPackageMarkers = core.discoverPackageMarkers;
export const formatMarkdownSummary = core.formatMarkdownSummary;
export const groupMarkersByScope = core.groupMarkersByScope;
export const hashDirectoryTree = core.hashDirectoryTree;
export const runProbe = core.runProbe;

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = core.main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
