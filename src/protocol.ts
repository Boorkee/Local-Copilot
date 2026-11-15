import type { Chat } from './chatStore';
import type { ReviewCard } from './reviewQueue';
import type { VoiceEvent } from './voiceInput';
import type { ModelCapability } from './modelRouter';
import { validAgentId, type ProjectAgentInfo } from './customAgents';

export const PROTOCOL_VERSION = 1;

export type WebviewMessage =
    | { type: 'ready' | 'startVoice' | 'stopVoice' | 'refreshModels' | 'refreshAgents' | 'stopTask' | 'openSettings' | 'attachEditor' }
    | { type: 'removeAttachment'; id: string }
    | { type: 'reviewDecision'; id: string; approved: boolean }
    | { type: 'openDiff'; id: string }
    | { type: 'openLocation'; path: string; line?: number }
    | { type: 'openExternal'; url: string }
    | { type: 'delegate'; chatModel: string; codeModel: string; task: string; prompt: string }
    | { type: 'sendMessage'; model: string; codeModel?: string; agentId?: string; prompt: string; mode?: 'agent' | 'chat' | 'plan' }
    | { type: 'applyCode' | 'copyCode'; code: string };

export type TaskStatus = 'done' | 'failed' | 'cancelled';

export type HostEvent = VoiceEvent
    | { type: 'state'; chat: Chat; busy: boolean; pending?: { prompt: string }; status: string; review: ReviewCard | null; commandOutput: string; taskId?: string }
    | { type: 'status'; text: string }
    | { type: 'error'; text: string; prompt?: string }
    | { type: 'review'; review: ReviewCard | null }
    | { type: 'commandOutput'; text: string; reset?: boolean }
    | { type: 'connection'; state: 'loading' | 'ready' | 'empty' | 'error'; text?: string }
    | { type: 'models'; models: string[]; defaultModel: string; defaultCodeModel: string;
        capabilities?: Record<string, ModelCapability> }
    | { type: 'agents'; agents: ProjectAgentInfo[]; error?: string }
    | { type: 'attachments'; items: Array<{ id: string; label: string }> }
    | { type: 'taskStarted'; taskId: string; sessionId: string }
    | { type: 'modelSelected'; taskId: string; sessionId: string; model: { name: string; label: string; reason: string } }
    | { type: 'assistantDelta'; taskId: string; sessionId: string; text: string }
    | { type: 'toolActivity'; taskId: string; sessionId: string; stepId: string; summary: string; status: 'started' | 'done' | 'failed' }
    | { type: 'taskFinished'; taskId: string; sessionId: string; status: TaskStatus };

function record(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function string(value: unknown, limit: number): value is string {
    return typeof value === 'string' && value.length <= limit;
}

/** The webview is untrusted: validate messages before any host-side action. */
export function parseWebviewMessage(value: unknown): WebviewMessage | undefined {
    if (!record(value) || typeof value.type !== 'string') return;
    switch (value.type) {
        case 'ready': case 'startVoice': case 'stopVoice': case 'refreshModels':
        case 'refreshAgents': case 'stopTask': case 'openSettings': case 'attachEditor':
            return { type: value.type };
        case 'removeAttachment':
            if (string(value.id, 128) && value.id.length > 0) return { type: value.type, id: value.id };
            return;
        case 'reviewDecision':
            if (string(value.id, 128) && value.id.length > 0 && typeof value.approved === 'boolean')
                return { type: value.type, id: value.id, approved: value.approved };
            return;
        case 'openDiff':
            if (string(value.id, 128) && value.id.length > 0) return { type: value.type, id: value.id };
            return;
        case 'openLocation':
            if (string(value.path, 4096) && value.path.length > 0 &&
                (value.line === undefined || (Number.isInteger(value.line) && (value.line as number) >= 1 && (value.line as number) <= 1_000_000)))
                return { type: value.type, path: value.path, line: value.line as number | undefined };
            return;
        case 'openExternal':
            if (!string(value.url, 2048)) return;
            try {
                const url = new URL(value.url);
                if ((url.protocol === 'https:' || url.protocol === 'http:') && url.hostname)
                    return { type: value.type, url: value.url };
            } catch { /* Invalid URLs are not opened by the host. */ }
            return;
        case 'delegate':
            if (string(value.chatModel, 256) && string(value.codeModel, 256) && string(value.task, 50_000) && string(value.prompt, 50_000))
                return { type: value.type, chatModel: value.chatModel, codeModel: value.codeModel, task: value.task, prompt: value.prompt };
            return;
        case 'sendMessage':
            if (!string(value.model, 256) || !string(value.prompt, 50_000) ||
                (value.codeModel !== undefined && !string(value.codeModel, 256)) ||
                (value.agentId !== undefined && (!string(value.agentId, 48) || !validAgentId(value.agentId))) ||
                (value.mode !== undefined && value.mode !== 'chat' && value.mode !== 'agent' && value.mode !== 'plan')) return;
            return { type: value.type, model: value.model, codeModel: value.codeModel as string | undefined,
                prompt: value.prompt, ...(value.agentId !== undefined ? { agentId: value.agentId } : {}),
                mode: value.mode as 'agent' | 'chat' | 'plan' | undefined };
        case 'applyCode': case 'copyCode':
            if (string(value.code, 200_000)) return { type: value.type, code: value.code };
            return;
        default:
            return;
    }
}
