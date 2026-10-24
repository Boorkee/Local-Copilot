import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseHandoffArgs } from '../src/cli/args';

describe('parseHandoffArgs', () => {
	it('parses options and joins the task words', () => {
		const args = parseHandoffArgs([
			'--workspace', 'C:/proj', '--chat-model', 'chat:7b', '--code-model', 'code:14b',
			'--url', 'http://host:1', '--timeout-ms', '5000', '--allow-delete', 'add', 'tests'
		]);

		assert.deepEqual(args, {
			task: 'add tests',
			workspace: 'C:/proj',
			chatModel: 'chat:7b',
			codeModel: 'code:14b',
			url: 'http://host:1',
			timeoutMs: 5000,
			allowDelete: true
		});
	});

	it('uses safe defaults, including denying deletes', () => {
		const args = parseHandoffArgs(['do it']);

		assert.equal(args.allowDelete, false);
		assert.equal(args.url, 'http://127.0.0.1:11434');
	});

	it('rejects a missing task, unknown options, missing values, and bad timeouts', () => {
		assert.throws(() => parseHandoffArgs([]), /task description is required/);
		assert.throws(() => parseHandoffArgs(['--nope', 'x']), /Unknown option/);
		assert.throws(() => parseHandoffArgs(['task', '--chat-model']), /requires a value/);
		assert.throws(() => parseHandoffArgs(['task', '--timeout-ms', '5']), /at least 1000/);
	});
});
