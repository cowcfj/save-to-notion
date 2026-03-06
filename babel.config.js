module.exports = {
    sourceType: 'unambiguous',
    ignore: [
        /[\\/]core-js/,
        /@babel[\\/]runtime/
    ],
    presets: [
        ['@babel/preset-env', { targets: { node: 'current' }, modules: 'commonjs' }]
    ],
};
