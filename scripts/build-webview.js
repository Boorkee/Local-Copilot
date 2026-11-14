const esbuild = require('esbuild');
const options = { entryPoints: ['webview/effects.tsx'], bundle: true, outfile: 'out/effects.js', format: 'iife', platform: 'browser', target: 'chrome120', minify: true, legalComments: 'eof', define: { 'process.env.NODE_ENV': '"production"' } };
if (process.argv.includes('--watch')) esbuild.context(options).then(context => context.watch());
else esbuild.build(options).catch(() => process.exit(1));
