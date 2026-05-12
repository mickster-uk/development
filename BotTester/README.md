# Bot Tester

An advanced Electron application for testing bot responses with three-bot evaluation system.

## Features

- **Three-Bot System**:
  - **Bot 1**: Query Generator (receives user input)
  - **Bot 2**: Responder (generates responses to queries)
  - **Bot 3**: Evaluator (determines if Bot 2's response correctly answers Bot 1's query)

- **Modern Professional UI**:
  - Responsive dark theme design
  - Real-time visual feedback (green for correct, red for incorrect)
  - Smooth animations and transitions
  - Intuitive layout with query on left, response on right (lower position)

- **Features**:
  - Settings panel for configuring endpoints and models
  - Test history tracking
  - Export/import configurations
  - Support for multiple LLM endpoints (Ollama, etc.)

## Installation

1. Install dependencies:
```bash
npm install
```

2. Make sure you have an LLM service running (e.g., Ollama):
```bash
ollama serve
```

3. Start the app:
```bash
npm start
```

## Configuration

### Settings
- **LLM Endpoint**: URL of your LLM service (default: `http://localhost:11434`)
- **Bot 1 Model**: Model for query generation
- **Bot 2 Model**: Model for responding to queries
- **Bot 3 Model**: Model for evaluating responses

### Supported Services
- Ollama (https://ollama.ai/)
- Any OpenAI-compatible API endpoint

## Usage

1. **Configure Models**:
   - Click the ⚙️ Settings button
   - Enter your LLM endpoint URL
   - Click "Load Models" to fetch available models
   - Select models for each bot
   - Click "Save Settings"

2. **Run Tests**:
   - Enter a query in the input field
   - Click "Run Test" or press Ctrl+Enter
   - View results:
     - Left box: Original query
     - Right box: Bot 2's response (color-coded)
     - Green border/badge: Correct answer
     - Red border/badge: Incorrect answer

3. **View History**:
   - Click the 🕐 History button to see past tests
   - Click any history item to reload its results

## Project Structure

```
BotTester/
├── main.js                 # Electron main process
├── preload.js             # IPC bridge
├── index.html             # UI
├── styles.css             # Styling
├── renderer.js            # UI logic
├── package.json           # Dependencies
└── src/
    └── bot-orchestrator.js # Three-bot coordination logic
```

## Technical Stack

- **Framework**: Electron
- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **HTTP Client**: Axios
- **Storage**: JSON files in user data directory

## Building

```bash
npm run build
```

This will create distributable packages for your platform.

## Requirements

- Node.js 14+
- An LLM service running on the configured endpoint
- 1GB+ RAM

## License

MIT
