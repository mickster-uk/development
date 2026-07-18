# agentBase

Electron app for building agent orchestrations visually. Draw a DAG of agents on a canvas; every connection carries criteria that an LLM gate evaluates at runtime. Run a project against Ollama and watch nodes and gates colour live, with a full audit trail of every edit and every run.

## Requirements

- **Local dependencies** — `marked` (markdown rendering for the debug panel), plus dev dependencies `electron`, `electron-builder`, and `jest`. Run `npm install` in the app folder before first use:

  ```bash
  cd ~/Desktop/development/agentBase
  npm install
  ```

- **Ollama** running locally (default endpoint `http://localhost:11434`) with at least one model pulled
- **Node.js** for running tests

## Run

```bash
cd ~/Desktop/development/agentBase
npm start
```

## Test

```bash
npm test
```

Unit tests live alongside the source (`lib/*.test.js`) and run with Jest, a declared devDependency.

## Build and deploy

```bash
npm run build
```

Same pipeline as Knowbase: bumps the patch version, builds unsigned dmg + zip into `dist/` with electron-builder, copies the `.app` into `/Applications`, and symlinks it on the Desktop (first build only). Platform variants: `npm run build:mac`, `build:win`, `build:linux`.

## Using it

1. **New project** in the sidebar (default name includes today's date, DD/MM/YYYY)
2. Above the canvas: **New agent** creates a blank node directly (opens AI-assist instead if "Guided creation" is set to `always`); **AI agent** (sparkle icon) always opens the AI-assist dialog. **Drag on empty canvas** creates a node too and additionally shows the create chooser popover when "Guided creation" is set to `ask` — the first node becomes the orchestrator, later ones are agents. Select a node to edit its name, role, model, and system prompt in the inspector
3. **Drag from a node's right port** onto another node to connect them. The criteria dialog opens — pick a node test (if the source node has any, listed first as "Node test: …"), a built-in template (Sceptical reviewer, Grounded in source, Scope guard, Devil's advocate, Confidence gate, Actionable output, Contains structured data, No refusal or deflection), or write your own; set the pass threshold (1–10, default 7) and the on-fail action: **block**, **retry** the source node, or **route** to another node. Tick "Save as new template" to add it to the registry. Connections that would create a cycle or duplicate an edge are rejected while dragging
4. Type the run input in the top bar and press **Run** (button becomes **Stop** while running)
5. Watch the canvas: node states colour live (running / passed / failed / skipped / cancelled) and gate diamonds show pass/fail
6. **Debug** tab — every agent call and criteria evaluation with full request/response; click a row to inspect (streaming output appears as it arrives, re-rendering as tokens land). Request JSON is syntax-coloured and responses render as markdown by default (both toggle in Settings); raw gate output is always shown as plain text; links in rendered markdown are inert
7. **Audit** tab — the edit trail: every node/edge change, rename, import/export, and run, timestamped — including `run-exported` / `run-export-failed` entries when **Save run outputs** is on
8. **Runs** tab — past runs with status and event count; click one to replay its events into the debug panel

Projects autosave (800 ms debounce). **Export**/**Import** in the top bar moves a project as a `.agentbase.json` file, bundling any criteria templates it uses.

### AI-assisted agent creation

Triggered by the **AI agent** button, by dragging on empty canvas when "Guided creation" is set to `always`, or by picking "AI-assist" from the create chooser when it's set to `ask`.

1. **Describe** the agent in a few sentences (Cmd/Ctrl+Enter submits)
2. **Interview** — the assist model asks up to 8 follow-up questions, one at a time, to fill gaps in purpose, inputs, outputs, constraints, tone, and test scenarios. For each question: answer it, **Skip question** (the model decides itself), **Generate now** (stop early and write the config from what's known), or **Cancel**. The model can also finish early once it judges the spec complete
3. **Preview** — editable name, model (dropdown of installed models, empty = project default), system prompt, and 2–4 suggested tests (each an example input plus pass criteria; remove any with the trash icon). **Regenerate** re-runs generation with the same answers; **Add to canvas** drops the node at the point the flow was opened from
4. If Ollama is unreachable, an inline error appears with **Try again**

Generation is grounded against markdown agent definitions from the configured **Agent definitions folder** (see Settings): `tester.md` and `test-data.md` are always included if present, plus the single closest match by name/description overlap with the description and answers, up to a 12 KB reference budget. These are used as style/structure reference only — the generated prompt is original text.

## Keyboard and canvas

| Shortcut | Action |
|---|---|
| Cmd/Ctrl+R | Run / stop |
| Cmd/Ctrl+B | Toggle sidebar |
| Cmd/Ctrl+I | Toggle inspector |
| Cmd/Ctrl+J | Toggle debug drawer |
| Cmd/Ctrl+= / Cmd/Ctrl+- | Zoom in / out |
| Shift+1 | Zoom to fit |
| Delete / Backspace | Delete selected node or connection |
| Escape | Clear selection |

Canvas gestures: drag on empty canvas = create node (chooser popover, blank node, or AI-assist, per the "Guided creation" setting); drag from a right port = connect; Space+drag or middle-button drag = pan; wheel = pan; Cmd/Ctrl+wheel = zoom at cursor.

Node cards show a role glyph in the header (orchestrator / agent / subagent). All toolbar and canvas icons are inline SVG, no icon-font or icon-package dependency.

## Settings (gear icon)

- **Ollama endpoint** (default `http://localhost:11434`)
- **Default model** — used by nodes without their own model (default `llama3.1:latest`)
- **Gate model** — model for criteria evaluation; empty = same as the node model
- **Assist model** — model used for the AI-assist interview and generation; empty = same as the default model
- **Guided creation** — behaviour when creating a node by dragging on empty canvas:
  - `always` — every new node opens the AI-assist dialog
  - `ask` (default) — a small chooser popover appears at the drop point: **Blank agent** or **AI-assist**
  - `never` — creates a blank agent directly; AI-assist is still available via the **AI agent** button
- **Agent definitions folder** (default `~/Documents/knowbase/Agents/definitions`) — markdown agent definitions read from here are used as reference material when AI-assist generates an agent
- **Max steps per run** (default 50)
- **Node timeout** in ms (default 120000)
- **Save run outputs as markdown** (default off) — writes one markdown file per finished run to the **Run outputs folder**
- **Run outputs folder** (default `~/Documents/knowbase/agentBase`)
- **Colour JSON in debug requests** (default on) — syntax-colours request JSON in the Debug tab
- **Render markdown in debug responses** (default on) — renders agent responses as markdown (GFM) in the Debug tab; raw gate output is never rendered as markdown

Config is saved as `config.json` in the Electron userData directory. Everything else lives there too:

```
<userData>/
  config.json                    settings, last-opened project, theme
  projects/<id>.json             one file per project
  criteria-templates.json        user-created criteria templates
  audit/<projectId>.edits.jsonl  append-only edit trail per project
  runs/<runId>.json              full event record + project snapshot per run
```

On macOS userData is `~/Library/Application Support/agentbase/`.

### Run output export

When **Save run outputs as markdown** is on, every finished run (any status) writes one file to the **Run outputs folder**, named:

```
DD-MM-YYYY-HHmmss-{project-slug}-{status}.md
```

e.g. `18-07-2026-143022-invoice-checker-success.md`. Contents:

- YAML frontmatter: `project`, `runId`, `status`, `started`, `finished`
- The run input
- One section per node, its final output only — retries collapse to the last attempt (errors and skips show the error message / skip reason instead)
- A **Gates** table: connection (`Source → Target`), outcome, score/threshold, reason

Success or failure of the write is logged to the project's Audit tab as `run-exported` (with the file path) or `run-export-failed` (with the error message); it never blocks or fails the run itself.

## Execution semantics

- Graphs must be a DAG with exactly one orchestrator; validation blocks cycles, self-edges, and edges without criteria
- The orchestrator runs first with the run input; downstream nodes receive the concatenated outputs of their passed incoming edges
- Each gate asks the gate model to score the source output 1–10 against the criteria text (temperature 0, seed 42, JSON-constrained); the edge passes if score ≥ threshold
- **Fail closed**: if the gate model returns unparseable JSON (after one retry prompt), the edge blocks
- On-fail **retry** re-runs the source node with the gate's feedback prepended (up to the retry limit, default 2); **route** sends the output to a chosen node instead
- Joins wait for all incoming edges to resolve and need at least one pass; a node with no passing input is skipped, and skips propagate downstream
- Every node run and gate evaluation counts one step towards the max-steps cap; anything beyond it is skipped and the run ends with status `max-steps`
- If Ollama becomes unreachable mid-run, the run pauses, polls every 3 s, and auto-resumes
