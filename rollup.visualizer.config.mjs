import path from 'node:path';
import { visualizer } from 'rollup-plugin-visualizer';

const ANALYSIS_ENABLED = process.env.ANALYZE_BUNDLE === 'true';

export function createVisualizerPlugin(reportName, title) {
  if (!ANALYSIS_ENABLED) {
    return null;
  }

  return visualizer({
    filename: path.resolve('.tmp/bundle-analysis', `${reportName}.html`),
    title,
    gzipSize: true,
    brotliSize: true,
    open: false,
  });
}
