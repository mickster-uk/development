# Sample Knowledge Article

Replace this file with your own knowledge articles. Any `.md` or `.json` files you place in this folder (or subfolders) will be indexed by the RAG service and used to inform Bot 2's responses.

## How it works

When you run a test, Bot 2 automatically searches the knowledge base for content relevant to Bot 1's query and includes the top matching passages in its context window before generating a response.

## Adding articles

- **Markdown files** (`.md`): Drop them in this folder or any subfolder. The RAG service chunks them by heading and paragraph.
- **JSON files** (`.json`): Supported as arrays of strings or objects with key-value pairs.

## Re-indexing

Open Settings and click **Re-index Knowledge Base** after adding or updating files. New content is embedded on first index; unchanged content is loaded from cache so re-indexing is fast.

## Embedding model

The RAG service uses `nomic-embed-text` via Ollama. Make sure you have pulled it:

```
ollama pull nomic-embed-text
```
