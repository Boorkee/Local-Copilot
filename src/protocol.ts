import type { Chat } from './chatStore';
import type { ReviewCard } from './reviewQueue';
import type { VoiceEvent } from './voiceInput';

export const PROTOCOL_VERSION = 1;

export type WebviewMessage =
    | { type: 'ready' | 'startVoice' | 'stopVoice' | 'refreshModels' | 'stopTask' | 'openSettings' }
    | { type: 'reviewDecision'; id: string; approved: boolean }
    | { type: 'openDiff'; id: string }
    | { type: 'delegate'; chatModel: string; codeModel: string; task: string; prompt: string }
    | { type: 'sendMessage'; model: string; codeModel?: string; prompt: string; mode?: 'agent' | 'chat' }
    | { type: 'applyCode' | 'copyCode'; code: string };

export type TaskStatus = 'done' | 'failed' | 'cancelled';

export type HostEvent = VoiceEvent
    | { type: 'state'; chat: Chat; busy: boolean; pending?: { prompt: string }; status: string; review: ReviewCard | null; commandOutput: string; taskId?: string }
    | { type: 'status'; text: string }
    | { type: 'error'; text: string; prompt?: string }
    | { type: 'review'; review: ReviewCard | null }
    | { type: 'commandOutput'; text: string; reset?: boolean }
    | { type: 'connection'; state: 'loading' | 'ready' | 'empty' | 'error'; text?: string }
    | { type: 'models'; models: string[]; defaultModel: string; defaultCodeModel: string }
    | { type: 'taskStarted'; taskId: string; sessionId: string }
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
        case 'stopTask': case 'openSettings':
            return { type: value.type };
        case 'reviewDecision':
            if (string(value.id, 128) && value.id.length > 0 && typeof value.approved === 'boolean')
                return { type: value.type, id: value.id, approved: value.approved };
            return;
        case 'openDiff':
            if (string(value.id, 128) && value.id.length > 0) return { type: value.type, id: value.id };
            return;
        case 'delegate':
            if (string(value.chatModel, 256) && string(value.codeModel, 256) && string(value.task, 50_000) && string(value.prompt, 50_000))
                return { type: value.type, chatModel: value.chatModel, codeModel: value.codeModel, task: value.task, prompt: value.prompt };
            return;
        case 'sendMessage':
            if (!string(value.model, 256) || !string(value.prompt, 50_000) ||
                (value.codeModel !== undefined && !string(value.codeModel, 256)) ||
                (value.mode !== undefined && value.mode !== 'chat' && value.mode !== 'agent')) return;
            return { type: value.type, model: value.model, codeModel: value.codeModel as string | undefined,
                prompt: value.prompt, mode: value.mode as 'agent' | 'chat' | undefined };
        case 'applyCode': case 'copyCode':
            if (string(value.code, 200_000)) return { type: value.type, code: value.code };
            return;
        default:
            return;
    }
}
