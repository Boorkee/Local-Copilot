// Run tests represented in source, even if a deleted test left a stale compiled file behind.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const directory = path.join(__dirname, '..', 'out-test', 'test');
const sourceDirectory = path.join(__dirname, '..', 'test');
const files = fs.readdirSync(sourceDirectory)
	.filter(name => name.endsWith('.test.ts'))
	.sort()
	.map(name => path.join(directory, name.replace(/\.ts$/, '.js')));

if (files.length === 0 || files.some(file => !fs.existsSync(file))) {
	console.error(`Missing compiled test files in ${directory}. Run the test TypeScript build first.`);
	process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(result.status ?? 1);
