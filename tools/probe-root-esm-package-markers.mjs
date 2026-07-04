#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import { main } from './probe-root-esm-package-markers-core.mjs';

export {
  applyCutoverTransforms,
  assertSafeProbeRoot,
  buildProbeSummary,
  discoverPackageMarkers,
  formatMarkdownSummary,
  groupMarkersByScope,
  hashDirectoryTree,
  runProbe,
} from './probe-root-esm-package-markers-core.mjs';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
