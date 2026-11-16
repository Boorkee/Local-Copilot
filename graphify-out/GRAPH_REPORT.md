
## Coverage and integrity notes

- 55 input files: 50 code/configuration, four documents, and one SVG. Dependencies and build outputs were excluded using project ignore rules.
- Graphify 0.9.111; AST extraction and Leiden community detection ran locally. Documentation extraction used this Codex session. The SVG was interpreted from its complete markup.
- Ten code files yielded no symbols; file-level nodes can still exist. These include the Windows speech script and several tests. This is a structural map, not complete runtime behavior coverage.
- Integrity check: no dangling endpoints, missing endpoints, or self-loops. The default undirected graph combines 46 additional relationships sharing endpoints; the complete extraction is retained in EXTRACTION.json for audit. GRAPH_HEALTH.txt contains the diagnostics.
- Semantic token usage is unavailable from the subagent tool. Any generated zero-token values below are placeholders, not measured totals; no separate model API was invoked.
- graphify-out/ is a new untracked directory in the project. No project source files were changed by this graph build.

# Graph Report - Local-Copilot  (2026-11-16)

## Corpus Check
- Corpus is ~34,811 words - fits in a single context window. You may not need a graph.

## Summary
- 498 nodes · 939 edges · 31 communities (27 shown, 4 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 30 edges (avg confidence: 0.85)
- Token cost: semantic usage unavailable; AST extraction ran locally without a model API.

## Community Hubs (Navigation)
- Chat sidebar lifecycle
- Product and routing documentation
- Continuous integration and releases
- Extension settings and commands
- Model selection and fallback
- Review cards and effects
- Chat history and messages
- Ollama client and handoff
- Workspace change review
- Extension TypeScript configuration
- Agent prompts and models
- Webview protocol and profiles
- Workspace tool execution
- Extension package metadata
- Coding task delegation
- Development dependencies
- Voice input and processes
- Filesystem integration tests
- Extension activation and commands
- Webview TypeScript configuration
- Build and package scripts
- Test TypeScript configuration
- Ollama request tests
- Browser composer tests
- Webview build pipeline
- Webview preview server
- Secure webview HTML
- Workspace trust capabilities
- Repository metadata
- Copilot visual identity

## God Nodes (most connected - your core abstractions)
1. `ChatViewProvider` - 31 edges
2. `WorkspaceTools` - 27 edges
3. `OllamaClient` - 24 edges
4. `ChatStore` - 18 edges
5. `Local Copilot` - 17 edges
6. `compilerOptions` - 14 edges
7. `scripts` - 10 edges
8. `Runtime model routing design` - 10 edges
9. `chooseModel()` - 9 edges
10. `delegateCodingTask()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `Evidence-based correctness review` --semantically_similar_to--> `Routing verification matrix`  [INFERRED] [semantically similar]
  .github/agents/bug-logic-reviewer.agent.md → docs/model-routing.md
- `createClient()` --calls--> `OllamaClient`  [EXTRACTED]
  test/ollamaClient.test.ts → src/ollamaClient.ts
- `choose()` --calls--> `chooseModel()`  [EXTRACTED]
  test/modelRouter.test.ts → src/modelRouter.ts
- `Window` --references--> `ReviewCard`  [EXTRACTED]
  webview/effects.tsx → src/reviewQueue.ts
- `Local Copilot` --references--> `Runtime model routing design`  [EXTRACTED]
  README.md → docs/model-routing.md

## Import Cycles
- None detected.

## Communities (31 total, 4 thin omitted)

### Community 0 - "Chat sidebar lifecycle"
Cohesion: 0.11
Nodes (6): ChatStore, makeTitle(), activate(), ChatViewProvider, ReviewQueue, VoiceInput

### Community 1 - "Product and routing documentation"
Cohesion: 0.06
Nodes (22): Bug and Logic Reviewer, Aider architect editor mode, chooseModel, Continue model roles, GitHub Copilot Auto, modelSelected event, runAgent, Runtime model routing design (+14 more)

### Community 2 - "Continuous integration and releases"
Cohesion: 0.06
Nodes (41): jobs, release, test, webview, node, os, name, on (+33 more)

### Community 3 - "Extension settings and commands"
Cohesion: 0.06
Nodes (33): properties, title, contributes, commands, configuration, menus, views, viewsContainers (+25 more)

### Community 4 - "Model selection and fallback"
Cohesion: 0.11
Nodes (21): replaceEditorText(), SelectionLike, TextDocumentLike, getEditorReplacementRange(), OffsetRange, AssistantMode, AUTO_MODES, AutoMode (+13 more)

### Community 5 - "Review cards and effects"
Cohesion: 0.11
Nodes (22): dependencies, border-beam@^1.4.1, diff@^9.0.0, liquid-gooey@^0.2.2, react@^19.3.1, react-dom@^19.3.1, react-markdown@^10.1.0, remark-gfm@^4.0.1 (+14 more)

### Community 6 - "Chat history and messages"
Cohesion: 0.13
Nodes (17): Chat, ChatSummary, MAX_CHATS, Storage, TranscriptEntry, HostEvent, Effects(), BasicMarkdown() (+9 more)

### Community 7 - "Ollama client and handoff"
Cohesion: 0.15
Nodes (6): HANDOFF_USAGE, HandoffArgs, parseHandoffArgs(), main(), ChatAccumulator, OllamaClient

### Community 8 - "Workspace change review"
Cohesion: 0.14
Nodes (12): createChangeReviewer(), ReviewDecision, ReviewUi, ToolDefinition, DELEGATE_TOOL_NAME, execFileAsync, isInside(), OpenDocuments (+4 more)

### Community 9 - "Extension TypeScript configuration"
Cohesion: 0.12
Nodes (16): compilerOptions, esModuleInterop, lib, module, noImplicitReturns, noUnusedLocals, noUnusedParameters, outDir (+8 more)

### Community 10 - "Agent prompts and models"
Cohesion: 0.15
Nodes (11): AgentOptions, AgentResult, PLAN_PROMPT, SYSTEM_PROMPT, CompletionOptions, ModelResidencyPolicy, OllamaChatResponse, OllamaMessage (+3 more)

### Community 11 - "Webview protocol and profiles"
Cohesion: 0.23
Nodes (13): agentDirectory(), listProjectAgents(), loadProjectAgent(), parseAgent(), ProjectAgent, ProjectAgentInfo, validAgentId(), parseWebviewMessage() (+5 more)

### Community 13 - "Extension package metadata"
Cohesion: 0.14
Nodes (13): activationEvents, allowScripts, esbuild@0.28.2, categories, description, displayName, engines, vscode (+5 more)

### Community 14 - "Coding task delegation"
Cohesion: 0.20
Nodes (13): runAgent(), AutoChatOptions, AutoChatResult, buildCodeTask(), CHAT_SYSTEM_PROMPT, chatWithDelegation(), delegateCodingTask(), delegateToolDefinition (+5 more)

### Community 15 - "Development dependencies"
Cohesion: 0.15
Nodes (13): devDependencies, @types/diff@^7.0.2, @types/node@^20.12.12, @types/react@^19.3.0, @types/react-dom@^19.3.0, @types/vscode@^1.90.0, typescript@^5.4.5, @types/diff (+5 more)

### Community 16 - "Voice input and processes"
Cohesion: 0.18
Nodes (6): directory, fs, path, result, { spawnSync }, VoiceEvent

### Community 18 - "Extension activation and commands"
Cohesion: 0.22
Nodes (7): runCommand(), ChatPickItem, ChatTurn, findDirtyDocument(), samePath(), unsavedDocuments, waitForModelRefresh()

### Community 19 - "Webview TypeScript configuration"
Cohesion: 0.18
Nodes (10): compilerOptions, jsx, lib, module, moduleResolution, noEmit, skipLibCheck, strict (+2 more)

### Community 20 - "Build and package scripts"
Cohesion: 0.20
Nodes (10): scripts, build:webview, compile, handoff, package, test, test:webview, vscode:prepublish (+2 more)

### Community 21 - "Test TypeScript configuration"
Cohesion: 0.22
Nodes (8): ./tsconfig.json, compilerOptions, outDir, rootDir, types, exclude, extends, include

### Community 22 - "Ollama request tests"
Cohesion: 0.25
Nodes (4): ChatMessage, CapturedRequest, clients, createClient()

### Community 23 - "Browser composer tests"
Cohesion: 0.29
Nodes (4): @playwright/test@^1.65.1, { defineConfig }, @playwright/test, { test, expect }

### Community 24 - "Webview build pipeline"
Cohesion: 0.33
Nodes (5): esbuild@^0.28.2, esbuild, esbuild, host, options

### Community 25 - "Webview preview server"
Cohesion: 0.33
Nodes (3): { createChatViewHtml }, fs, http

### Community 26 - "Secure webview HTML"
Cohesion: 0.70
Nodes (3): createChatViewHtml(), escapeAttribute(), getNonce()

### Community 27 - "Workspace trust capabilities"
Cohesion: 0.50
Nodes (4): capabilities, untrustedWorkspaces, description, supported

### Community 28 - "Repository metadata"
Cohesion: 0.67
Nodes (3): repository, type, url

## Knowledge Gaps
- **8 isolated node(s):** `./tsconfig.json`, `Two-model handoff CLI`, `Cross-platform CI`, `GitHub Copilot Auto`, `Aider architect editor mode` (+3 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 194 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `diff` connect `Review cards and effects` to `Extension package metadata`?**
  _High betweenness centrality (0.122) - this node is a cross-community bridge._
- **What connects `./tsconfig.json`, `Two-model handoff CLI`, `Cross-platform CI` to the rest of the system?**
  _8 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Chat sidebar lifecycle` be split into smaller, more focused modules?**
  _Cohesion score 0.11215686274509803 - nodes in this community are weakly interconnected._
- **Why does `contributes` connect `Extension settings and commands` to `Extension package metadata`?**
  _High betweenness centrality (0.089) - this node is a cross-community bridge._
- **Should `Product and routing documentation` be split into smaller, more focused modules?**
  _Cohesion score 0.06423034330011074 - nodes in this community are weakly interconnected._
- **Should `Continuous integration and releases` be split into smaller, more focused modules?**
  _Cohesion score 0.05807200929152149 - nodes in this community are weakly interconnected._
- **Should `Extension settings and commands` be split into smaller, more focused modules?**
  _Cohesion score 0.06060606060606061 - nodes in this community are weakly interconnected._