# agentBase Architecture

## Overview

`agentBase` is a standalone Electron application for managing agent orchestration projects. It supports multiple projects, a low-code canvas for defining nodes and connections, criteria templates, run-time auditing, and invocation history.

## Component architecture

- `main.js`
  - Creates the Electron window
  - Initializes stores and orchestrator
  - Exposes IPC handlers for project, template, audit, and execution operations
- `preload.js`
  - Bridges the main process APIs to the renderer via `contextBridge`
- `renderer/js/app.js`
  - Loads project and template data
  - Drives UI rendering for project lists, inspector, and debug panels
  - Handles user events for project actions and run execution
- `lib/project-store.js`
  - Persists projects in `%APPDATA%`/userData
- `lib/criteria-store.js`
  - Persists criteria templates in a single JSON file
- `lib/audit-store.js`
  - Persists execution history and audit records
- `lib/agent-orchestrator.js`
  - Skeleton runtime for executing a project graph and producing audit data

## Data model

### Project

- `id`
- `name`
- `description`
- `createdAt`
- `updatedAt`
- `settings`
  - `defaultModel`
  - `executionMode`
  - `timeoutMs`
- `canvas`
  - `nodes`
  - `edges`

### Criteria template

- `id`
- `name`
- `description`
- `expression`
- `fields`

### Invocation audit

- `id`
- `projectId`
- `projectName`
- `status`
- `startedAt`
- `finishedAt`
- `nodes`
- `summary`

## IPC map

- `get-config`
- `save-config`
- `list-projects`
- `load-project`
- `save-project`
- `delete-project`
- `duplicate-project`
- `get-criteria-templates`
- `save-criteria-template`
- `delete-criteria-template`
- `get-invocation-history`
- `get-invocation-details`
- `clear-history`
- `execute-project`
- `export-project`
- `import-project`
- `get-version`

## Execution flow

1. Renderer requests the project list
2. Main process loads projects from `agentbase-projects`
3. User selects/creates a project
4. Renderer saves changes via IPC
5. User runs the project
6. Main process executes the orchestration graph and records audit entries
7. Renderer displays trace and audit results

## Notes

- The app uses plain HTML, CSS, and JavaScript in the renderer.
- All application storage is isolated in Electron `userData`.
- The initial build is intentionally scaffolded with placeholder UI and runtime behavior, ready for iterative feature expansion.
