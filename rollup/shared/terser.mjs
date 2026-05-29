import terser from '@rollup/plugin-terser';

export function createTerserPlugin({
  dropConsole = false,
  dropDebugger = true,
  passes,
  pureFuncs,
  mangleReserved,
  mangleAll = false,
} = {}) {
  const compress = { drop_debugger: dropDebugger };
  if (dropConsole) compress.drop_console = true;
  if (passes) compress.passes = passes;
  if (pureFuncs) compress.pure_funcs = pureFuncs;

  let mangle;
  if (mangleAll) {
    mangle = true;
  } else if (mangleReserved) {
    mangle = { reserved: mangleReserved };
  }

  return terser({
    compress,
    ...(mangle !== undefined && { mangle }),
    format: { comments: false },
  });
}
