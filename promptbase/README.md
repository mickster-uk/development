# Promptbase

Promptbase is a local Electron app for generating, refining, and saving AI prompts using Ollama models. It helps you turn rough ideas into reusable prompt templates, run queries against a selected model, and store prompt files in `knowbase/prompts/`.

## Features

- Rough idea input -> generated prompt candidates
- Ollama model selection for prompt generation and execution
- Template library with use-case explanation and qualifying questions
- Built-in template editor to create reusable templates from the app
- Template suggestion assistant for industry-standard prompt formats
- Response review and prompt enhancement workflow
- Saved prompts written as Markdown into `knowbase/prompts/`

## Requirements

- [Ollama](https://ollama.ai/) running locally
- At least one chat model pulled into Ollama, e.g. `llama3`
- Node.js installed for Electron

## Setup

```bash
cd promptbase
npm install
npm start
```

## Usage

1. Enter your rough idea.
2. Choose an optional template.
3. Refresh models and select a generator and task model.
4. Generate prompt candidates.
5. Run and refine the selected prompt.
6. Save the final prompt to `knowbase/prompts/`.
