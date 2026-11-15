# Local Copilot

A native VS Code sidebar chat extension backed by a local [Ollama](https://ollama.com/) server.

## Requirements

- VS Code 1.90 or newer
- Ollama running locally, with at least one model pulled

## Run from source

1. Open this folder in VS Code.
2. Run `npm install`.
3. Press `F5` to launch an Extension Development Host.
4. Open the Local Copilot icon in the Activity Bar. Auto · Balanced is selected by default.

The model picker is populated from Ollama's `/api/tags` endpoint, with `/api/show` used to verify models that advertise tool calling. Configure `localCopilot.ollamaBaseUrl`, `localCopilot.defaultModel`, `localCopilot.codeModel`, and `localCopilot.requestTimeoutMs` in VS Code settings as needed.

## Automatic model switching

The composer separates **mode** (Agent, Plan, Chat), **routing** (Auto or Manual), and **model** selection. The default **Auto · Balanced** picks from models already installed in Ollama, independently for each request. You can also choose:

- **Auto · Fast:** prioritize the smallest available local model.
- **Auto · Quality:** prioritize the largest available local model.
- **Manual:** pick a specific installed Ollama model, remembered per mode. The installed-model menu stays visible but is blocked with a translucent explanation while Auto is on.

Balanced favors smaller models for short conversations and bigger ones for longer or more involved questions, code, attachments, and multi-step tasks. The router uses prompt characteristics and Ollama-reported parameter counts, falling back to disk size when needed; it is a small deterministic rule set, **not an extra LLM call**. It doesn't make quality or hardware-fit guarantees, and it never downloads models automatically. Pull more than one model for meaningful automatic switching. The size estimates don't measure benchmark quality or free VRAM.

Auto in Agent and Plan considers only models with **confirmed tool support** from `/api/show`. If that metadata is missing or no compatible model is installed, it explains how to proceed instead of silently running an incompatible model. Selecting a model manually overrides Auto; in Agent and Plan, the selected model must still support tools.

When a request starts, a badge in the assistant header shows **which model was actually used**, the Auto tier or Manual selection, and a hover explanation. The badge is saved with the chat. If a model fails to load, Auto may try another compatible model **only before any output or agent tool activity**; it will never replay a command or file edit. A model remains fixed for the duration of its request, including tool calls, so you do not lose intermediate context mid-task. Changing models across requests keeps conversation history, but does not magically transfer a model's internal state or KV cache.

Automatic switching follows Ollama's existing model memory policy. `automatic` lets Ollama schedule resident models, while `conserve` and `keep` are explicit opt-ins described below. You can see the loaded models with `ollama ps`. If larger models exceed your RAM/VRAM, choose Fast or select a smaller model manually.

The [routing design and verification notes](docs/model-routing.md) cover the Copilot/Aider/Continue research, algorithm, trade-offs and test matrix.

## Tests and CI

Run `npm test` to compile the extension and execute the unit tests. These cover streamed responses, partial tool calls, model residency, chat recovery, protocol validation, bounded workspace context, edit approvals, and other existing features. Run `npm run test:webview` after installing Playwright Chromium to check the UI, Markdown and accessibility-sensitive interactions.

GitHub Actions runs the compile and unit-test suite on Windows, macOS, and Linux with Node 20 and 24 for pushes and pull requests. Pushing a `v*` tag also builds a VSIX and attaches it to a GitHub Release.

## Saved chats

Chats are saved automatically and survive moving the view, reloading, and restarting VS Code. Use **New Chat** (+) and **Chat History** in the view title bar to switch sessions. The searchable history picker lets you rename or delete them. If VS Code closes during a task, the unfinished prompt is marked interrupted on next launch; operations are never resumed automatically.

## Model memory management

Model residency defaults to `automatic`, letting Ollama manage its own memory without unloading models used by other clients. In settings, `conserve` requests unloading only the model Local Copilot previously used when switching, which can affect another client using that model. `keep` requests that Ollama keep the current model loaded. Responses stream as they arrive and can be stopped from the sidebar.

## Agent mode and inline approvals

**Agent** is the default mode. Ask normally: “fix this bug,” “create a settings page,” or “run the tests.” The chosen model receives workspace tools directly; no `/code` prefix is required. **Plan** can search and inspect files but is strictly read-only: the host refuses writes, deletes, and shell commands. **Chat** uses its chosen model for conversation without workspace tools.

### Project agents

When in **Agent** mode, a second menu lets you choose the **Built-in agent** or a custom agent defined inside your project. Add one Markdown file per profile in the first workspace folder:

```
.local-copilot/
  agents/
    reviewer.agent.md
```

For example, `reviewer.agent.md` can contain:

```markdown
---
name: Code Reviewer
description: Focus on bugs, safety, and regressions
---
Inspect the relevant code first. Explain suspected issues and add focused tests when helpful.
```

The file name is the agent ID. `name` and `description` are optional single-line fields; the Markdown body supplies additional instructions. The menu refreshes when profiles change, and a profile is read again when the next request starts. Built-in Agent, Plan, and Chat modes are not themselves project profiles. Project instructions never grant new tools or bypass workspace trust, write reviews, or command approvals. For safety and responsiveness, profiles must be regular (not symlinked) files, with at most 32 profiles and a 20 KB limit per file. The selector uses the first workspace root only.

Agent tools can list and search workspace files (bounded excerpts with line numbers), read file ranges, inspect editor context, symbols, workspace diagnostics, and Git diffs; they can also create or delete files, propose unique text replacements, and request approved shell commands. The extension supplies and validates these tools; Ollama itself does not have IDE access. Choose a model with [Ollama tool calling](https://docs.ollama.com/capabilities/tool-calling), then open and trust a workspace. Unknown capabilities remain selectable; known Chat-only models are excluded from Agent selection. Tool search currently uses the first workspace root and skips common generated directories; it is not yet a full multi-root or indexed search service.

The paperclip icon attaches an explicit snapshot of the active editor or its selection (up to 6,000 characters, three attachments per message). Click a chip to remove it. These snippets go only to your configured Ollama endpoint with the prompt; source text is treated as untrusted context and never as approval. No files are uploaded in the background.

Every proposed file write or deletion shows a review card immediately above the input, with green additions, red removals, and +/− line counts. **Open full diff** previews the complete proposal using VS Code's native diff editor; **Keep** applies the proposed write and **Revert** rejects it. Deletes have their own approval. Files changed while a review is open are not overwritten. The old `reviewChanges` and `autoDelegate` settings have been retired: reviews are always required and Agent mode is direct.

Every shell command shows its exact text, shell, and working directory and waits for **Run command** or **Reject**. Commands run in Windows PowerShell on Windows and `/bin/sh` elsewhere, with your account permissions; they are not sandboxed. Shell side effects are not covered by the file-tool Keep/Revert controls. Output and exit status return to the model and appear in an expandable output area. Commands are noninteractive, limited to two minutes and 64 KB of output. **Stop task** cancels pending approvals and terminates the running command process tree. Changing chats or closing the view also cancels the active task.

The standalone two-model handoff CLI remains available for advanced workflows:

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

## Conversation rendering and bundle size

The conversation feed renders incrementally in React. It supports GitHub-flavored Markdown (headings, lists, tables, task lists, links, and fenced code blocks), with **Copy** and reviewed **Apply** actions for code. HTML from model responses is ignored; remote images are not loaded. External links require a click, and file/line links open only files validated inside the workspace. Tool activity and interrupted tasks remain visible in chat history.

The Markdown and GFM parser adds bundle weight: the webview grew from about 125 KB to 177 KB gzipped during this change (roughly +52 KB). This is a deliberate tradeoff for safe, standards-compliant rendering without adding a server or CDN. Cold-load and responsiveness should be measured on the target Windows machine before release; unit tests are not a substitute for that profiling.

## Polished input and local voice

The sidebar bundles four [Libraries.dev](https://libraries.dev/) effects: Border Beam around the composer, Thinking Orbs while the agent works, Gooey for the Type/Speak selector and popover accents, and Voice Glow driven by actual microphone levels. No other effect modules are included. Assets ship inside the extension, with no CDN requests. Controls have subtle tactile press feedback; panels and upward-opening menus use short opacity/transform transitions. With reduced motion enabled, pronounced movement and decorative effects are removed, but short fades and gradual voice-panel resizing remain so the interface never snaps abruptly. Effects follow the VS Code theme and pause when hidden.

Choose **Speak → Start listening** to dictate into the draft. Choose **Stop**, review or edit the text, then send it. Enter sends; Shift+Enter inserts a newline. Speech never automatically sends a message or executes a command. Drafts survive webview reloads.

Voice input currently requires **Windows desktop VS Code running the extension locally**, Windows PowerShell, an installed Windows speech-recognition language pack, and microphone permission for desktop apps. It uses the default Windows input device and the system's local `System.Speech` recognizer; audio is not saved or sent to a transcription service. The voice glow reflects measured audio levels. Windows recognition accuracy depends on the installed recognizer, microphone, and speech language.

VS Code webviews restrict direct microphone access, so a bundled native helper handles capture. Recording stops on Type mode, view hiding/disposal, chat switching, extension shutdown, or after two minutes. Startup failures and unsupported hosts display an actionable message. Linux, macOS, WSL, and remote extension hosts do not currently provide native dictation; typing remains available. This is speech-to-text input, not spoken replies.

### UI development and checks

`npm run compile` builds both the extension and its bundled React effects. Run `npm run watch` and `npm run watch:webview` in separate terminals while developing. Run `npm test` for unit and recorder lifecycle tests. For browser checks, run `npx playwright install chromium` once, then `npm run test:webview`. The browser harness mocks VS Code and microphone events; validate actual audio capture separately in Windows VS Code using the default microphone, including permission denial and hiding the sidebar while recording.
