const esbuild = require('esbuild');
const options = { entryPoints: ['webview/effects.tsx'], bundle: true, outfile: 'out/effects.js', format: 'iife', platform: 'browser', target: 'chrome120', minify: true, legalComments: 'eof', define: { 'process.env.NODE_ENV': '"production"' } };
const host = { entryPoints: ['src/extension.ts'], bundle: true, outfile: 'out/extension.js', platform: 'node', format: 'cjs', target: 'node20', external: ['vscode'], legalComments: 'eof' };
if (process.argv.includes('--watch')) esbuild.context(options).then(context => context.watch());
else Promise.all([esbuild.build(options), esbuild.build(host)]).catch(() => process.exit(1));
