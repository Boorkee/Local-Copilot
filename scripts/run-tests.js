// Runs every compiled test file. Node 20 cannot expand globs in `node --test`, so the files are listed here.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const directory = path.join(__dirname, '..', 'out-test', 'test');
const files = fs.existsSync(directory)
	? fs.readdirSync(directory).filter(name => name.endsWith('.test.js')).sort().map(name => path.join(directory, name))
	: [];

if (files.length === 0) {
	console.error(`No compiled test files found in ${directory}.`);
	process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(result.status ?? 1);
