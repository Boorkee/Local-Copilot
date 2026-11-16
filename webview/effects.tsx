import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { BorderBeam } from 'border-beam';
import { ThinkingOrb } from 'thinking-orbs';
import { Liquid } from 'liquid-gooey';
import { VoiceBeam } from 'voice-glow';
import type { ReviewCard } from '../src/reviewQueue';
import { MessageFeed } from './MessageFeed';

declare global {
    interface Window {
        copilot: { post: (message: object) => void; busy: boolean; recording: boolean; status: string; connection: string; connectionError: string; review: ReviewCard | null; commandOutput: string; };
    }
}
const composer = document.querySelector<HTMLElement>('.composer')!;
const prompt = document.querySelector<HTMLTextAreaElement>('#prompt')!;
const pickerAccent = document.querySelector<HTMLElement>('.popover-goo')!;

function Effects() {
    const slot = useRef<HTMLDivElement>(null);
    const level = useRef(0);
    const getLevel = useCallback(() => level.current, []);
    const [busy, setBusy] = useState(window.copilot.busy);
    const [status, setStatus] = useState(window.copilot.status);
    const [connection, setConnection] = useState(window.copilot.connection);
    const [connectionError, setConnectionError] = useState(window.copilot.connectionError);
    const [review, setReview] = useState(window.copilot.review);
    const [output, setOutput] = useState(window.copilot.commandOutput);
    const [mode, setMode] = useState<'type' | 'speak'>('type');
    const [voice, setVoice] = useState('idle');
    const [hint, setHint] = useState('Uses your default microphone. Speech stays on this Windows PC.');
    const [visible, setVisible] = useState(!document.hidden);
    const [reduced, setReduced] = useState(matchMedia('(prefers-reduced-motion: reduce)').matches);
    const [dark, setDark] = useState(!document.body.classList.contains('vscode-light'));
    const listening = voice === 'listening';
    const starting = voice === 'starting';
    useEffect(() => {
        window.copilot.recording = listening || starting;
        const send = document.querySelector<HTMLButtonElement>('#send')!;
        send.disabled = window.copilot.connection !== 'ready' || Boolean(review) || busy || listening || starting || !prompt.value.trim();
        send.title = listening || starting ? 'Stop recording to review and send' : 'Send (Enter)';
    }, [listening, starting, busy, connection, review]);
    useLayoutEffect(() => { slot.current?.append(composer); }, []);
    useEffect(() => {
        const update = () => { setBusy(window.copilot.busy); setStatus(window.copilot.status); setConnection(window.copilot.connection); setConnectionError(window.copilot.connectionError); setReview(window.copilot.review); setOutput(window.copilot.commandOutput); };
        const onVisibility = () => {
            setVisible(!document.hidden);
            if (document.hidden) window.copilot.post({ type: 'stopVoice' });
        };
        const onVoice = (event: MessageEvent) => {
            const message = event.data;
            if (message.type !== 'voice') return;
            if (typeof message.level === 'number') { level.current = message.level; return; }
            if (message.state === 'transcript') {
                prompt.value += (prompt.value && !/\s$/.test(prompt.value) ? ' ' : '') + message.text;
                prompt.dispatchEvent(new Event('input'));
                setHint('Added to your draft. Keep speaking, or stop to review.');
                return;
            }
            if (message.state === 'hint') { setHint(message.text); return; }
            level.current = 0;
            setVoice(message.state);
            setHint(message.text || (message.state === 'listening' ? 'Listening on your default microphone…' : message.state === 'starting' ? 'Opening your microphone…' : 'Microphone off. Review your draft before sending.'));
        };
        const media = matchMedia('(prefers-reduced-motion: reduce)');
        const motion = () => setReduced(media.matches);
        const theme = new MutationObserver(() => setDark(!document.body.classList.contains('vscode-light')));
        theme.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        window.addEventListener('copilot-state', update);
        window.addEventListener('message', onVoice);
        document.addEventListener('visibilitychange', onVisibility);
        media.addEventListener('change', motion);
        window.copilot.post({ type: 'ready' });
        return () => {
            theme.disconnect();
            window.removeEventListener('copilot-state', update);
            window.removeEventListener('message', onVoice);
            document.removeEventListener('visibilitychange', onVisibility);
            media.removeEventListener('change', motion);
            window.copilot.post({ type: 'stopVoice' });
        };
    }, []);
    function changeMode(next: 'type' | 'speak') {
        setMode(next);
        if (next === 'type') { window.copilot.post({ type: 'stopVoice' }); prompt.focus(); }
    }
    const orbState = /load|connect|switch/i.test(status) ? 'connecting' : /code|writ|tool|read/i.test(status) ? 'working' : 'solving';
    return <>
        {!reduced && visible && createPortal(<Liquid className="picker-liquid" fill="var(--vscode-textLink-foreground)" blur={4} contrast={16} aria-hidden="true">
            <Liquid.Item effect="move" radius={9}><span className="picker-blob"/></Liquid.Item>
        </Liquid>, pickerAccent)}
        <MessageFeed />
        <div className="activity">
            {busy ? <><ThinkingOrb state={orbState} size={20} theme={dark ? 'dark' : 'light'} paused={reduced || !visible}/><span>{status || 'Thinking…'}</span></> : <><span className="ready-dot"/><span>{listening ? 'Listening · local dictation' : connection === 'ready' ? 'Ready when you are' : connection === 'loading' ? 'Connecting to Ollama…' : 'Ollama unavailable'}</span></>}
            {busy && <button className="record" onClick={() => window.copilot.post({ type: 'stopTask' })}>Stop task</button>}
        </div>
        {(connection === 'error' || connection === 'empty') && <div className="connection-panel" role="alert">
            <strong>{connection === 'empty' ? 'No models installed' : 'Cannot connect to Ollama'}</strong>
            <p>{connectionError}</p>
            <button className="record" onClick={() => window.copilot.post({ type: 'refreshModels' })}>Retry connection</button>
            <button className="record" onClick={() => window.copilot.post({ type: 'openSettings' })}>Connection settings</button>
        </div>}
        <div className="mode-row">
            <div className="mode-switch" role="group" aria-label="Input mode">
                {!reduced && visible && <Liquid className="mode-liquid" fill="var(--vscode-button-background)" blur={5} contrast={20} aria-hidden="true">
                    <Liquid.Item effect="move" radius={16}><div className="mode-blob" style={{ transform: `translateX(${mode === 'type' ? 0 : 76}px)` }}/></Liquid.Item>
                </Liquid>}
                <button className={reduced ? 'mode plain' : 'mode'} aria-pressed={mode === 'type'} onClick={() => changeMode('type')}>Type</button>
                <button className={reduced ? 'mode plain' : 'mode'} aria-pressed={mode === 'speak'} onClick={() => changeMode('speak')}>Speak</button>
            </div>
            <span className="mode-caption">{mode === 'type' ? 'Your local workspace' : 'Review, then send'}</span>
        </div>
        <div className={`voice-reveal ${mode === 'speak' ? 'open' : ''}`} aria-hidden={mode !== 'speak'}>
          <div className="voice-panel">
            <div className="voice-heading"><span>{listening ? 'Microphone on' : starting ? 'Connecting microphone' : 'Voice input'}</span>
                <button type="button" className="record" disabled={busy} onClick={() => {
                    if (listening || starting) window.copilot.post({ type: 'stopVoice' });
                    else { setVoice('starting'); setHint('Opening your microphone…'); window.copilot.post({ type: 'startVoice' }); }
                }}>{listening || starting ? 'Stop' : 'Start listening'}</button></div>
            <p role={voice === 'error' ? 'alert' : 'status'}>{hint}</p>
            {mode === 'speak' && !reduced && visible && <Liquid className="voice-goo" fill="var(--vscode-textLink-foreground)" blur={4} contrast={13} aria-hidden="true">
                <Liquid.Item effect="move" radius={12}><span className="voice-goo-blob"/></Liquid.Item>
            </Liquid>}
          </div>
        </div>
        {output && <details className="command-output"><summary>Command output</summary><pre>{output}</pre></details>}
        {review && <section className="review-panel" aria-label="Agent approval" role="region" key={review.id}>
            <div className="review-title"><strong>{review.kind === 'command' ? 'Run command?' : review.kind === 'delete' ? 'Delete file?' : 'Review file change'}</strong>
                {review.kind !== 'command' && <span><b className="added">+{review.added}</b> <b className="removed">−{review.removed}</b></span>}</div>
            <pre className="review-path">{review.title}</pre>
            {review.detail && <p>{review.detail}</p>}
            {review.lines && <div className="inline-diff" tabIndex={0} aria-label="Proposed changes">{review.lines.map((line, i) => <div key={i} className={`diff-${line.kind}`}><span aria-hidden="true">{line.kind === 'add' ? '+' : line.kind === 'remove' ? '−' : ' '}</span>{line.text || ' '}</div>)}</div>}
            <div className="review-actions">
                {review.kind !== 'command' && <button className="record" onClick={() => window.copilot.post({ type: 'openDiff', id: review.id })}>Open full diff</button>}
                <button className="approve" onClick={() => window.copilot.post({ type: 'reviewDecision', id: review.id, approved: true })}>{review.kind === 'command' ? 'Run command' : review.kind === 'delete' ? 'Delete' : 'Keep'}</button>
                <button className="record" onClick={() => window.copilot.post({ type: 'reviewDecision', id: review.id, approved: false })}>{review.kind === 'command' ? 'Reject' : 'Revert'}</button>
            </div>
            {review.kind !== 'command' && <p className="review-note">Proposed change · nothing is written until you keep it.</p>}
        </section>}
        <BorderBeam className="composer-beam" borderRadius={12} glowSize={0.6} size="sm" colorVariant="ocean" strength={busy ? 0.7 : 0.4} active={visible && !reduced} theme={dark ? 'dark' : 'light'}>
            <VoiceBeam className="composer-voice" level={getLevel} colorVariant="ocean" active={listening && visible && !reduced} theme={dark ? 'dark' : 'light'} strength={0.7}>
                <div ref={slot} className="composer-slot"/>
            </VoiceBeam>
        </BorderBeam>
    </>;
}
createRoot(document.getElementById('effects')!).render(<Effects/>);
