import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { isValidElement } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Chat, TranscriptEntry } from '../src/chatStore';
import type { HostEvent } from '../src/protocol';

type Step = NonNullable<TranscriptEntry['steps']>[number];
type LiveTask = { taskId: string; sessionId: string; content: string; steps: Step[]; model?: TranscriptEntry['model'] };

const destination = document.getElementById('messages')!;

function safeUrl(url: string): string {
    if (/^https?:\/\/[^\s]+$/i.test(url)) return url;
    if (/^(?!\/|\\|\.|#)[\w\-./]+(?:#L\d+)?$/.test(url) && !url.includes('..')) return url;
    return '';
}

function openLink(url: string) {
    if (/^https?:\/\//i.test(url)) {
        window.copilot.post({ type: 'openExternal', url });
    } else {
        const match = /^([^#]+)(?:#L(\d+))?$/.exec(url);
        if (match) window.copilot.post({ type: 'openLocation', path: match[1], line: match[2] ? Number(match[2]) : undefined });
    }
}

function CodeBlock({ children }: { children: ReactNode }) {
    const child = isValidElement<{ className?: string; children?: ReactNode }>(children) ? children : undefined;
    const code = String(child?.props.children ?? '');
    const language = child?.props.className?.replace(/^language-/, '') || '';
    return <div className="codeblock">
        <div className="codehead"><span className="lang">{language}</span>
            <button className="link" onClick={() => window.copilot.post({ type: 'copyCode', code })}>Copy</button>
            <button className="link" title="Review applying code in the active editor" onClick={() => window.copilot.post({ type: 'applyCode', code })}>Apply</button>
        </div>
        <pre><code>{code}</code></pre>
    </div>;
}

function BasicMarkdown({ content }: { content: string }) {
    return <div className="markdown"><Markdown remarkPlugins={[remarkGfm]} skipHtml urlTransform={safeUrl} components={{
        img: () => null, // No passive network requests from model-generated image URLs.
        pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
        a: ({ href, children }) => href && safeUrl(href)
            ? <a href={href} onClick={event => { event.preventDefault(); openLink(href); }}>{children}</a>
            : <span>{children}</span>
    }}>{content}</Markdown></div>;
}

function ToolSteps({ steps }: { steps: Step[] }) {
    if (!steps.length) return null;
    return <details className="task-steps" open={steps.some(step => step.status === 'started')}>
        <summary>Agent activity · {steps.length} step{steps.length === 1 ? '' : 's'}</summary>
        <ol>{steps.map(step => <li key={step.id} className={`step-${step.status}`}>
            <span>{step.summary}</span><span>{step.status === 'started' ? 'running' : step.status === 'done' ? 'done' : 'failed'}</span>
        </li>)}</ol>
    </details>;
}

function Message({ entry, pending, status }: { entry: TranscriptEntry; pending?: boolean; status?: string }) {
    return <article className={`message ${entry.role}`}>
        {entry.role === 'assistant' && <div className="head"><span className="avatar" aria-hidden="true">✦</span>Local Copilot
            {entry.agent && <span className="agent-pill" title={`Project agent: ${entry.agent.name}`}>◆ {entry.agent.name}</span>}
            {entry.model && <span className="model-pill" title={entry.model.reason}
                aria-label={`${entry.model.label} selected ${entry.model.name}. ${entry.model.reason}`}>
                <span className="model-dot" aria-hidden="true"/>
                <strong>{entry.model.label}</strong><span className="model-name">· {entry.model.name}</span>
            </span>}
        </div>}
        {pending && !entry.content ? <div className="thinking">{status || 'Working…'}</div>
            : entry.role === 'assistant' ? <BasicMarkdown content={entry.content} />
                : <div className="para">{entry.content}</div>}
        {entry.steps && <ToolSteps steps={entry.steps} />}
        {entry.attachments && entry.attachments.length > 0 && <div className="attached-source">{entry.attachments.map((label, index) =>
            <span key={index}>Attached: {label}</span>)}</div>}
        {entry.changes && entry.changes.length > 0 && <div className="changes">{entry.changes.map((change, index) =>
            <div key={index}>{change.action === 'delete' ? 'Deleted ' : 'Changed '}{change.path}</div>)}</div>}
    </article>;
}

function Welcome() {
    return <div className="empty">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 1.5l1.6 4.9 4.9 1.6-4.9 1.6L8 14.5l-1.6-4.9L1.5 8l4.9-1.6z" /></svg>
        <div className="title">What are we building?</div>
        <p>A focused space to think through ideas, understand your code, and build with local models.</p>
        <div className="suggestions">{['Explain a piece of code', 'Help me improve this project'].map(text =>
            <button key={text} onClick={() => {
                const prompt = document.querySelector<HTMLTextAreaElement>('#prompt')!;
                prompt.value = text + ' ';
                prompt.dispatchEvent(new Event('input'));
                prompt.focus();
            }}>{text}</button>)}</div>
    </div>;
}

/** Owns one stable React tree for messages, streaming and agent activity. */
export function MessageFeed() {
    const [chat, setChat] = useState<Chat>();
    const [pending, setPending] = useState<{ prompt: string }>();
    const [task, setTask] = useState<LiveTask>();
    const [status, setStatus] = useState('');
    const current = useRef<{ sessionId: string; taskId?: string }>({ sessionId: '' });
    const pinned = useRef(true);
    const lastSession = useRef('');

    useEffect(() => {
        const onMessage = (event: MessageEvent<HostEvent>) => {
            const message = event.data;
            if (message.type === 'state') {
                current.current = { sessionId: message.chat.id, taskId: message.taskId };
                setChat(message.chat);
                setPending(message.pending);
                setStatus(message.status);
                setTask(previous => message.taskId && message.pending
                    ? previous?.taskId === message.taskId ? previous
                        : { sessionId: message.chat.id, taskId: message.taskId, content: '', steps: [] }
                    : undefined);
            } else if (message.type === 'status') {
                setStatus(message.text);
            } else if (message.type === 'assistantDelta' && message.taskId === current.current.taskId && message.sessionId === current.current.sessionId) {
                setTask(previous => previous?.taskId === message.taskId ? { ...previous, content: previous.content + message.text } : previous);
            } else if (message.type === 'modelSelected' && message.taskId === current.current.taskId && message.sessionId === current.current.sessionId) {
                setTask(previous => previous?.taskId === message.taskId ? { ...previous, model: message.model } : previous);
            } else if (message.type === 'toolActivity' && message.taskId === current.current.taskId && message.sessionId === current.current.sessionId) {
                setTask(previous => {
                    if (!previous || previous.taskId !== message.taskId) return previous;
                    const steps = [...previous.steps];
                    const index = steps.findIndex(step => step.id === message.stepId);
                    const step = { id: message.stepId, summary: message.summary, status: message.status };
                    if (index === -1) steps.push(step);
                    else steps[index] = step;
                    return { ...previous, steps };
                });
            }
        };
        const onScroll = () => {
            pinned.current = destination.scrollHeight - destination.scrollTop - destination.clientHeight < 60;
        };
        window.addEventListener('message', onMessage);
        destination.addEventListener('scroll', onScroll);
        return () => {
            window.removeEventListener('message', onMessage);
            destination.removeEventListener('scroll', onScroll);
        };
    }, []);

    useLayoutEffect(() => {
        if (chat?.id !== lastSession.current) {
            lastSession.current = chat?.id || '';
            pinned.current = true;
        }
        if (pinned.current) destination.scrollTop = destination.scrollHeight;
    }, [chat, pending, task]);

    return createPortal(<>
        {chat?.transcript.map((entry, index) => <Message key={`${chat.id}-${index}`} entry={entry} />)}
        {pending && <>
            <Message entry={{ role: 'user', content: pending.prompt }} pending />
            <Message entry={{ role: 'assistant', content: task?.content ?? '', steps: task?.steps, model: task?.model }} status={status} pending />
        </>}
        {!chat?.transcript.length && !pending && <Welcome />}
    </>, destination);
}
