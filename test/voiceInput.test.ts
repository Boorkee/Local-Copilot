import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import childProcess = require('node:child_process');
import { describe, it, mock } from 'node:test';
import { VoiceEvent, VoiceInput } from '../src/voiceInput';

describe('local voice lifecycle', () => {
    it('handles transcripts, clamps levels, and ignores late events after stop', async () => {
        const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
        Object.defineProperty(process, 'platform', { value: 'win32' });
        const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: () => true });
        const spawn = mock.method(childProcess, 'spawn', () => child);
        const events: VoiceEvent[] = [];
        const voice = new VoiceInput('resources/speech.ps1', event => events.push(event));
        try {
            voice.start(); voice.start();
            assert.equal(spawn.mock.callCount(), 1);
            child.stdout.write('{"type":"listening"}\n{"type":"level","level":2}\n{"type":"transcript","text":"hello"}\n');
            assert.ok(events.some(e => e.state === 'listening'));
            assert.ok(events.some(e => e.level === 1));
            assert.ok(events.some(e => e.state === 'transcript' && e.text === 'hello'));
            voice.stop();
            const count = events.length;
            child.stdout.write('{"type":"transcript","text":"too late"}\n');
            assert.equal(events.length, count);
            child.emit('exit', 0);
            assert.equal(events.at(-1)?.state, 'idle');
        } finally {
            voice.dispose(); spawn.mock.restore(); Object.defineProperty(process, 'platform', platform);
        }
    });
    it('reports launch failure without leaving a recording active', () => {
        const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
        Object.defineProperty(process, 'platform', { value: 'win32' });
        const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: () => true });
        const spawn = mock.method(childProcess, 'spawn', () => child);
        const events: VoiceEvent[] = [];
        const voice = new VoiceInput('resources/speech.ps1', event => events.push(event));
        try {
            voice.start(); child.emit('error', new Error('ENOENT'));
            assert.equal(events.at(-1)?.state, 'error');
            assert.ok(events.some(e => e.state === 'idle'));
            child.emit('exit', 1);
        } finally { voice.dispose(); spawn.mock.restore(); Object.defineProperty(process, 'platform', platform); }
    });
    it('explains unsupported hosts without launching a recorder', () => {
        const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
        Object.defineProperty(process, 'platform', { value: 'linux' });
        const events: VoiceEvent[] = [];
        try {
            const voice = new VoiceInput('resources/speech.ps1', event => events.push(event));
            voice.start();
            assert.equal(events[0].state, 'error');
            assert.match(events[0].text!, /Windows/);
        } finally { Object.defineProperty(process, 'platform', platform); }
    });
});
