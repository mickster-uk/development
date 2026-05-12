# Bot Tester - Quick Start Guide

## 🚀 Getting Started

### Prerequisites
- **Node.js** 14+ installed
- **An LLM Service** running (Ollama is recommended)

### Step 1: Start Your LLM Service

If you're using **Ollama** (recommended):
```bash
# Install Ollama from https://ollama.ai/
# Then run:
ollama serve
```

This will start the Ollama service on `http://localhost:11434`

### Step 2: Start the Bot Tester App

```bash
cd /Users/mikefinch/Desktop/development/BotTester
npm start
```

The application will launch with a modern professional interface.

### Step 3: Configure Your Bots

1. **Click the ⚙️ Settings button** (top right)
2. **Enter the endpoint URL** (default: `http://localhost:11434` for Ollama)
3. **Click "Load Models"** to fetch available models
4. **Select models** for each bot:
   - Bot 1: Query Generator (optional, for future use)
   - Bot 2: Responder (required - generates answers)
   - Bot 3: Evaluator (required - judges correctness)
5. **Click "Save Settings"**

### Step 4: Run Your First Test

1. **Enter a query** in the input field
   - Example: "What is the capital of France?"
2. **Click "Run Test"** or press Ctrl+Enter (Cmd+Enter on Mac)
3. **Observe the results**:
   - **Left box**: Your query
   - **Right box**: Bot 2's response
     - **Green border**: Bot 3 deemed it correct ✓
     - **Red border**: Bot 3 deemed it incorrect ✗

## 📊 Understanding the Three-Bot System

```
User Query
    ↓
Bot 1: Query Generator
    ↓ (passes query to)
Bot 2: Responder (generates answer)
    ↓ (passes query + answer to)
Bot 3: Evaluator (determines if answer is correct)
    ↓
Results: Green (correct) or Red (incorrect)
```

## 🎨 UI Components

### Header
- **Logo**: Shows the app name with animated icon
- **Settings Button** (⚙️): Configure endpoint and models
- **History Button** (🕐): View past test results

### Main Content Area
- **Query Input**: Enter text to test
- **Left Result Box**: Displays the query (Bot 1)
- **Right Result Box**: Displays Bot 2's response
  - Changes color based on Bot 3's evaluation
  - Shows confidence and reasoning below
- **Evaluation Details**: Full evaluation from Bot 3

### Settings Panel
- Configure LLM endpoint
- Select models for each bot
- Load available models
- Save preferences

### History Panel
- View all past test results
- Click any result to reload it
- Clear all history

## ⚙️ Supported LLM Services

### Ollama (Recommended)
```bash
ollama serve
# Endpoint: http://localhost:11434
```

### Other Compatible Services
Any service with an `/api/generate` endpoint compatible with Ollama's API format.

## 🔧 Recommended Models

For best results, use capable models:
- **Bot 2 (Responder)**: `mistral`, `llama2`, `neural-chat`
- **Bot 3 (Evaluator)**: `mistral`, `neural-chat` (models good at analysis)

Smaller models like `tinyllama` work but may have lower accuracy.

## 📁 Project Structure

```
BotTester/
├── main.js                    # Electron main process
├── preload.js                # IPC security bridge
├── index.html                # UI markup
├── styles.css                # Modern professional styling
├── renderer.js               # UI logic and event handlers
├── package.json              # Project configuration
├── src/
│   └── bot-orchestrator.js   # Three-bot coordination logic
└── README.md                 # Full documentation
```

## 🐛 Troubleshooting

### "Cannot connect to endpoint"
- Make sure your LLM service is running (`ollama serve`)
- Verify the endpoint URL is correct
- Check if the service is accessible at that URL

### "No models found"
- Start your LLM service
- Pull a model first: `ollama pull mistral`
- Make sure you clicked "Load Models" button

### App won't start
- Delete `node_modules` and `package-lock.json`
- Run `npm install` again
- Make sure Node.js 14+ is installed

### Tests are slow
- Using large models (13B+ parameters) will be slower
- Increase timeout by editing `bot-orchestrator.js`
- Consider using smaller models for faster testing

## 💾 Data Storage

- **Config**: Stored in `~/Library/Application Support/Code/User/workspaceStorage/` (Electron user data)
- **History**: Saved as JSON for easy export/import
- **No internet required**: All processing is local

## 🎯 Tips for Best Results

1. **Use specific, clear queries** - Vague questions lead to unclear evaluations
2. **Same model for Bot 2 & 3** - Consistency can improve evaluation accuracy
3. **Test with multiple queries** - See patterns in Bot 3's evaluation style
4. **Export history** - Keep records of your tests for analysis

## 📝 Example Queries to Test

- "What is photosynthesis?"
- "How do I bake a chocolate cake?"
- "Explain quantum computing"
- "What are the benefits of exercise?"
- "Name the largest planet in our solar system"

## 🚀 Next Steps

1. Run `npm start` to launch the app
2. Configure your LLM service
3. Select your models
4. Start testing!

For more information, see README.md
