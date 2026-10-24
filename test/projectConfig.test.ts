import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const readJson = (path: string): Record<string, unknown> => JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;

describe('extension project configuration', () => {
	it('declares the sidebar view, compiled entry point, and configurable Ollama settings', () => {
		const manifest = readJson('package.json');
		assert.equal(manifest.name, 'local-copilot');
		assert.equal(manifest.main, './out/extension.js');
		const contributes = manifest.contributes as {
			viewsContainers: { activitybar: Array<{ id: string }> };
			views: Record<string, Array<{ id: string }>>;
			configuration: { properties: Record<string, { default: unknown }> };
		};
		assert.ok(contributes.viewsContainers.activitybar.some(container => container.id === 'localCopilot'));
		assert.ok(contributes.views.localCopilot.some(view => view.id === 'localCopilot.chat'));
		assert.equal(contributes.configuration.properties['localCopilot.ollamaBaseUrl'].default, 'http://127.0.0.1:11434');
		assert.equal(contributes.configuration.properties['localCopilot.defaultModel'].default, 'qwen2.5-coder:7b');
		assert.equal(contributes.configuration.properties['localCopilot.requestTimeoutMs'].default, 300000);
	});

	it('provides a working compile and test script configuration', () => {
		const manifest = readJson('package.json');
		const scripts = manifest.scripts as Record<string, string>;
		assert.match(scripts.compile, /tsc -p/);
		assert.match(scripts.test, /npm run compile/);
		assert.match(scripts.test, /node --test/);
		assert.equal((readJson('tsconfig.json').compilerOptions as { outDir: string }).outDir, 'out');
		assert.equal((readJson('tsconfig.test.json').compilerOptions as { outDir: string }).outDir, 'out-test');
	});

	it('keeps the development launch task and extension entry point aligned', () => {
		const launch = readJson('.vscode/launch.json');
		const configs = launch.configurations as Array<{ preLaunchTask: string; outFiles: string[] }>;
		assert.ok(configs.some(config => config.preLaunchTask === 'npm: compile'
			&& config.outFiles.some(path => path.includes('out/**/*.js'))));
		const tasks = readJson('.vscode/tasks.json');
		assert.ok((tasks.tasks as Array<{ script: string }>).some(task => task.script === 'compile'));
	});

	it('ships a valid SVG activity-bar icon', () => {
		const svg = readFileSync('resources/copilot.svg', 'utf8');
		assert.match(svg, /^<svg\b/);
		assert.match(svg, /<\/svg>\s*$/);
		assert.match(svg, /viewBox=/);
	});
});
