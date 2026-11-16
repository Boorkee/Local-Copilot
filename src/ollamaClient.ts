export type ChatMessage = {
	role: 'user' | 'assistant';
	content: string;
};

export type ToolCall = {
	function: {
		name: string;
		arguments: Record<string, unknown> | string;
	};
};

export type OllamaMessage = {
	role: 'system' | 'user' | 'assistant' | 'tool';
	content: string;
	tool_calls?: ToolCall[];
	tool_name?: string;
};

export type ToolDefinition = {
	type: 'function';
	function: {
		name: string;
		description: string;
		parameters: Record<string, unknown>;
	};
};

export type OllamaModel = {
	name: string;
	size?: number;
	details?: { parameter_size?: string; quantization_level?: string };
};

type OllamaChatResponse = {
	message?: {
		content?: string;
		tool_calls?: ToolCall[];
	};
	error?: string;
};

export type CompletionOptions = { signal?: AbortSignal; onDelta?: (text: string) => void };
export type ModelResidencyPolicy = 'automatic' | 'conserve' | 'keep';

/** Streamed Ollama calls may deliver content and tool arguments across many chunks. */
class ChatAccumulator {
    private content = '';
    private readonly calls: ToolCall[] = [];
    private readonly indexes = new Map<number, number>();
    private readonly argumentLengths: number[] = [];

    add(value: OllamaChatResponse, onDelta?: (text: string) => void): void {
        if (value.error) throw new Error(`Ollama could not complete the chat: ${value.error}`);
        const message = value.message;
        if (!message) return;
        if (message.content !== undefined && typeof message.content !== 'string') throw new Error('Ollama returned invalid message content.');
        if (message.content) {
            this.content += message.content;
            if (this.content.length > 1_000_000) throw new Error('Ollama reply exceeds the size limit.');
            onDelta?.(message.content);
        }
        if (message.tool_calls !== undefined && !Array.isArray(message.tool_calls)) throw new Error('Ollama returned invalid tool calls.');
        for (const raw of message.tool_calls ?? []) {
            if (!raw || typeof raw !== 'object' || !raw.function || typeof raw.function !== 'object')
                throw new Error('Ollama returned invalid tool calls.');
            const call = raw as { index?: number; function: { name?: unknown; arguments?: unknown } };
            const part = call.function;
            if ((part.name !== undefined && typeof part.name !== 'string') ||
                (part.arguments !== undefined && typeof part.arguments !== 'string' &&
                (typeof part.arguments !== 'object' || part.arguments === null || Array.isArray(part.arguments))))
                throw new Error('Ollama returned invalid tool calls.');
            const index = Number.isInteger(call.index) && (call.index ?? -1) >= 0 ? call.index! : undefined;
            let slot = index === undefined
                ? part.name === undefined && this.calls.length ? this.calls.length - 1 : undefined
                : this.indexes.get(index);
            if (slot === undefined) {
                if (this.calls.length >= 100) throw new Error('Ollama returned too many tool calls.');
                slot = this.calls.length;
                this.calls.push({ function: { name: '', arguments: '' } });
                this.argumentLengths.push(0);
                if (index !== undefined) this.indexes.set(index, slot);
            }
            const current = this.calls[slot].function;
            if (typeof part.name === 'string' && part.name && current.name !== part.name) {
                current.name = part.name.startsWith(current.name) ? part.name : current.name + part.name;
            }
            if (typeof part.arguments === 'string') {
                const length = (typeof current.arguments === 'string' ? this.argumentLengths[slot] : 0) + part.arguments.length;
                if (length > 200_000) throw new Error('Ollama tool arguments exceed the size limit.');
                this.argumentLengths[slot] = length;
                current.arguments = typeof current.arguments === 'string' ? current.arguments + part.arguments : part.arguments;
            } else if (part.arguments !== undefined) {
                const combined = { ...(typeof current.arguments === 'string' ? {} : current.arguments), ...(part.arguments as Record<string, unknown>) };
                const length = JSON.stringify(combined).length;
                if (length > 200_000) throw new Error('Ollama tool arguments exceed the size limit.');
                this.argumentLengths[slot] = length;
                current.arguments = combined;
            }
        }
    }

    result(): OllamaMessage {
        if (!this.content && !this.calls.length) throw new Error('Ollama returned a chat response without message content.');
        for (const call of this.calls) {
            if (!call.function.name) throw new Error('Ollama returned an incomplete tool call.');
            if (typeof call.function.arguments === 'string') {
                try {
                    const parsed: unknown = JSON.parse(call.function.arguments || '{}');
                    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid');
                    call.function.arguments = parsed as Record<string, unknown>;
                }
                catch { throw new Error('Ollama returned invalid streamed tool arguments.'); }
            }
        }
        return { role: 'assistant', content: this.content, tool_calls: this.calls.length ? this.calls : undefined };
    }
}

export class OllamaClient {
	private readonly requests = new Set<AbortController>();
	private readonly capabilities = new Map<string, 'tools' | 'chat' | 'unknown' | 'unsupported'>();
	private activeModel: string | undefined;
	private chatQueue: Promise<void> = Promise.resolve();

	constructor(
		private readonly baseUrl: string,
		private readonly timeoutMs: number,
		private readonly fetcher: typeof fetch = fetch,
        private readonly residency: ModelResidencyPolicy = 'automatic'
	) {}

	cancelRequests(): void { for (const request of this.requests) request.abort(); }

	async listModels(signal?: AbortSignal): Promise<OllamaModel[]> {
		const result = await this.request<{ models?: OllamaModel[] }>('/api/tags', undefined, signal);
		if (!Array.isArray(result.models)) {
			throw new Error('Ollama returned an invalid model list.');
		}
		if (!result.models.every(model => model && typeof model.name === 'string' && model.name.length > 0 && model.name.length <= 256 && !/[\r\n\0]/.test(model.name) &&
			(model.size === undefined || (typeof model.size === 'number' && Number.isFinite(model.size))) &&
			(model.details === undefined || (typeof model.details === 'object' && model.details !== null &&
				(model.details.parameter_size === undefined || typeof model.details.parameter_size === 'string')))))
			throw new Error('Ollama returned invalid model metadata.');
		return result.models;
	}

    cachedCapability(model: string): 'tools' | 'chat' | 'unknown' | 'unsupported' {
        return this.capabilities.get(model) ?? 'unknown';
    }

    async inspectModel(model: string, signal?: AbortSignal): Promise<'tools' | 'chat' | 'unknown' | 'unsupported'> {
        const info = await this.request<{ capabilities?: unknown }>('/api/show', { model }, signal);
        const capability = Array.isArray(info.capabilities) && info.capabilities.every(value => typeof value === 'string')
            ? info.capabilities.includes('tools') ? 'tools' : info.capabilities.includes('completion') ? 'chat'
                : info.capabilities.includes('embedding') ? 'unsupported' : 'unknown'
            : 'unknown';
        this.capabilities.set(model, capability);
        return capability;
    }

	async chat(model: string, prompt: string, history: ChatMessage[], options?: CompletionOptions): Promise<string> {
		const message = await this.complete(model, [...history, { role: 'user', content: prompt }], undefined, options);
		return message.content;
	}

	complete(model: string, messages: OllamaMessage[], tools?: ToolDefinition[], options: CompletionOptions = {}): Promise<OllamaMessage> {
		const queued = this.chatQueue.then(() => {
            options.signal?.throwIfAborted();
            return this.performComplete(model, messages, tools, options);
        });
		this.chatQueue = queued.then(() => undefined, () => undefined);
		return queued;
	}

	private async performComplete(model: string, messages: OllamaMessage[], tools: ToolDefinition[] | undefined, options: CompletionOptions): Promise<OllamaMessage> {
        // Never unload models owned by other clients; opt-in conserve unloads only our previous model.
        if (this.residency === 'conserve' && this.activeModel && model !== this.activeModel) {
            await this.request('/api/generate', { model: this.activeModel, prompt: '', stream: false, keep_alive: 0 }, options.signal);
            this.activeModel = undefined;
        }
        const result = await this.requestChat({
			model,
			messages,
			stream: true,
			tools,
            ...(this.residency === 'keep' ? { keep_alive: -1 } : {})
        }, options);
		this.activeModel = model;
		return result;
	}

	private async requestChat(body: unknown, options: CompletionOptions): Promise<OllamaMessage> {
        return this.withResponse('/api/chat', body, options.signal, async (response, signal) => {
            const accumulator = new ChatAccumulator();
            // Some proxies and test servers return a single JSON object even when streaming is requested.
            if (response.headers.get('content-type')?.includes('application/json')) {
                let value: OllamaChatResponse;
                try { value = await response.json() as OllamaChatResponse; }
                catch { throw new Error('Ollama returned invalid JSON from /api/chat.'); }
                signal.throwIfAborted();
                accumulator.add(value, options.onDelta);
                return accumulator.result();
            }
            if (!response.body) throw new Error('Ollama returned an empty response stream.');
            const reader = response.body.getReader();
            const cancelReader = () => { void reader.cancel().catch(() => undefined); };
            signal.addEventListener('abort', cancelReader, { once: true });
            const decoder = new TextDecoder();
            let buffer = '';
            const consume = (line: string) => {
                if (!line.trim()) return;
                let value: OllamaChatResponse;
                try { value = JSON.parse(line) as OllamaChatResponse; }
                catch { throw new Error('Ollama returned malformed streamed JSON.'); }
                accumulator.add(value, options.onDelta);
            };
            try {
                while (true) {
                    signal.throwIfAborted();
                    const { done, value } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    if (buffer.length > 1_000_000) throw new Error('Ollama stream event exceeds the size limit.');
                    let end: number;
                    while ((end = buffer.indexOf('\n')) !== -1) {
                        consume(buffer.slice(0, end).trim());
                        buffer = buffer.slice(end + 1);
                    }
                }
                buffer += decoder.decode();
                signal.throwIfAborted();
                consume(buffer.trim());
                return accumulator.result();
            } finally {
                signal.removeEventListener('abort', cancelReader);
                reader.releaseLock();
            }
        });
    }

	private async request<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
		return this.withResponse(path, body, signal, async response => {
            let result: unknown;
            try { result = await response.json(); }
            catch { throw new Error(`Ollama returned invalid JSON from ${path}.`); }
            return result as T;
        });
    }

    private async withResponse<T>(path: string, body: unknown, signal: AbortSignal | undefined,
        read: (response: Response, signal: AbortSignal) => Promise<T>): Promise<T> {
		const url = new URL(path, `${this.baseUrl.replace(/\/+$/, '')}/`);
		const controller = new AbortController();
		this.requests.add(controller);
		const externalAbort = () => controller.abort();
        signal?.addEventListener('abort', externalAbort, { once: true });
        if (signal?.aborted) controller.abort();
        let timedOut = false;
		const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, this.timeoutMs);

		try {
			const response = await this.fetcher(url, {
				method: body === undefined ? 'GET' : 'POST',
				headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
				body: body === undefined ? undefined : JSON.stringify(body),
				signal: controller.signal
			});
			if (!response.ok) {
				const responseText = await response.text();
				throw new Error(`Ollama request failed (${response.status}): ${responseText.slice(0, 500)}`);
			}
			const value = await read(response, controller.signal);
            controller.signal.throwIfAborted();
            return value;
		} catch (error) {
			if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
				throw new Error(timedOut ? `Ollama request timed out after ${this.timeoutMs} ms.`
                    : signal?.reason?.name === 'TimeoutError' ? 'Ollama request timed out while contacting the local server.'
                        : 'Ollama request cancelled.');
			}
            if (error instanceof TypeError) {
                throw new Error(`Cannot reach Ollama at ${url.origin}. Start Ollama and retry. If VS Code runs in WSL, SSH, or a container, set localCopilot.ollamaBaseUrl to an address reachable from that extension host.`);
            }
			throw error;
		} finally {
			clearTimeout(timeout);
            signal?.removeEventListener('abort', externalAbort);
            this.requests.delete(controller);
		}
	}
}
