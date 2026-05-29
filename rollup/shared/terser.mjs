import terser from '@rollup/plugin-terser';

export function createTerserPlugin({
  dropConsole = false,
  dropDebugger = true,
  passes,
  pureFuncs,
  mangleReserved,
} = {}) {
  const compress = { drop_debugger: dropDebugger };
  if (dropConsole) compress.drop_console = true;
  if (passes) compress.passes = passes;
  if (pureFuncs) compress.pure_funcs = pureFuncs;

  return terser({
    compress,
    ...(mangleReserved && { mangle: { reserved: mangleReserved } }),
    format: { comments: false },
  });
}
