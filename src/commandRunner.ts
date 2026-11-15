import { spawn } from 'node:child_process';

/** Runs only after the host has obtained approval for this exact command and cwd. */
export function runCommand(command: string, cwd: string, signal: AbortSignal, onOutput: (text: string) => void): Promise<string> {
    if (signal.aborted) return Promise.reject(new Error('Task stopped.'));
    return new Promise((resolve, reject) => {
        const windows = process.platform === 'win32';
        const child = spawn(windows ? 'powershell.exe' : '/bin/sh', windows
            ? ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command]
            : ['-c', command], { cwd, windowsHide: true, detached: !windows, stdio: ['ignore', 'pipe', 'pipe'] });
        let output = '';
        let stopped = '';
        let finished = false;
        const terminate = () => {
            if (child.pid === undefined || finished) return;
            if (windows) {
                const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
                killer.on('error', () => child.kill());
            } else {
                try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
            }
        };
        const stop = () => { stopped = 'Command cancelled.'; terminate(); };
        const timeout = setTimeout(() => { stopped = 'Command exceeded the 120-second limit.'; terminate(); }, 120000);
        signal.addEventListener('abort', stop, { once: true });
        const append = (chunk: Buffer) => {
            const remaining = 64000 - output.length;
            if (remaining <= 0) return;
            const text = chunk.toString().slice(0, remaining);
            output += text;
            onOutput(text);
        };
        child.stdout.on('data', append);
        child.stderr.on('data', append);
        const cleanup = () => { finished = true; clearTimeout(timeout); signal.removeEventListener('abort', stop); };
        child.on('error', error => { cleanup(); reject(error); });
        child.on('close', code => {
            cleanup();
            resolve(`${stopped || `Exit code: ${code}`}\n${output}${output.length >= 64000 ? '\n[output truncated]' : ''}`);
        });
    });
}
