# Runtime model routing: design and verification

## Research and decision

As of November 2026:

- [GitHub Copilot Auto](https://docs.github.com/en/copilot/concepts/models/auto-model-selection) evaluates task complexity and model availability. It selects at natural request/cache boundaries. Its Efficiency, Balance and Intelligence tiers inform our Fast, Balanced and Quality choices, but our local implementation does **not** claim to reproduce GitHub's proprietary routing or health signals.
- [VS Code's model picker](https://code.visualstudio.com/updates/v1_110/) puts Auto first, groups installed choices and shows capability details. [VS Code's model documentation](https://code.visualstudio.com/docs/agent-customization/language-models) shows which model served a reply on hover. We use native grouped selects and a compact per-response badge because the sidebar is narrow.
- [Aider's architect/editor mode](https://aider.chat/docs/usage/modes.html) uses multiple models in one task when their distinct strengths justify the second inference, at extra latency. [Continue](https://docs.continue.dev/customize/model-roles/00-intro) uses separate model roles for chat, edit, autocomplete and embeddings. Local Copilot already has Chat, Agent and Plan modes and a tool-call agent loop; adding a second agent harness or model-call chain is not justified yet.
- [Ollama's `/api/tags`](https://docs.ollama.com/api/tags) supplies installed names, parameter counts, quantization and disk sizes. `/api/show` supplies capability flags. [Ollama's residency settings](https://docs.ollama.com/faq) manage loaded models; this extension leaves automatic memory management to Ollama by default.

## Request path

1. The user chooses Auto (Balanced/Fast/Quality) or an exact model for the active Chat, Plan or Agent mode.
2. The extension refreshes installed model metadata from the configured Ollama server. Model discovery happens once per initial connection/refresh and can continue when a task is cancelled.
3. `chooseModel` applies a deterministic complexity heuristic to the prompt, attachment presence, history length and mode. It ranks candidates by reported parameter counts, using disk size as a rough fallback. Embedding-only models are excluded. Auto Agent and Plan require confirmed Ollama `tools` capability.
4. `runWithModelFallback` fixes the model for that request. If loading fails, it may try another eligible local model **only** before any streamed output or tool activity. Cancellation and unrelated errors do not trigger a retry.
5. Existing `runAgent` supplies the workspace tools, approval gates and read-only Plan constraints. It does not let the router bypass tool permissions.
6. The host sends a `modelSelected` event tagged with the task and session ID; the webview shows the selected model in the live response and persists it alongside the completed transcript.

## Deliberate limits

- No downloads, cloud fallback, paid provider, hidden classifier model, heuristic telemetry or scheduled background inference.
- Size is **not** equivalent to quality, tokens-per-second, tool reliability, available VRAM or benchmark performance. A large model may fail to load on a smaller machine; Auto's limited failover helps with load errors but cannot infer an optimal hardware fit.
- Changing models between prompts carries the textual chat history, not the prior model's hidden state or KV cache. No mid-tool-loop switches and no retries after output/tool side effects.
- Unknown tool capability cannot be auto-selected in Agent/Plan; it can be manually selected if the user knows the server is compatible. Hosts without modern `/api/show` metadata may need a newer Ollama version.
- The older CLI architect/editor handoff remains available for deliberate two-model workflows; it is not the default route.

## Verification matrix

| Case | Coverage |
| --- | --- |
| Quick and involved prompts across Fast/Balanced/Quality | `test/modelRouter.test.ts` |
| Tool-only Agent/Plan and rejection of embedding models | `test/modelRouter.test.ts`, `test/ollamaClient.test.ts` |
| Mixed or absent parameter-size metadata | `test/modelRouter.test.ts` |
| Per-request switching while preserving conversation history | `test/modelRoutingIntegration.test.ts` |
| Load failure fallback and no retries after output/side effects | `test/modelRouter.test.ts`, `test/modelRoutingIntegration.test.ts` |
| Webview picker, persistent model badge, stale task events | `test/browser/composer.spec.cjs` |
| Build, type checking, unit/integration suite | `npm test` |

For a full local validation, run `npm run test:webview` with Playwright Chromium installed, and test actual Ollama model loading in Windows VS Code with at least two pulled models (one tool-capable). Exercise mode changes, refresh, large-model load failures, slow model metadata, Stop task, and multiple chats. The CI/unit suite does not measure response quality, GPU memory use or actual inference latency.
