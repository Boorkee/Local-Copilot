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
};

type OllamaChatResponse = {
	message?: {
		content?: string;
		tool_calls?: ToolCall[];
	};
	error?: string;
};

type OllamaRunningResponse = {
	models?: Array<{
		name?: string;
		model?: string;
	}>;
};

export class OllamaClient {
	private activeModel: string | undefined;
	private chatQueue: Promise<void> = Promise.resolve();

	constructor(
		private readonly baseUrl: string,
		private readonly timeoutMs: number,
		private readonly fetcher: typeof fetch = fetch
	) {}

	async listModels(): Promise<OllamaModel[]> {
		const result = await this.request<{ models?: OllamaModel[] }>('/api/tags');
		if (!Array.isArray(result.models)) {
			throw new Error('Ollama returned an invalid model list.');
		}
		return result.models;
	}

	async chat(model: string, prompt: string, history: ChatMessage[]): Promise<string> {
		const message = await this.complete(model, [...history, { role: 'user', content: prompt }]);
		return message.content;
	}

	complete(model: string, messages: OllamaMessage[], tools?: ToolDefinition[]): Promise<OllamaMessage> {
		const queued = this.chatQueue.then(() => this.performComplete(model, messages, tools));
		this.chatQueue = queued.then(() => undefined, () => undefined);
		return queued;
	}

	private async performComplete(model: string, messages: OllamaMessage[], tools?: ToolDefinition[]): Promise<OllamaMessage> {
		if (model !== this.activeModel) {
			await this.unloadLoadedModels();
		}

		const response = await this.request<OllamaChatResponse>('/api/chat', {
			model,
			messages,
			stream: false,
			tools
		});

		if (response.error) {
			throw new Error(`Ollama could not complete the chat: ${response.error}`);
		}

		const content = response.message?.content;
		const toolCalls = response.message?.tool_calls;
		if (toolCalls !== undefined && !Array.isArray(toolCalls)) {
			throw new Error('Ollama returned invalid tool calls.');
		}
		if (typeof content !== 'string' && !toolCalls?.length) {
			throw new Error('Ollama returned a chat response without message content.');
		}

		this.activeModel = model;
		return { role: 'assistant', content: content ?? '', tool_calls: toolCalls?.length ? toolCalls : undefined };
	}

	private async unloadLoadedModels(): Promise<void> {
		const previouslyActiveModel = this.activeModel;
		this.activeModel = undefined;
		const running = await this.request<OllamaRunningResponse>('/api/ps');
		if (!Array.isArray(running.models)) {
			throw new Error('Ollama returned an invalid loaded-model list; refusing to start another model.');
		}
		const models = new Set<string>();
		for (const entry of running.models) {
			const name = entry.name ?? entry.model;
			if (typeof name !== 'string' || !name) {
				throw new Error('Ollama returned an invalid loaded-model entry; refusing to start another model.');
			}
			models.add(name);
		}
		if (previouslyActiveModel) {
			models.add(previouslyActiveModel);
		}

		for (const loadedModel of models) {
			await this.request<unknown>('/api/generate', {
				model: loadedModel,
				prompt: '',
				stream: false,
				keep_alive: 0
			});
		}

		this.activeModel = undefined;
	}

	private async request<T>(path: string, body?: unknown): Promise<T> {
		const url = new URL(path, `${this.baseUrl.replace(/\/+$/, '')}/`);
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

		try {
			const response = await this.fetcher(url, {
				method: body === undefined ? 'GET' : 'POST',
				headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
				body: body === undefined ? undefined : JSON.stringify(body),
				signal: controller.signal
			});
			const responseText = await response.text();
			if (!response.ok) {
				throw new Error(`Ollama request failed (${response.status}): ${responseText.slice(0, 500)}`);
			}
			let result: unknown;
			try {
				result = JSON.parse(responseText);
			} catch {
				throw new Error(`Ollama returned invalid JSON from ${path}.`);
			}
			return result as T;
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') {
				throw new Error(`Ollama request timed out after ${this.timeoutMs} ms.`);
			}
			throw error;
		} finally {
			clearTimeout(timeout);
		}
	}
}
