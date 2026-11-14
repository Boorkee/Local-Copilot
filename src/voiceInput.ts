import { ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

export type VoiceEvent = { type: 'voice'; state?: string; text?: string; level?: number };

/** A single, opt-in local Windows recognizer. No audio leaves this computer. */
export class VoiceInput {
    private process?: ChildProcessWithoutNullStreams;
    private timeout?: NodeJS.Timeout;
    constructor(private readonly script: string, private readonly emit: (event: VoiceEvent) => void) {}

    start(): void {
        if (this.process) return;
        if (process.platform !== 'win32') {
            this.emit({ type: 'voice', state: 'error', text: 'Local dictation currently requires Windows desktop VS Code. You can still type here or use your system dictation.' });
            return;
        }
        this.emit({ type: 'voice', state: 'starting' });
        let command: string;
        try { command = Buffer.from(readFileSync(this.script, 'utf8'), 'utf16le').toString('base64'); }
        catch {
            this.emit({ type: 'voice', state: 'error', text: 'The local speech helper is missing. Reinstall the extension and retry.' });
            return;
        }
        const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', command], { windowsHide: true });
        this.process = child;
        let listening = false;
        const lines = createInterface({ input: child.stdout });
        lines.on('line', line => {
            if (this.process !== child || line.length > 16000) return;
            try {
                const event = JSON.parse(line);
                if (event.type === 'level' && listening && typeof event.level === 'number') {
                    this.emit({ type: 'voice', level: Math.max(0, Math.min(1, event.level)) });
                } else if (event.type === 'transcript' && listening && typeof event.text === 'string') {
                    this.emit({ type: 'voice', state: 'transcript', text: event.text });
                } else if (event.type === 'listening') {
                    listening = true;
                    clearTimeout(this.timeout);
                    this.timeout = setTimeout(() => this.stop('Recording stopped after two minutes. Review your draft or start again.'), 120000);
                    this.emit({ type: 'voice', state: 'listening' });
                } else if (event.type === 'error') {
                    this.stop();
                    this.emit({ type: 'voice', state: 'error', text: String(event.text) });
                } else if (event.type === 'hint') {
                    this.emit({ type: 'voice', state: 'hint', text: String(event.text) });
                }
            } catch { /* Ignore PowerShell diagnostics; never interpret them as a transcript. */ }
        });
        // Drain diagnostics without exposing device or host details in the UI.
        child.stderr.resume();
        child.stdin.on('error', () => {});
        const failed = () => {
            lines.close();
            if (this.process !== child) return;
            this.stop();
            this.emit({ type: 'voice', state: 'error', text: 'Windows dictation could not continue. Check microphone permissions and installed speech language packs, then retry.' });
        };
        child.on('error', failed);
        child.on('exit', failed);
        this.timeout = setTimeout(() => {
            this.stop();
            this.emit({ type: 'voice', state: 'error', text: 'Microphone startup timed out. Check Windows speech and microphone settings.' });
        }, 15000);
    }

    stop(text?: string): void {
        clearTimeout(this.timeout);
        const child = this.process;
        this.process = undefined;
        if (child) {
            child.stdin.end('\n');
            const kill = setTimeout(() => child.kill(), 1500);
            kill.unref();
            child.once('exit', () => clearTimeout(kill));
        }
        this.emit({ type: 'voice', state: 'idle', text });
    }
    dispose(): void { this.stop(); }
}
