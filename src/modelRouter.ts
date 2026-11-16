import type { OllamaModel } from './ollamaClient';

export const AUTO_MODES = ['auto:balanced', 'auto:fast', 'auto:quality'] as const;
export type AutoMode = typeof AUTO_MODES[number];
export type AssistantMode = 'agent' | 'plan' | 'chat';
export type ModelCapability = 'tools' | 'chat' | 'unknown' | 'unsupported';
export type ModelCatalogEntry = OllamaModel & { capability: ModelCapability };

export type ModelChoice = {
    model: string;
    label: string;
    reason: string;
    automatic: boolean;
    /** Ordered alternatives are only for recoverable pre-output failures. */
    candidates: string[];
};

export function isAutoMode(value: string): value is AutoMode {
    return (AUTO_MODES as readonly string[]).includes(value);
}

export function parameterCount(value: string | undefined): number | undefined {
    if (!value) return undefined;
    const match = /^\s*(\d+(?:\.\d+)?)\s*([mbt])\s*$/i.exec(value);
    if (!match) return undefined;
    const multiplier = { m: 1e6, b: 1e9, t: 1e12 }[match[2].toLowerCase() as 'm' | 'b' | 't'];
    const result = Number(match[1]) * multiplier;
    return Number.isFinite(result) && result > 0 ? result : undefined;
}

function sizeRank(model: ModelCatalogEntry): number | undefined {
    // Ollama advertises parameter counts; disk size is a secondary proxy when missing.
    const parameters = parameterCount(model.details?.parameter_size);
    const disk = model.size && Number.isFinite(model.size) && model.size > 0 ? model.size : undefined;
    return parameters ?? (disk === undefined ? undefined : disk * 2);
}

function compareSize(a: ModelCatalogEntry, b: ModelCatalogEntry): number {
    const aRank = sizeRank(a);
    const bRank = sizeRank(b);
    if (aRank !== undefined && bRank !== undefined && aRank !== bRank) return aRank - bRank;
    return a.name.localeCompare(b.name);
}

/** A transparent heuristic, not a second LLM call or a hidden network dependency. */
export function taskComplexity(prompt: string, mode: AssistantMode, hasAttachment: boolean, historyCount: number): 'quick' | 'involved' {
    if (mode !== 'chat' && (hasAttachment || prompt.length > 180)) return 'involved';
    if (hasAttachment || prompt.length > 450 || prompt.split('\n').length > 5) return 'involved';
    if (/```|\b(refactor|architect|debug|investigate|implement|integration|multiple files|tests?|codebase|repository|step.by.step)\b/i.test(prompt)) return 'involved';
    if (mode !== 'chat' && historyCount > 8) return 'involved';
    return 'quick';
}

export function chooseModel(args: {
    selected: string;
    mode: AssistantMode;
    prompt: string;
    historyCount: number;
    hasAttachment: boolean;
    catalog: readonly ModelCatalogEntry[];
}): ModelChoice {
    const { selected, mode, prompt, historyCount, hasAttachment } = args;
    if (!selected) throw new Error('Choose a model before sending.');
    const installed = args.catalog.filter(model => model.name);
    if (!installed.length) throw new Error('No Ollama models are installed. Pull a model and refresh the list.');
    const requiresTools = mode !== 'chat';
    if (!isAutoMode(selected)) {
        const model = installed.find(item => item.name === selected);
        if (!model) throw new Error(`Model ${selected} is no longer installed. Refresh the model list.`);
        if (model.capability === 'unsupported')
            throw new Error(`${selected} cannot run chat requests. Choose a chat or tool-capable model.`);
        if (requiresTools && model.capability === 'chat')
            throw new Error(`${selected} does not support tools. Choose a tool-capable model or switch to Chat mode.`);
        return { model: selected, label: 'Manual', reason: 'Selected by you', automatic: false, candidates: [selected] };
    }

    // Auto requires confirmed tool support. Unknown capability is not permission to try tools.
    const eligible = installed.filter(item => item.capability !== 'unsupported' && (!requiresTools || item.capability === 'tools'));
    if (!eligible.length) throw new Error(requiresTools
        ? 'Auto needs a tool-capable model for Agent or Plan mode. Refresh models or choose Chat mode.'
        : 'Auto could not find an installed model.');

    // Unknown size must not masquerade as either the smallest or the largest model.
    const measured = eligible.filter(item => sizeRank(item) !== undefined).sort(compareSize);
    const unmeasured = eligible.filter(item => sizeRank(item) === undefined).sort((a, b) => a.name.localeCompare(b.name));
    const ranked = measured.length ? measured : unmeasured;
    const complexity = taskComplexity(prompt, mode, hasAttachment, historyCount);
    const tier = selected === 'auto:fast' ? 'Fast' : selected === 'auto:quality' ? 'Quality' : 'Balanced';
    const index = selected === 'auto:fast' ? 0
        : selected === 'auto:quality' || complexity === 'involved' ? ranked.length - 1
        : mode === 'chat' ? 0 : Math.floor((ranked.length - 1) / 2);
    const chosen = ranked[index];
    const candidates = [chosen, ...ranked.filter(item => item !== chosen).sort((a, b) => {
        const aIndex = ranked.indexOf(a);
        const bIndex = ranked.indexOf(b);
        return Math.abs(aIndex - index) - Math.abs(bIndex - index) || aIndex - bIndex;
    }), ...(measured.length ? unmeasured : [])].map(item => item.name);
    const why = !measured.length ? 'uses name order because model sizes are unavailable'
        : selected === 'auto:fast' ? 'prioritizes the smallest installed model'
        : selected === 'auto:quality' ? 'prioritizes the largest installed model'
            : complexity === 'involved' ? 'uses a larger model for an involved request'
                : 'uses a smaller model for a quick request';
    return { model: chosen.name, label: `Auto · ${tier}`, reason: `${tier} ${why}${requiresTools ? ' with tool support' : ''}.`, automatic: true, candidates };
}

/** Only unavailable-model and resource/capability failures are safe to retry. */
export function isRecoverableModelError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /(?:Ollama request failed \((?:404|429|500|502|503|507)\)|model .*not found|does not support tools?|does not support tool calling|out of memory|insufficient (?:memory|vram)|unable to load model)/i.test(message);
}

/** Retry only before text or tools are exposed; never replay approved side effects. */
export async function runWithModelFallback<T>(
    choice: ModelChoice,
    signal: AbortSignal,
    run: (model: string, markStarted: () => void) => Promise<T>,
    onSelected: (model: string, reason: string) => void
): Promise<{ result: T; model: string; reason: string }> {
    for (const [index, model] of choice.candidates.entries()) {
        signal.throwIfAborted();
        let started = false;
        const reason = index === 0 ? choice.reason : `Fallback from ${choice.candidates[index - 1]} after a model-load failure.`;
        onSelected(model, reason);
        try {
            const result = await run(model, () => { started = true; });
            return { result, model, reason };
        } catch (error) {
            if (signal.aborted || started || !choice.automatic || index === choice.candidates.length - 1 || !isRecoverableModelError(error))
                throw error;
        }
    }
    throw new Error('No Ollama model could complete this request.');
}
