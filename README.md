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

Run `npm test` to compile the extension and execute the unit tests. The tests cover Ollama streaming and cancellation, sidebar HTML/CSP, editor replacement range selection, extension metadata, debug configuration, and the activity-bar icon.

GitHub Actions runs the compile and unit-test suite on Windows, macOS, and Linux with Node 20 and 24 for pushes and pull requests. Pushing a `v*` tag also builds a VSIX and attaches it to a GitHub Release.

## Saved chats

Chats are saved automatically and survive moving the view, reloading, and restarting VS Code. Use the **New Chat** (+) and **Chat History** buttons in the view's title bar to start a chat or switch between saved chats; the history picker also lets you delete chats. The chat and code model pickers sit below the input box.

## Model memory management

Model residency defaults to `automatic`, letting Ollama manage its own memory without unloading models used by other clients. In settings, `conserve` requests unloading only the model Local Copilot previously used when switching, which can affect another client using that model. `keep` requests that Ollama keep the current model loaded. Responses stream as they arrive and can be stopped from the sidebar.

## Agent mode and inline approvals

**Agent** is the default mode. Ask normally: “fix this bug,” “create a settings page,” or “run the tests.” The selected **Code** model receives workspace tools directly; no `/code` prefix or small-model routing decision is required. **Chat** uses the Chat model for conversation without tools.

Agent tools can list, read, create, edit, and delete workspace files, inspect the active editor and selection, open files, read VS Code diagnostics, and run builds/tests or other shell commands. The extension supplies these tools and executes the model's requests; Ollama itself does not have IDE access. Choose an installed model that supports [Ollama tool calling](https://docs.ollama.com/capabilities/tool-calling), open and trust a workspace, and select that model in the Code picker. Model quality still determines how reliably it plans and uses tools; this does not implement every GitHub Copilot feature.

Every proposed file write or deletion shows a review card immediately above the input, with green additions, red removals, and +/− line counts. **Keep** applies the proposed write; **Revert** rejects it without changing the file. Deletes have their own approval. Files changed by you while a review is open are not overwritten. The old `reviewChanges` and `autoDelegate` sidebar settings have been retired: sidebar file reviews are always required and Agent mode is direct.

Every shell command shows its exact text, shell, and working directory and waits for **Run command** or **Reject**. Commands run in Windows PowerShell on Windows and `/bin/sh` elsewhere, with your account permissions; they are not sandboxed. Shell side effects are not covered by the file-tool Keep/Revert controls. Output and exit status return to the model and appear in an expandable output area. Commands are noninteractive, limited to two minutes and 64 KB of output. **Stop task** cancels pending approvals and terminates the running command process tree. Changing chats or closing the view also cancels the active task.

The older `/code` handoff is still accepted for compatibility. The standalone CLI remains available:

```
npm run compile
npm run handoff -- "your task" --workspace <dir> --chat-model <name> --code-model <name> [--allow-delete]
```

The CLI does not provide the sidebar's command execution or IDE tools.

## Ollama connection troubleshooting

A connection failure while loading the model list leaves the model pickers empty. Start the Ollama application (or `ollama serve` if it is not running), then choose **Retry connection**. `ollama list` shows installed models. The default server is `http://127.0.0.1:11434`; **Connection settings** opens `localCopilot.ollamaBaseUrl`.

Requests originate from the VS Code extension host. When using WSL, SSH, or containers, `127.0.0.1` refers to that host, not necessarily the Windows computer running Ollama. Configure an address reachable from that environment. The sidebar distinguishes connection errors, an empty model list, and a connected server; retries do not discard your draft.

## Applying a response

Use **Apply to active editor** to write the latest response into the focused editor. It replaces the current selection; if there is no selection, it replaces the entire active document. The action is explicit, and the editor's normal undo history is preserved.

## Polished input and local voice

The sidebar bundles four [Libraries.dev](https://libraries.dev/) effects: Border Beam around the composer, Thinking Orbs while the agent works, Gooey for the Type/Speak selector, and Voice Glow driven by actual microphone levels. No other effect modules are included. Assets ship inside the extension, with no CDN requests. Effects follow the VS Code theme, pause when hidden, and respect reduced-motion preferences.

Choose **Speak → Start listening** to dictate into the draft. Choose **Stop**, review or edit the text, then send it. Enter sends; Shift+Enter inserts a newline. Speech never automatically sends a message or executes a command. Drafts survive webview reloads.

Voice input currently requires **Windows desktop VS Code running the extension locally**, Windows PowerShell, an installed Windows speech-recognition language pack, and microphone permission for desktop apps. It uses the default Windows input device and the system's local `System.Speech` recognizer; audio is not saved or sent to a transcription service. The voice glow reflects measured audio levels. Windows recognition accuracy depends on the installed recognizer, microphone, and speech language.

VS Code webviews restrict direct microphone access, so a bundled native helper handles capture. Recording stops on Type mode, view hiding/disposal, chat switching, extension shutdown, or after two minutes. Startup failures and unsupported hosts display an actionable message. Linux, macOS, WSL, and remote extension hosts do not currently provide native dictation; typing remains available. This is speech-to-text input, not spoken replies.

### UI development and checks

`npm run compile` builds both the extension and its bundled React effects. Run `npm run watch` and `npm run watch:webview` in separate terminals while developing. Run `npm test` for unit and recorder lifecycle tests. For browser checks, run `npx playwright install chromium` once, then `npm run test:webview`. The browser harness mocks VS Code and microphone events; validate actual audio capture separately in Windows VS Code using the default microphone, including permission denial and hiding the sidebar while recording.
