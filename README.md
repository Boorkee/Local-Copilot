# Local Copilot

**A local-first AI coding assistant in your VS Code sidebar.**

Local Copilot connects VS Code to [Ollama](https://ollama.com/) so you can chat with models running on your own machine or on an Ollama server you control. Ask questions about your project, get help planning a change, or use an agent to inspect and edit workspace files—all without sending prompts to a hosted AI provider.

It is for developers who want an IDE-integrated assistant while choosing where their model runs, which model handles each task, and when proposed changes or commands are allowed to run.

## What you can do

- **Chat, plan, or work with an agent.** Chat is conversational, Plan can inspect but not modify your workspace, and Agent can use workspace tools to carry out coding tasks.
- **Choose how models are selected.** Auto routing picks among models already installed in Ollama, or choose a specific model yourself. Agent and Plan need a model that supports Ollama tool calling.
- **Review changes before they land.** File edits and deletions require your approval and can be inspected in VS Code's diff editor. Shell commands are shown for approval before execution.
- **Keep project conversations handy.** Chats are saved in VS Code and can be revisited, renamed, or deleted.
- **Bring relevant context into a prompt.** Use **+** in the composer to attach files or folders. The paperclip attaches the active editor or its selection.
- **Dictate prompts on supported Windows setups.** Voice input uses Windows speech recognition locally; typing is available on every supported platform.

Local Copilot is designed to keep you in control: model selection and routing happen locally in the extension, and there is no cloud-model fallback or automatic model download. Workspace text included in a prompt is sent to the Ollama endpoint you configure. Agent shell commands run with your account's permissions and are **not sandboxed**, so review each command before approving it.

## Get started

### Requirements

- VS Code 1.90 or newer
- [Ollama](https://ollama.com/download) running and reachable from the VS Code extension host
- At least one model installed in Ollama

For example, install a model from a terminal:

```sh
ollama pull qwen2.5-coder:7b
```

In Agent or Plan mode, use a model that supports tool calling. Ollama's [tool-calling documentation](https://docs.ollama.com/capabilities/tool-calling) explains model compatibility.

### Install

Download the `.vsix` asset from the project's [GitHub Releases](https://github.com/Boorkee/Local-Copilot/releases), then install it in VS Code using **Extensions: Install from VSIX...** from the Command Palette.

You can also run the extension from source:

```sh
npm install
npm run compile
```

Open the project in VS Code and press **F5** to launch an Extension Development Host.

### Start a conversation

1. Select the **Local Copilot** icon in the Activity Bar.
2. Choose Chat, Plan, or Agent, then choose Auto or a model.
3. Type a prompt and press Enter. Use **New Chat** and **Show Chats** in the sidebar title bar to manage conversations.

Auto · Balanced is the default. Auto selects from models already installed on your Ollama server; it does not download models. To connect to a server other than the default `http://127.0.0.1:11434`, set `localCopilot.ollamaBaseUrl` in VS Code settings.

The **+** picker accepts multiple selections. You can open it again to combine files and folders in the same message. A folder chip shows how many text files it includes. Each file contributes up to 6,000 characters, with 48,000 characters shared across attachments. A partial folder chip indicates that some content was skipped or shortened.

## How model selection works

Open the model picker and choose **Fast**, **Balanced**, or **Quality** under **Auto**. Selecting an installed model below the divider uses it directly. The router uses prompt characteristics and Ollama-reported model sizes; it is a deterministic heuristic, not another AI call. Fast favors smaller models, Quality favors larger ones, and Balanced varies its choice with the request.

Auto Agent and Plan only select models whose tool-calling support is confirmed by Ollama. A manually selected model is used as chosen, but still needs tool support for Agent and Plan. The response header shows which model handled the request. If a model fails to load, Auto can try another eligible model only before it has produced output or used a tool.

These choices are not guarantees of response quality or hardware fit. Larger models need more memory, and model size does not measure speed or tool reliability. See [model routing design and verification](docs/model-routing.md) for details.

## Agent, approvals, and workspace trust

Agent can search and read workspace files, inspect editor context and diagnostics, propose edits, and request shell commands. It does not get direct IDE access from Ollama: Local Copilot provides and validates the tools.

- **Plan is read-only.** File writes, deletions, and shell commands are not allowed in Plan mode.
- **File changes need your approval.** Review the proposed diff, then keep or reject it. A file changed while a review is open is not overwritten.
- **Commands need your approval.** Inspect the command, shell, and working directory before running it. Commands run as your user, are not sandboxed, and can have effects that file review cannot undo.
- **Trust the workspace.** Chat remains available in an untrusted workspace; agent tools and commands require a trusted workspace.

You can add project-specific agent profiles in the first workspace folder:

```text
.local-copilot/
  agents/
    reviewer.agent.md
```

Each `.agent.md` file provides instructions for a selectable Agent profile. Profiles do not grant additional tools or bypass approvals and workspace trust.

## Data and platform notes

Inference requests go to the Ollama endpoint configured in VS Code. Local Copilot does not provide a hosted model, cloud fallback, or automatic model downloads. When you attach editor text or ask Agent to read workspace files, that content can be included in prompts sent to that endpoint. There are no background file uploads.

The extension runs on Windows, macOS, and Linux. Voice input is currently limited to desktop VS Code running locally on Windows, with Windows PowerShell, an installed speech-recognition language pack, and microphone permission. Audio is handled by the system's local speech recognizer and is not sent to a transcription service. Remote extension hosts, WSL, Linux, and macOS currently support typing but not this voice-input feature.

If VS Code runs in WSL, SSH, or a container, `127.0.0.1` refers to the extension host environment. Configure `localCopilot.ollamaBaseUrl` to an address reachable from there.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `localCopilot.ollamaBaseUrl` | `http://127.0.0.1:11434` | Base URL of the Ollama HTTP API. |
| `localCopilot.defaultModel` | `auto:balanced` | Chat model or Auto tier used on startup. |
| `localCopilot.codeModel` | `auto:balanced` | Agent and Plan model or Auto tier used on startup. |
| `localCopilot.requestTimeoutMs` | `300000` | Maximum time to wait for an Ollama request. |
| `localCopilot.modelResidency` | `automatic` | Ollama model memory behavior: `automatic`, `conserve`, or `keep`. |

`automatic` leaves model residency to Ollama. `conserve` asks Ollama to unload the model Local Copilot previously used when switching, which may affect other clients sharing it. `keep` asks Ollama to retain the current model in memory.

## Development and tests

The extension is written in TypeScript, with a React-based webview. Node.js 20 or newer is used in CI.

```sh
npm install
npm run compile
npm test
```

`npm test` compiles the extension and webview, type-checks the tests, and runs the unit and integration suite. To run the browser-based webview tests, install Playwright's Chromium browser once and then run:

```sh
npx playwright install chromium
npm run test:webview
```

For development, `npm run watch` and `npm run watch:webview` can be run in separate terminals. Pull requests and pushes are tested on Windows, macOS, and Linux in CI.

## License

Local Copilot is licensed under the [GNU General Public License v3.0 only](LICENSE.md).
