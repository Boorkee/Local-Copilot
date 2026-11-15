import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BorderBeam } from 'border-beam';
import { ThinkingOrb } from 'thinking-orbs';
import { Liquid } from 'liquid-gooey';
import { VoiceBeam } from 'voice-glow';

declare global {
    interface Window {
        copilot: { post: (message: object) => void; busy: boolean; recording: boolean; status: string; };
    }
}
const composer = document.querySelector<HTMLElement>('.composer')!;
const prompt = document.querySelector<HTMLTextAreaElement>('#prompt')!;

function Effects() {
    const slot = useRef<HTMLDivElement>(null);
    const level = useRef(0);
    const getLevel = useCallback(() => level.current, []);
    const [busy, setBusy] = useState(window.copilot.busy);
    const [status, setStatus] = useState(window.copilot.status);
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
        send.disabled = busy || listening || starting || !prompt.value.trim();
        send.title = listening || starting ? 'Stop recording to review and send' : 'Send (Enter)';
    }, [listening, starting, busy]);
    useLayoutEffect(() => { slot.current?.append(composer); }, []);
    useEffect(() => {
        const update = () => { setBusy(window.copilot.busy); setStatus(window.copilot.status); };
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
        <div className="activity" aria-hidden="true">
            {busy ? <><ThinkingOrb state={orbState} size={20} theme={dark ? 'dark' : 'light'} paused={reduced || !visible}/><span>{status || 'Thinking…'}</span></> : <><span className="ready-dot"/><span>{listening ? 'Listening · local dictation' : 'Ready when you are'}</span></>}
        </div>
        <div className="mode-row">
            <div className="mode-switch" role="group" aria-label="Input mode">
                {!reduced && visible && <Liquid className="mode-liquid" fill="var(--vscode-button-background)" blur={5} contrast={20} aria-hidden="true">
                    <Liquid.Item x={mode === 'type' ? 0 : 76} effect="move" transition="smooth"><div className="mode-blob"/></Liquid.Item>
                </Liquid>}
                <button className={reduced ? 'mode plain' : 'mode'} aria-pressed={mode === 'type'} onClick={() => changeMode('type')}>Type</button>
                <button className={reduced ? 'mode plain' : 'mode'} aria-pressed={mode === 'speak'} onClick={() => changeMode('speak')}>Speak</button>
            </div>
            <span className="mode-caption">{mode === 'type' ? 'Your local workspace' : 'Review, then send'}</span>
        </div>
        {mode === 'speak' && <div className="voice-panel">
            <div className="voice-heading"><span>{listening ? 'Microphone on' : starting ? 'Connecting microphone' : 'Voice input'}</span>
                <button type="button" className="record" disabled={busy} onClick={() => {
                    if (listening || starting) window.copilot.post({ type: 'stopVoice' });
                    else { setVoice('starting'); setHint('Opening your microphone…'); window.copilot.post({ type: 'startVoice' }); }
                }}>{listening || starting ? 'Stop' : 'Start listening'}</button></div>
            <p role={voice === 'error' ? 'alert' : 'status'}>{hint}</p>
        </div>}
        <BorderBeam className="composer-beam" size="sm" colorVariant="ocean" strength={busy ? 0.7 : 0.4} active={visible && !reduced} theme={dark ? 'dark' : 'light'}>
            <VoiceBeam className="composer-voice" level={getLevel} colorVariant="ocean" active={listening && visible && !reduced} theme={dark ? 'dark' : 'light'} strength={0.7}>
                <div ref={slot} className="composer-slot"/>
            </VoiceBeam>
        </BorderBeam>
        <div className="input-hint">Enter to send <span>·</span> Shift + Enter for a new line</div>
    </>;
}
createRoot(document.getElementById('effects')!).render(<Effects/>);
