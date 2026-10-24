# Local Copilot

A native VS Code sidebar chat extension backed by a local [Ollama](https://ollama.com/) server.

## Requirements

- VS Code 1.90 or newer
- Ollama running locally, with at least one model pulled

## Run from source

1. Open this folder in VS Code.
2. Run `npm install`.
3. Press `F5` to launch an Extension Development Host.
4. Open the Local Copilot icon in the Activity Bar, choose a model, and start chatting.

The default model is `qwen2.5-coder:7b`. The model picker is populated from Ollama's `/api/tags` endpoint. Configure `localCopilot.ollamaBaseUrl`, `localCopilot.defaultModel`, and `localCopilot.requestTimeoutMs` in VS Code settings as needed.

## Tests and CI

Run `npm test` to compile the extension and execute the unit tests. The tests cover Ollama requests and model unloading, sidebar HTML/CSP, editor replacement range selection, extension metadata, debug configuration, and the activity-bar icon.

GitHub Actions runs the compile and unit-test suite on Windows, macOS, and Linux for pushes and pull requests. Pushing a `v*` tag also builds a VSIX and attaches it to a GitHub Release.

## Model memory management

When changing models, the extension checks Ollama's loaded-model list and sends an empty `/api/generate` request with `keep_alive: 0` for each loaded model before it starts the selected model. This releases the previous model from VRAM rather than relying on Ollama's keep-alive timeout.

## Delegating coding tasks (chat model → code model → chat model)

Type `/code <task>` in the sidebar, or run the standalone script:

```
npm run compile
npm run handoff -- "your task" --workspace <dir> --chat-model <name> --code-model <name> [--allow-delete]
```

The chat model is unloaded, the code model runs with read/list/write/delete tools confined to the workspace, then the chat model is reloaded with a summary of what changed. You can keep talking to the chat model afterwards without it calling the code model again. Set the code model with `localCopilot.codeModel`. The code model must support Ollama tool calling. Deletes need confirmation (a modal in VS Code, `--allow-delete` in the CLI).

## Applying a response

Use **Apply to active editor** to write the latest response into the focused editor. It replaces the current selection; if there is no selection, it replaces the entire active document. The action is explicit, and the editor's normal undo history is preserved.
